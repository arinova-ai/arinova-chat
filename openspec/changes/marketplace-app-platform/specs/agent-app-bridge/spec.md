## ADDED Requirements

### Requirement: State to tool-use conversion
The platform SHALL convert app state and actions into the agent's tool-use format. Each action SHALL become a tool definition with `name`, `description`, and `parameters` (from the action's `params` JSON Schema). The role's `prompt` and current `state` SHALL be included as context.

#### Scenario: Static mode tool generation
- **WHEN** an app uses static mode and has actions `[{ name: "place", description: "Place mark", params: { row: int, col: int } }]`
- **THEN** the agent receives a tool `place` with parameters schema `{ row: integer, col: integer }`

#### Scenario: Dynamic mode tool update
- **WHEN** an app calls `setContext()` with new actions
- **THEN** the agent's available tools are updated to match the new actions

### Requirement: Agent action routing
The platform SHALL receive tool calls from the agent, validate them against the current action definitions, and forward them to the app via the SDK bridge.

#### Scenario: Valid action
- **WHEN** the agent calls tool "place" with valid params
- **THEN** the platform forwards the action to the app's `onAction("place")` handler

#### Scenario: Action not available
- **WHEN** the agent calls a tool that is not in the current action list
- **THEN** the platform rejects the call and informs the agent "Action not available"

### Requirement: State delivery to agent
For static mode, the platform SHALL deliver state to the agent after each action is processed (app updates state). For dynamic mode, the platform SHALL deliver state each time the app calls `setContext()`.

#### Scenario: Turn-based state update
- **WHEN** the app processes an action and updates state
- **THEN** the agent receives the new state and can decide its next action

### Requirement: Event delivery to agent
The platform SHALL deliver app events to the agent as system messages that include the event name and payload. The agent MAY respond to events by calling actions.

#### Scenario: Game event notification
- **WHEN** an app emits event "roundEnded" with payload `{ winner: "X" }`
- **THEN** the agent receives a message: "Event: roundEnded — { winner: X }"

### Requirement: Human label display
The platform SHALL display the `humanLabel` from `setContext()` in the chat panel as a system message when it changes. This provides human-readable context about what is happening in the app.

#### Scenario: Context change with label
- **WHEN** an app calls `setContext({ humanLabel: "⚔️ Combat: Lv.15 Goblin" })`
- **THEN** the chat panel shows "🎮 ⚔️ Combat: Lv.15 Goblin"

### Requirement: Control mode enforcement
The platform SHALL enforce control mode for action routing. In "agent" mode, only agent actions are forwarded. In "human" mode, agent actions are blocked. In "copilot" mode, both are forwarded, respecting `humanOnly`/`agentOnly` action flags.

#### Scenario: Agent action blocked in human mode
- **WHEN** control mode is "human" and the agent attempts an action
- **THEN** the platform blocks the action and informs the agent "Human is in control"

#### Scenario: Copilot action partitioning
- **WHEN** control mode is "copilot" and an action is marked `humanOnly: true`
- **THEN** the agent cannot invoke that action; only human input triggers it

### Requirement: Agent session context
The platform SHALL maintain a conversation-style context for the agent, including: the role's prompt, current state, action history (last N actions and their results), and any app events. This context SHALL be provided to the LLM on each turn.

#### Scenario: Agent sees action history
- **WHEN** the agent has taken 3 actions in the current session
- **THEN** the context includes those 3 actions and their outcomes for continuity
