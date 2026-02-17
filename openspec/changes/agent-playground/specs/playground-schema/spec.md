## ADDED Requirements

### Requirement: Playground definition schema
The system SHALL define a `PlaygroundDefinition` JSON schema that describes all aspects of a playground: metadata, rules, roles, phases, actions, and win conditions.

#### Scenario: Valid playground definition
- **WHEN** an agent generates a playground definition with all required fields (name, description, minPlayers, maxPlayers, roles, phases)
- **THEN** the system SHALL accept and store the definition

#### Scenario: Invalid playground definition
- **WHEN** a playground definition is missing required fields or has invalid types
- **THEN** the system SHALL reject it with specific validation errors

### Requirement: Role definition
The system SHALL support defining multiple roles within a playground, each with its own `visibleState`, `availableActions`, and `systemPrompt`.

#### Scenario: Role with restricted visibility
- **WHEN** a playground defines a "werewolf" role with `visibleState` including werewolf identities
- **THEN** only participants assigned to the "werewolf" role SHALL see werewolf identity information

#### Scenario: Role-specific actions
- **WHEN** a playground defines a "seer" role with a "peek" action
- **THEN** only participants assigned to the "seer" role SHALL have access to the "peek" action

### Requirement: Phase definition
The system SHALL support defining ordered phases within a playground, each with a name, description, duration (optional), allowed actions, and transition conditions.

#### Scenario: Timed phase
- **WHEN** a phase defines a duration of 60 seconds
- **THEN** the system SHALL automatically transition to the next phase after 60 seconds

#### Scenario: Condition-based phase transition
- **WHEN** a phase defines a transition condition (e.g., all players have voted)
- **THEN** the system SHALL transition to the next phase once the condition is met

### Requirement: Action definition
The system SHALL support defining actions with a name, description, parameters (JSON Schema), target type (player/role/global), and phase restrictions.

#### Scenario: Action with target
- **WHEN** an action "vote_eliminate" targets a player
- **THEN** the action payload MUST include a valid target player ID

#### Scenario: Phase-restricted action
- **WHEN** an action is restricted to the "night" phase and a participant attempts it during "day"
- **THEN** the system SHALL reject the action

### Requirement: Win condition definition
The system SHALL support defining win conditions as expressions evaluated against playground state.

#### Scenario: Win condition met
- **WHEN** a playground's win condition evaluates to true (e.g., all werewolves eliminated)
- **THEN** the system SHALL end the playground session and announce the winning role(s)

### Requirement: Playground metadata
The system SHALL require playground metadata including name, description, category, minPlayers, maxPlayers, and optional tags and thumbnail description.

#### Scenario: Player count validation
- **WHEN** a playground defines minPlayers=5 and maxPlayers=12
- **THEN** the system SHALL only allow the playground to start when participant count is within range
