## ADDED Requirements

### Requirement: Agent WS auth accepts botToken
The server SHALL accept `{ type: "agent_auth", botToken: string }` as the agent authentication event on the `/ws/agent` endpoint. The server looks up the agent by `secret_token` column.

#### Scenario: Valid botToken
- **WHEN** agent sends `{ type: "agent_auth", botToken: "ari_xxxx" }` on WS connect
- **THEN** server queries `agents WHERE secret_token = botToken`, registers the connection by agentId, and responds `{ type: "auth_ok", agentName }`

#### Scenario: Invalid botToken
- **WHEN** agent sends `{ type: "agent_auth", botToken: "invalid" }`
- **THEN** server responds `{ type: "auth_error", error: "Invalid bot token" }` and closes the connection with code 4404

#### Scenario: Missing botToken field
- **WHEN** agent sends `{ type: "agent_auth" }` without botToken
- **THEN** server responds `{ type: "auth_error", error }` and closes the connection

## REMOVED Requirements

### Requirement: POST /api/agents/pair endpoint
**Reason**: Replaced by direct botToken auth on WebSocket. The pair endpoint only existed to translate botToken → agentId, which the server now does internally during WS auth.
**Migration**: Use botToken directly in WebSocket `agent_auth` event instead of calling pair endpoint first.

### Requirement: AgentWSClientEvent uses agentId
**Reason**: Replaced by botToken field. The `agentId` field in the `agent_auth` event is removed.
**Migration**: Send `{ type: "agent_auth", botToken }` instead of `{ type: "agent_auth", agentId }`.
