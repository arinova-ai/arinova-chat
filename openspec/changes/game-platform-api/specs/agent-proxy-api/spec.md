## ADDED Requirements

### Requirement: Send prompt to user's agent (REST)
The system SHALL allow external apps to send a prompt to a user's AI agent and receive a complete response.

#### Scenario: Successful agent chat
- **WHEN** app sends `POST /api/v1/agent/chat` with `{ agentId, prompt, systemPrompt? }` and valid token
- **THEN** system forwards the prompt to the user's agent via the existing WS connection and returns `{ response, agentId }`

#### Scenario: Agent not connected
- **WHEN** app sends a chat request but the specified agent is not connected
- **THEN** system returns 400 with `{ error: "agent_offline" }`

#### Scenario: Agent not owned by user
- **WHEN** app sends a chat request with an agentId that doesn't belong to the authenticated user
- **THEN** system returns 403 with `{ error: "agent_not_owned" }`

### Requirement: Send prompt to user's agent (SSE streaming)
The system SHALL allow external apps to send a prompt and receive a streaming response via Server-Sent Events.

#### Scenario: Successful streaming response
- **WHEN** app sends `POST /api/v1/agent/chat/stream` with `{ agentId, prompt, systemPrompt? }` and valid token
- **THEN** system returns `Content-Type: text/event-stream` with chunks: `data: {"type":"chunk","content":"..."}\n\n` and final `data: {"type":"done","content":"full response"}\n\n`

#### Scenario: Agent disconnects mid-stream
- **WHEN** agent disconnects while streaming a response
- **THEN** system sends `data: {"type":"error","error":"agent_disconnected"}\n\n` and closes the stream

### Requirement: Rate limiting
The system SHALL enforce per-app per-user rate limits on Agent API calls.

#### Scenario: Rate limit exceeded
- **WHEN** app exceeds the allowed number of agent calls per minute
- **THEN** system returns 429 with `{ error: "rate_limit_exceeded", retryAfter: <seconds> }`

### Requirement: Usage tracking
The system SHALL track Agent API usage per app for billing and analytics.

#### Scenario: API call logged
- **WHEN** any Agent API call is made
- **THEN** system records the call in `agent_api_calls` table with app_id, user_id, agent_id, timestamp, token_count
