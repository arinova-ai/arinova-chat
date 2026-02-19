# arinova-agent-sdk

Python SDK for connecting AI agents to [Arinova Chat](https://github.com/arinova-ai/arinova-chat) via WebSocket. Supports streaming responses with automatic reconnection.

## Install

```bash
pip install arinova-agent-sdk
```

Requires Python 3.10+.

## Quick Start

```python
from arinova_agent import ArinovaAgent

agent = ArinovaAgent(
    server_url="https://chat.arinova.ai",
    bot_token="your-bot-token",
)

@agent.on_task
async def handle(task):
    # Stream chunks to the user
    for word in task.content.split():
        task.send_chunk(word + " ")

    # Signal completion with the full response
    task.send_complete("Echo: " + task.content)

agent.run()
```

`agent.run()` blocks the process and handles `SIGINT`/`SIGTERM` for graceful shutdown. If you are already inside an async context, use `await agent.connect()` instead:

```python
import asyncio
from arinova_agent import ArinovaAgent

agent = ArinovaAgent(
    server_url="https://chat.arinova.ai",
    bot_token="your-bot-token",
)

@agent.on_task
async def handle(task):
    task.send_chunk("Thinking...")
    task.send_complete("Done.")

asyncio.run(agent.connect())
```

## API Reference

### Constructor

```python
ArinovaAgent(
    server_url: str,           # Arinova Chat server URL
    bot_token: str,            # Bot authentication token
    reconnect_interval: float = 5.0,   # Seconds between reconnect attempts
    ping_interval: float = 30.0,       # Seconds between keepalive pings
)
```

All parameters are keyword-only.

### @agent.on_task

Register a task handler. Called each time the agent receives a message from a user. The handler receives a `Task` object and can be sync or async.

```python
@agent.on_task
async def handle(task):
    ...
```

### Task Object

| Field             | Type                    | Description                              |
|-------------------|-------------------------|------------------------------------------|
| `task_id`         | `str`                   | Unique identifier for this task          |
| `conversation_id` | `str`                   | Conversation the message belongs to      |
| `content`         | `str`                   | The user's message text                  |
| `send_chunk`      | `Callable[[str], None]` | Stream a partial response to the user    |
| `send_complete`   | `Callable[[str], None]` | Finalize the response with full content  |
| `send_error`      | `Callable[[str], None]` | Send an error message back to the user   |

A typical handler streams chunks as they are generated, then calls `send_complete` with the assembled full text. If something goes wrong, call `send_error` instead.

### Lifecycle Callbacks

```python
@agent.on_connected
def connected():
    print("Connected")

@agent.on_disconnected
def disconnected():
    print("Disconnected")

@agent.on_error
def error(exc: Exception):
    print("Error:", exc)
```

- `on_connected` -- called after successful authentication.
- `on_disconnected` -- called when the WebSocket connection drops.
- `on_error` -- called on connection errors or unhandled exceptions in the task handler.

### agent.run()

```python
agent.run() -> None
```

Start the agent in blocking mode. Creates its own event loop, connects to the server, and reconnects automatically on disconnection. Stops on `SIGINT` or `SIGTERM`.

### await agent.connect()

```python
await agent.connect() -> None
```

Start the agent within an existing async event loop. Reconnects automatically until `disconnect()` is called.

### await agent.disconnect()

```python
await agent.disconnect() -> None
```

Close the WebSocket connection and stop automatic reconnection.

## Getting a Bot Token

1. Open the Arinova Chat dashboard.
2. Navigate to the bot management page and create a new bot.
3. Copy the bot token from the bot's settings page.
4. Pass it as the `bot_token` parameter when creating an `ArinovaAgent` instance.

## License

MIT
