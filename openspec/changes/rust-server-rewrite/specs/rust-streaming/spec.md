## ADDED Requirements

### Requirement: Agent response streaming pipeline
The streaming pipeline SHALL maintain identical behavior: task queuing per conversation, chunk forwarding, Redis accumulation, and reconnection recovery.

#### Scenario: Send message triggers agent task
- **WHEN** a client sends `send_message` via WebSocket
- **THEN** the server SHALL save the user message, create a pending agent message, send `stream_start` to client, and dispatch task to agent

#### Scenario: Chunk forwarding
- **WHEN** an agent sends `agent_chunk`
- **THEN** the server SHALL forward the chunk as `stream_chunk` to all user's connections and accumulate in Redis

#### Scenario: Auto-detect accumulated vs delta
- **WHEN** an agent sends chunks
- **THEN** the server SHALL auto-detect whether chunks are accumulated text or deltas (same logic as current Node.js implementation)

#### Scenario: Stream completion
- **WHEN** an agent sends `agent_complete`
- **THEN** the server SHALL update message status to `completed`, persist final content to DB, send `stream_end` to client, and process queued tasks

#### Scenario: Per-conversation queuing
- **WHEN** a user sends a message while a stream is active in the same conversation
- **THEN** the server SHALL queue the task and process it after the current stream completes

#### Scenario: Stream cancellation
- **WHEN** a client sends `cancel_stream`
- **THEN** the server SHALL cancel the active stream and update message status to `cancelled`

#### Scenario: Redis accumulation for reconnection
- **WHEN** streaming content is being accumulated
- **THEN** the server SHALL store it in Redis with key `stream:{messageId}` and 600s TTL

### Requirement: Sync on reconnection
The sync protocol SHALL return missed messages and current stream state.

#### Scenario: Client sync
- **WHEN** a client sends `sync` after reconnecting
- **THEN** the server SHALL return unread conversation states and any pending events from Redis queue
