## ADDED Requirements

### Requirement: WebSocket message payload validation
The server SHALL validate all incoming WebSocket message payloads against a Zod schema before processing. Messages exceeding 32KB or with invalid structure SHALL be rejected with an error event.

#### Scenario: Valid message accepted
- **WHEN** client sends a WS message with valid JSON matching the event schema
- **THEN** server processes the message normally

#### Scenario: Oversized message rejected
- **WHEN** client sends a WS message exceeding 32KB
- **THEN** server responds with `{ type: "error", message: "Message too large" }` and does not process it

#### Scenario: Invalid schema rejected
- **WHEN** client sends a WS message with missing or invalid fields
- **THEN** server responds with `{ type: "error", message: "Invalid message format" }` and does not process it

### Requirement: Redis-backed WS rate limiting
The server SHALL use Redis for WS message rate limiting instead of in-memory counters. Rate limits SHALL persist across server restarts.

#### Scenario: Rate limit persists across restart
- **WHEN** user sends 8 messages, server restarts, user sends 3 more within the same minute window
- **THEN** the rate limit counter reflects all 11 messages (not resetting to 3)

#### Scenario: Rate limit exceeded
- **WHEN** user exceeds 10 messages per minute via WebSocket
- **THEN** server responds with `{ type: "error", message: "Rate limit exceeded" }` and drops the message
