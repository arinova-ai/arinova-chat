## ADDED Requirements

### Requirement: ArinovaAgent class connects with botToken
The SDK SHALL export an `ArinovaAgent` class that accepts `serverUrl` and `botToken` as constructor options and connects to the Arinova backend via WebSocket.

#### Scenario: Successful connection
- **WHEN** agent calls `await agent.connect()` with valid serverUrl and botToken
- **THEN** the SDK connects to `{serverUrl}/ws/agent`, sends `{ type: "agent_auth", botToken }`, receives `auth_ok`, and the connect() promise resolves

#### Scenario: Invalid botToken
- **WHEN** agent calls `await agent.connect()` with an invalid botToken
- **THEN** the SDK receives `auth_error`, emits an "error" event, and does NOT attempt reconnection

#### Scenario: Server unreachable
- **WHEN** agent calls `await agent.connect()` but the server is unreachable
- **THEN** the SDK emits an "error" event and automatically retries connection every 5 seconds

### Requirement: Task handler receives incoming tasks
The SDK SHALL allow registering a task handler via `agent.onTask(handler)` that is called when the server sends a task.

#### Scenario: Receive and respond to task
- **WHEN** server sends `{ type: "task", taskId, conversationId, content }`
- **THEN** the handler is called with `{ taskId, conversationId, content, sendChunk, sendComplete, sendError }`

#### Scenario: Handler throws error
- **WHEN** the task handler throws an unhandled error
- **THEN** the SDK catches it and sends `{ type: "agent_error", taskId, error: errorMessage }` to the server

### Requirement: Streaming response helpers
The SDK SHALL provide `sendChunk()`, `sendComplete()`, and `sendError()` functions within the task handler context.

#### Scenario: Stream chunks then complete
- **WHEN** handler calls `sendChunk("partial")` multiple times then `sendComplete("full")`
- **THEN** the SDK sends `{ type: "agent_chunk", taskId, chunk }` for each chunk, then `{ type: "agent_complete", taskId, content }` for complete

#### Scenario: Send error response
- **WHEN** handler calls `sendError("something went wrong")`
- **THEN** the SDK sends `{ type: "agent_error", taskId, error }` to the server

### Requirement: Auto-reconnect on disconnect
The SDK SHALL automatically reconnect when the WebSocket connection drops, with a 5-second interval.

#### Scenario: Connection lost and recovered
- **WHEN** the WebSocket connection drops unexpectedly
- **THEN** the SDK emits "disconnected" event, waits 5 seconds, reconnects, re-authenticates, and emits "connected" event

#### Scenario: Disconnect called explicitly
- **WHEN** `agent.disconnect()` is called
- **THEN** the SDK closes the WebSocket and does NOT attempt reconnection

### Requirement: Keepalive ping
The SDK SHALL send `{ type: "ping" }` every 30 seconds to keep the connection alive.

#### Scenario: Ping-pong cycle
- **WHEN** 30 seconds pass since the last ping
- **THEN** the SDK sends `{ type: "ping" }` and the server responds with `{ type: "pong" }`

### Requirement: Lifecycle events
The SDK SHALL emit "connected", "disconnected", and "error" events.

#### Scenario: Event listeners
- **WHEN** agent registers `agent.on("connected", callback)`
- **THEN** the callback is called when the agent successfully authenticates with the server

### Requirement: Package published as @arinova-ai/agent-sdk
The SDK SHALL be published to npm as `@arinova-ai/agent-sdk` with TypeScript type definitions included.

#### Scenario: Install and import
- **WHEN** user runs `npm install @arinova-ai/agent-sdk`
- **THEN** they can `import { ArinovaAgent } from "@arinova-ai/agent-sdk"` with full TypeScript types
