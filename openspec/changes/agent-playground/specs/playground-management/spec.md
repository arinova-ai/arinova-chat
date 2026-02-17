## ADDED Requirements

### Requirement: Playground listing
The system SHALL provide an API endpoint `GET /api/playgrounds` that returns a paginated list of public playgrounds with filtering by category, tags, and search query.

#### Scenario: Browse all playgrounds
- **WHEN** a user requests the playground list without filters
- **THEN** the system SHALL return playgrounds sorted by creation date (newest first) with pagination

#### Scenario: Search playgrounds
- **WHEN** a user searches with query "狼人殺"
- **THEN** the system SHALL return playgrounds matching the query in name, description, or tags

#### Scenario: Filter by category
- **WHEN** a user filters by category "game"
- **THEN** the system SHALL return only playgrounds with category "game"

### Requirement: Playground detail
The system SHALL provide an API endpoint `GET /api/playgrounds/:id` that returns full playground information including definition, participant count, and session status.

#### Scenario: View playground detail
- **WHEN** a user requests a playground by ID
- **THEN** the system SHALL return the playground metadata, definition summary, current participant count, and active session status

### Requirement: Join playground
The system SHALL allow a user to join a playground by selecting one of their agents to participate.

#### Scenario: User joins with agent
- **WHEN** a user selects an agent and clicks "Join" on a playground in `waiting` state
- **THEN** the system SHALL add the user+agent as a participant and notify other participants

#### Scenario: Playground full
- **WHEN** a user attempts to join a playground that has reached maxPlayers
- **THEN** the system SHALL reject with an error indicating the playground is full

#### Scenario: Already joined
- **WHEN** a user who is already a participant attempts to join again
- **THEN** the system SHALL return the existing session connection instead of creating a duplicate

### Requirement: Leave playground
The system SHALL allow a participant to leave a playground session.

#### Scenario: Leave during waiting
- **WHEN** a participant leaves during `waiting` state
- **THEN** the system SHALL remove them from the participant list and notify others

#### Scenario: Leave during active session
- **WHEN** a participant leaves during an `active` session
- **THEN** the system SHALL mark them as disconnected; the playground MAY continue with remaining players or pause depending on definition rules

### Requirement: Delete playground
The system SHALL allow the playground owner to delete their playground.

#### Scenario: Delete with no active session
- **WHEN** the owner deletes a playground with no active session
- **THEN** the system SHALL remove the playground and all associated data

#### Scenario: Delete with active session
- **WHEN** the owner deletes a playground with an active session
- **THEN** the system SHALL end the active session, notify all participants, then remove the playground

### Requirement: Playground CRUD API
The system SHALL provide REST endpoints for playground management:
- `POST /api/playgrounds` — create playground
- `GET /api/playgrounds` — list playgrounds
- `GET /api/playgrounds/:id` — get playground detail
- `DELETE /api/playgrounds/:id` — delete playground (owner only)

#### Scenario: Create playground via API
- **WHEN** an authenticated user POSTs a valid PlaygroundDefinition
- **THEN** the system SHALL create the playground and return its ID

#### Scenario: Unauthenticated request
- **WHEN** an unauthenticated user attempts any playground API call
- **THEN** the system SHALL return 401 Unauthorized
