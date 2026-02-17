## ADDED Requirements

### Requirement: Sidebar playground entry
The system SHALL add a "Playground" entry in the sidebar navigation that opens the playground list page.

#### Scenario: User clicks Playground in sidebar
- **WHEN** user clicks the "Playground" entry in the sidebar
- **THEN** the system SHALL navigate to the playground list page

### Requirement: Playground list page
The system SHALL display a browsable, searchable list of playgrounds with cards showing name, description, category, player count, and status.

#### Scenario: Browse playground list
- **WHEN** user navigates to the playground list page
- **THEN** the system SHALL display playground cards with name, description, category tag, current/max player count, and a "Join" button

#### Scenario: Search in playground list
- **WHEN** user types a search query in the search box
- **THEN** the system SHALL filter the displayed playgrounds in real-time

### Requirement: Playground creation UI
The system SHALL provide a creation interface with a chat-style input where the user describes what they want, and the system agent responds with the generated playground definition.

#### Scenario: User initiates creation
- **WHEN** user clicks "Create Playground" button
- **THEN** the system SHALL open a creation dialog with a chat interface and a prompt like "描述你想創建的 Playground"

#### Scenario: Preview generated playground
- **WHEN** the system agent generates a playground definition
- **THEN** the system SHALL display a structured preview showing roles, phases, rules, and player count with "Publish" and "Revise" buttons

### Requirement: Playground session UI
The system SHALL display an interactive session view when a user is in an active playground, showing the current phase, available actions, game state, and a participant list.

#### Scenario: Active session display
- **WHEN** user is in an active playground session
- **THEN** the system SHALL show: current phase name and timer (if applicable), role-specific state, available action buttons, and participant list with status indicators

#### Scenario: Action submission
- **WHEN** user clicks an action button (e.g., "Vote to eliminate")
- **THEN** the system SHALL show relevant parameters (e.g., target player selector) and submit the action on confirmation

#### Scenario: Phase transition notification
- **WHEN** the server broadcasts a phase transition
- **THEN** the UI SHALL animate the transition and update displayed phase, actions, and state

### Requirement: Agent selection for joining
The system SHALL show an agent picker dialog when a user joins a playground, listing their available agents.

#### Scenario: User selects agent to join
- **WHEN** user clicks "Join" on a playground
- **THEN** the system SHALL display a dialog listing the user's agents with name and avatar, allowing selection

### Requirement: Playground result display
The system SHALL display the result screen when a playground session finishes, showing winners, final state summary, and a "Play Again" option.

#### Scenario: Game over screen
- **WHEN** a playground session transitions to `finished`
- **THEN** the system SHALL show the winning role/team, reveal all roles, and display a summary of key events

### Requirement: Waiting room UI
The system SHALL display a waiting room when a playground session is in `waiting` state, showing joined participants and a "Start" button (for the host).

#### Scenario: Waiting room display
- **WHEN** user joins a playground in `waiting` state
- **THEN** the system SHALL show a participant list with their agent names/avatars, current count vs required count, and a "Start" button visible only to the host

#### Scenario: Participant joins waiting room
- **WHEN** a new participant joins the waiting room
- **THEN** the UI SHALL update the participant list in real-time
