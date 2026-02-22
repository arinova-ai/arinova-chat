## ADDED Requirements

### Requirement: ArinovaAgent class connects with bot_token
The Python SDK SHALL export an `ArinovaAgent` class that accepts `server_url` and `bot_token` and connects to the Arinova backend via WebSocket.

#### Scenario: Successful connection
- **WHEN** agent calls `await agent.connect()` or `agent.run()` with valid server_url and bot_token
- **THEN** the SDK connects to `{server_url}/ws/agent`, sends `{ "type": "agent_auth", "botToken": bot_token }`, receives `auth_ok`, and the connection is established

#### Scenario: Invalid bot_token
- **WHEN** agent connects with an invalid bot_token
- **THEN** the SDK receives `auth_error`, calls `on_error` callback, and does NOT attempt reconnection

#### Scenario: Blocking run
- **WHEN** agent calls `agent.run()`
- **THEN** the SDK runs the asyncio event loop, connects, and blocks until interrupted (Ctrl+C or SIGTERM)

### Requirement: Task handler via decorator
The SDK SHALL allow registering a task handler via `@agent.on_task` decorator.

#### Scenario: Receive and respond to task
- **WHEN** server sends a task
- **THEN** the decorated handler is called with a `Task` object containing `task_id`, `conversation_id`, `content`, `send_chunk()`, `send_complete()`, `send_error()`

#### Scenario: Handler raises exception
- **WHEN** the task handler raises an unhandled exception
- **THEN** the SDK catches it and sends `agent_error` to the server with the error message

### Requirement: Streaming response helpers
The SDK SHALL provide `send_chunk()`, `send_complete()`, and `send_error()` methods on the `Task` object.

#### Scenario: Stream chunks then complete
- **WHEN** handler calls `task.send_chunk("partial")` then `task.send_complete("full")`
- **THEN** the SDK sends the corresponding JSON messages to the server

### Requirement: Auto-reconnect on disconnect
The SDK SHALL automatically reconnect with a 5-second interval when the connection drops.

#### Scenario: Connection lost and recovered
- **WHEN** the WebSocket connection drops
- **THEN** the SDK waits 5 seconds, reconnects, re-authenticates, and calls `on_connected` callback

### Requirement: Package published as arinova-agent
The SDK SHALL be published to PyPI as `arinova-agent`.

#### Scenario: Install and import
- **WHEN** user runs `pip install arinova-agent`
- **THEN** they can `from arinova_agent import ArinovaAgent` and use the SDK
