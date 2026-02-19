## ADDED Requirements

### Requirement: Server persists streaming content to Redis
The server SHALL write the current streaming content to Redis key `stream:{messageId}` on every chunk received from the agent. The key SHALL have a TTL of 600 seconds.

#### Scenario: Chunk received during streaming
- **WHEN** server receives a chunk from agent for messageId "abc"
- **THEN** server calls `redis.set("stream:abc", chunk, "EX", 600)`

#### Scenario: Stream completes
- **WHEN** agent sends complete for messageId "abc"
- **THEN** server deletes `stream:abc` from Redis

#### Scenario: Stream errors
- **WHEN** agent sends error for messageId "abc"
- **THEN** server deletes `stream:abc` from Redis

### Requirement: Sync response includes streaming content from Redis
When the sync handler encounters a message with `status = "streaming"`, it SHALL fetch the current content from Redis and include it in the `sync_response`.

#### Scenario: User reconnects during active stream
- **WHEN** user WS reconnects and sync finds message with `status = "streaming"`
- **THEN** sync_response includes that message with content from Redis (not empty string from DB)

#### Scenario: No Redis content available
- **WHEN** sync finds a streaming message but Redis key doesn't exist
- **THEN** sync_response includes the message with content from DB (empty string)

### Requirement: REST messages endpoint includes streaming content from Redis
The `GET /api/conversations/:id/messages` endpoint SHALL check for messages with `status = "streaming"` and supplement their content from Redis.

#### Scenario: Page refresh during active stream
- **WHEN** user refreshes page and REST API loads messages including a `status = "streaming"` message
- **THEN** response includes current streaming content from Redis

### Requirement: Reconnect re-attaches to active stream
When a user reconnects via WS and has an active stream, the server SHALL re-send `stream_start` and an immediate `stream_chunk` with the current content, so the frontend resumes display.

#### Scenario: User reconnects with active stream
- **WHEN** user WS connects, sync runs, and there is an active stream for their conversation
- **THEN** server sends `stream_start` followed by `stream_chunk` with current Redis content
- **AND** subsequent agent chunks continue flowing to the user normally

#### Scenario: User reconnects with no active stream
- **WHEN** user WS connects and there is no active stream
- **THEN** no stream_start is sent, sync_response handles completed/errored messages normally

### Requirement: Redis failure does not break streaming
If Redis is unavailable, streaming SHALL continue to work normally — chunks are still sent via WS to the connected user. Only the recovery capability is lost.

#### Scenario: Redis unavailable during chunk
- **WHEN** Redis SET fails during onChunk
- **THEN** chunk is still sent to user via WS, error is silently logged
