from __future__ import annotations

import asyncio
import json
import logging
import signal
from threading import Event
from typing import Awaitable, Callable, Dict

import websockets
from websockets.asyncio.client import ClientConnection

from .types import MemberInfo, ReplyContext, Task

logger = logging.getLogger("arinova_agent")

TaskHandler = Callable[[Task], Awaitable[None] | None]

RECONNECT_INTERVAL = 5.0
PING_INTERVAL = 30.0


class ArinovaAgent:
    """SDK for connecting an AI agent to Arinova Chat."""

    def __init__(
        self,
        *,
        server_url: str,
        bot_token: str,
        reconnect_interval: float = RECONNECT_INTERVAL,
        ping_interval: float = PING_INTERVAL,
    ) -> None:
        self.server_url = server_url.rstrip("/")
        self.bot_token = bot_token
        self.reconnect_interval = reconnect_interval
        self.ping_interval = ping_interval

        self._task_handler: TaskHandler | None = None
        self._on_connected: Callable[[], None] | None = None
        self._on_disconnected: Callable[[], None] | None = None
        self._on_error: Callable[[Exception], None] | None = None
        self._stopped = False
        self._ws: ClientConnection | None = None
        self._active_tasks: Dict[str, Event] = {}

    def on_task(self, handler: TaskHandler) -> TaskHandler:
        """Register task handler. Can be used as a decorator."""
        self._task_handler = handler
        return handler

    def on_connected(self, callback: Callable[[], None]) -> None:
        self._on_connected = callback

    def on_disconnected(self, callback: Callable[[], None]) -> None:
        self._on_disconnected = callback

    def on_error(self, callback: Callable[[Exception], None]) -> None:
        self._on_error = callback

    def run(self) -> None:
        """Start the agent (blocking). Handles SIGINT/SIGTERM for graceful shutdown."""
        loop = asyncio.new_event_loop()

        def _shutdown() -> None:
            self._stopped = True
            if self._ws:
                loop.create_task(self._ws.close())

        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, _shutdown)
            except NotImplementedError:
                pass  # Windows doesn't support add_signal_handler

        try:
            loop.run_until_complete(self.connect())
        except KeyboardInterrupt:
            self._stopped = True
        finally:
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.close()

    async def connect(self) -> None:
        """Connect to the server (async). Reconnects automatically on disconnect."""
        self._stopped = False
        first_connect = True

        while not self._stopped:
            try:
                await self._connect_once(first_connect)
                first_connect = False
            except Exception as exc:
                if self._on_error:
                    self._on_error(exc)
                if self._stopped:
                    break
                logger.debug("Reconnecting in %.1fs...", self.reconnect_interval)
                await asyncio.sleep(self.reconnect_interval)

    async def disconnect(self) -> None:
        """Disconnect and stop reconnecting."""
        self._stopped = True
        if self._ws:
            await self._ws.close()

    async def _connect_once(self, is_first: bool) -> None:
        ws_url = f"{self.server_url}/ws/agent"
        async with websockets.connect(ws_url) as ws:
            self._ws = ws

            # Authenticate
            await ws.send(json.dumps({"type": "agent_auth", "botToken": self.bot_token}))

            # Wait for auth response
            raw = await ws.recv()
            data = json.loads(raw)

            if data.get("type") == "auth_error":
                error = Exception(f"Agent auth failed: {data.get('error', 'unknown')}")
                self._stopped = True  # Don't reconnect on auth error
                if self._on_error:
                    self._on_error(error)
                raise error

            if data.get("type") == "auth_ok":
                logger.info("Connected to Arinova (agent: %s)", data.get("agentName"))
                if self._on_connected:
                    self._on_connected()

            # Start ping task
            ping_task = asyncio.create_task(self._ping_loop(ws))

            try:
                async for raw_msg in ws:
                    try:
                        msg = json.loads(raw_msg)
                    except json.JSONDecodeError:
                        continue

                    if msg.get("type") == "pong":
                        continue

                    if msg.get("type") == "cancel_task":
                        task_id = msg.get("taskId", "")
                        cancel_event = self._active_tasks.get(task_id)
                        if cancel_event:
                            cancel_event.set()
                        continue

                    if msg.get("type") == "task":
                        asyncio.create_task(
                            self._handle_task(
                                ws,
                                msg["taskId"],
                                msg["conversationId"],
                                msg["content"],
                                conversation_type=msg.get("conversationType"),
                                members=msg.get("members"),
                                reply_to=msg.get("replyTo"),
                            )
                        )
            finally:
                ping_task.cancel()
                self._ws = None

            if self._on_disconnected:
                self._on_disconnected()

    async def _ping_loop(self, ws: ClientConnection) -> None:
        try:
            while True:
                await asyncio.sleep(self.ping_interval)
                await ws.send(json.dumps({"type": "ping"}))
        except asyncio.CancelledError:
            pass

    async def _handle_task(
        self,
        ws: ClientConnection,
        task_id: str,
        conversation_id: str,
        content: str,
        *,
        conversation_type: str | None = None,
        members: list[dict] | None = None,
        reply_to: dict | None = None,
    ) -> None:
        cancelled = Event()
        self._active_tasks[task_id] = cancelled

        def send_sync(event: dict) -> None:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(ws.send(json.dumps(event)))
            except RuntimeError:
                pass

        def on_complete(full: str) -> None:
            self._active_tasks.pop(task_id, None)
            send_sync({"type": "agent_complete", "taskId": task_id, "content": full})

        def on_error(error: str) -> None:
            self._active_tasks.pop(task_id, None)
            send_sync({"type": "agent_error", "taskId": task_id, "error": error})

        task = Task(
            task_id=task_id,
            conversation_id=conversation_id,
            content=content,
            send_chunk=lambda delta: send_sync({"type": "agent_chunk", "taskId": task_id, "chunk": delta}),
            send_complete=on_complete,
            send_error=on_error,
            conversation_type=conversation_type,
            members=[MemberInfo(agent_id=m["agentId"], agent_name=m["agentName"]) for m in members] if members else None,
            reply_to=ReplyContext(role=reply_to["role"], content=reply_to["content"], sender_agent_name=reply_to.get("senderAgentName")) if reply_to else None,
            cancelled=cancelled,
        )

        if not self._task_handler:
            task.send_error("No task handler registered")
            return

        try:
            result = self._task_handler(task)
            if asyncio.iscoroutine(result):
                await result
        except Exception as exc:
            task.send_error(str(exc))
            if self._on_error:
                self._on_error(exc)
        finally:
            self._active_tasks.pop(task_id, None)
