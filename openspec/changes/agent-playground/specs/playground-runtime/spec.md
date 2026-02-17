## ADDED Requirements

### Requirement: Playground session lifecycle
The system SHALL manage playground sessions with states: `waiting` (waiting for players), `active` (game in progress), `paused`, `finished`.

#### Scenario: Session starts when enough players join
- **WHEN** participant count reaches minPlayers and the host triggers start
- **THEN** the session state SHALL transition from `waiting` to `active`, roles SHALL be assigned, and the first phase SHALL begin

#### Scenario: Session finishes on win condition
- **WHEN** a win condition is met during an active session
- **THEN** the session state SHALL transition to `finished` and all participants SHALL see the result

### Requirement: Server-authoritative state management
The system SHALL maintain playground state on the server as single source of truth. All actions MUST be validated by the server before state is updated.

#### Scenario: Valid action updates state
- **WHEN** a participant submits a valid action (correct phase, correct role, valid target)
- **THEN** the server SHALL update the playground state and broadcast the new state to all participants

#### Scenario: Invalid action rejected
- **WHEN** a participant submits an action that violates phase or role restrictions
- **THEN** the server SHALL reject the action and return an error to the participant

### Requirement: WebSocket real-time sync
The system SHALL use a dedicated WebSocket endpoint `/ws/playground` for real-time state synchronization between server and all participants.

#### Scenario: State broadcast after action
- **WHEN** the server processes a valid action and updates state
- **THEN** the server SHALL broadcast the updated state to all connected participants, filtered by their role's `visibleState`

#### Scenario: Participant reconnects
- **WHEN** a participant disconnects and reconnects to an active session
- **THEN** the server SHALL send the current state (filtered by role) to the reconnecting participant

### Requirement: Per-role state filtering
The system SHALL filter playground state based on each participant's assigned role before broadcasting.

#### Scenario: Werewolf sees team identities
- **WHEN** state is broadcast to a participant with role "werewolf"
- **THEN** the state SHALL include the identities of all werewolf players

#### Scenario: Villager does not see werewolf identities
- **WHEN** state is broadcast to a participant with role "villager"
- **THEN** the state SHALL NOT include werewolf identity information

### Requirement: Phase management
The system SHALL automatically manage phase transitions based on timer expiry or condition fulfillment.

#### Scenario: Timer-based transition
- **WHEN** a phase with a 60-second timer expires
- **THEN** the server SHALL transition to the next phase and notify all participants

#### Scenario: All-action-complete transition
- **WHEN** all required participants have submitted their actions for a phase
- **THEN** the server SHALL transition to the next phase without waiting for the timer

### Requirement: Action execution by user or agent
The system SHALL accept actions from both the user directly and their agent. The participant's control mode determines who can act.

#### Scenario: Agent submits action
- **WHEN** a participant's control mode is "agent" and the agent submits an action
- **THEN** the server SHALL process the action as if the participant acted

#### Scenario: User submits action directly
- **WHEN** a participant's control mode is "human" and the user submits an action via UI
- **THEN** the server SHALL process the action as the participant's action

### Requirement: Playground state size limit
The system SHALL enforce a maximum state size per playground session to prevent abuse.

#### Scenario: State exceeds limit
- **WHEN** an action would cause the state to exceed the maximum size (e.g., 1MB)
- **THEN** the server SHALL reject the action with an error
