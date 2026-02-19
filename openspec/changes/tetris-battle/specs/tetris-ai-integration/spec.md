## ADDED Requirements

### Requirement: AI Agent polling
The system SHALL periodically send the AI agent's board state to the Agent Proxy API and execute returned moves.

#### Scenario: Polling cycle
- **WHEN** the AI polling interval elapses (every 2 seconds)
- **THEN** the system SHALL send the current board state as a text prompt to the agent via `Arinova.agent.chat()` and parse the response as move commands

#### Scenario: AI response received
- **WHEN** the agent returns a response like `"left left rotate drop"`
- **THEN** the system SHALL parse and execute each move command sequentially on the AI's board

### Requirement: Board state serialization
The system SHALL serialize the board state into a text format that an LLM can understand.

#### Scenario: Board serialized for AI
- **WHEN** the system prepares a prompt for the agent
- **THEN** the prompt SHALL include: ASCII grid (`.` = empty, `#` = filled), current piece type, next piece type, current score, and lines sent to opponent

### Requirement: AI move parsing
The system SHALL parse the agent's text response into valid game moves.

#### Scenario: Valid moves parsed
- **WHEN** agent responds with space-separated commands (left, right, rotate, drop)
- **THEN** each command SHALL be mapped to the corresponding game action

#### Scenario: Invalid moves ignored
- **WHEN** agent responds with unrecognized commands or invalid format
- **THEN** unrecognized commands SHALL be skipped and valid commands in the response SHALL still be executed

### Requirement: AI auto-drop fallback
The system SHALL auto-drop the AI's piece if no response is received in time.

#### Scenario: Agent timeout
- **WHEN** the agent does not respond within 5 seconds
- **THEN** the AI's current piece SHALL hard-drop at its current position

#### Scenario: Agent offline
- **WHEN** the agent is not connected
- **THEN** the game SHALL display "Agent disconnected" and pause the AI board until reconnection or game forfeit
