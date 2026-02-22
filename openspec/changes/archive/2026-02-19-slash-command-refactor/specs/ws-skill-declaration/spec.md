## ADDED Requirements

### Requirement: Agent declares skills via WebSocket auth
The agent SHALL include an optional `skills` array in the `agent_auth` WebSocket message. Each skill object MUST have `id` (string), `name` (string), and `description` (string) fields.

#### Scenario: Agent connects with skills
- **WHEN** agent sends `{ type: "agent_auth", botToken: "xxx", skills: [{ id: "draw", name: "Draw", description: "Generate an image" }] }`
- **THEN** server authenticates the agent and stores the skills in memory keyed by agent ID

#### Scenario: Agent connects without skills
- **WHEN** agent sends `{ type: "agent_auth", botToken: "xxx" }` (no skills field)
- **THEN** server authenticates the agent and stores an empty skills array

### Requirement: Server clears skills on agent disconnect
The server SHALL remove the stored skills for an agent when its WebSocket connection closes.

#### Scenario: Agent disconnects
- **WHEN** agent WebSocket connection closes
- **THEN** the agent's skills are removed from server memory

#### Scenario: Agent reconnects with different skills
- **WHEN** agent disconnects and reconnects with a different skills array
- **THEN** server stores only the new skills array, replacing any previous data

### Requirement: Skills API reads from server memory
The `GET /api/agents/:id/skills` endpoint SHALL return skills from server memory (populated by WS auth) instead of fetching from an A2A HTTP endpoint.

#### Scenario: Agent is connected with skills
- **WHEN** frontend requests `GET /api/agents/:id/skills` and agent is connected
- **THEN** server returns `{ skills: [...] }` from the in-memory store

#### Scenario: Agent is not connected
- **WHEN** frontend requests `GET /api/agents/:id/skills` and agent is offline
- **THEN** server returns `{ skills: [] }`

### Requirement: SDK supports skills option
The `ArinovaAgentOptions` interface SHALL include an optional `skills` array. The SDK SHALL include this array in the `agent_auth` WebSocket message.

#### Scenario: SDK agent with skills
- **WHEN** developer creates `new ArinovaAgent({ serverUrl, botToken, skills: [...] })`
- **THEN** SDK sends `{ type: "agent_auth", botToken, skills: [...] }` on connect

#### Scenario: SDK agent without skills
- **WHEN** developer creates `new ArinovaAgent({ serverUrl, botToken })`
- **THEN** SDK sends `{ type: "agent_auth", botToken }` on connect (no skills field)

### Requirement: Frontend slash popup shows only agent skills
The slash popup triggered by typing `/` in chat input SHALL only display skills declared by the active conversation's agent. All platform commands SHALL be removed.

#### Scenario: User types "/" with connected agent that has skills
- **WHEN** user types "/" in chat input and agent has declared skills `[{ id: "draw", ... }]`
- **THEN** popup shows only agent skills (e.g., `/draw`)

#### Scenario: User types "/" with agent that has no skills
- **WHEN** user types "/" in chat input and agent has no declared skills
- **THEN** no popup is shown

#### Scenario: User selects an agent skill
- **WHEN** user selects `/draw` from the popup
- **THEN** message `/draw` is sent to the agent via `sendMessage()`

### Requirement: Platform commands file removed
The `platform-commands.ts` file and all references to it SHALL be removed. Frontend operations (new chat, stop, clear, settings, search) are accessible only via their existing UI buttons.

#### Scenario: No platform commands in codebase
- **WHEN** the change is complete
- **THEN** `platform-commands.ts` does not exist and no code imports from it
