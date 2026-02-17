## ADDED Requirements

### Requirement: Auth middleware tests
The system SHALL test the auth middleware for protected routes, verifying both authenticated and unauthenticated access.

#### Scenario: Authenticated request passes
- **WHEN** a request with a valid session token hits a protected route
- **THEN** the middleware SHALL allow the request and attach user context

#### Scenario: Unauthenticated request rejected
- **WHEN** a request without a session token hits a protected route
- **THEN** the middleware SHALL return 401 Unauthorized

### Requirement: Agent API route tests
The system SHALL test all agent CRUD endpoints (create, list, get, update, delete) with happy paths and error cases.

#### Scenario: Create agent successfully
- **WHEN** an authenticated user POSTs valid agent data to `/api/agents`
- **THEN** the route SHALL return 201 with the created agent

#### Scenario: Create agent with invalid data
- **WHEN** an authenticated user POSTs invalid agent data
- **THEN** the route SHALL return 400 with validation errors

### Requirement: Conversation API route tests
The system SHALL test conversation endpoints including create, list, get, delete, and clear messages.

#### Scenario: Create direct conversation
- **WHEN** an authenticated user creates a conversation with a valid agent
- **THEN** the route SHALL return the conversation with agent details

#### Scenario: Create group conversation
- **WHEN** an authenticated user creates a group conversation with multiple agents
- **THEN** the route SHALL return the group conversation with all members

### Requirement: Message API route tests
The system SHALL test message endpoints including send, list, and search.

#### Scenario: Search messages
- **WHEN** an authenticated user searches messages with a query
- **THEN** the route SHALL return matching messages across conversations

### Requirement: WebSocket handler tests
The system SHALL test WebSocket handlers for user and agent connections, including message sending, streaming, and disconnection.

#### Scenario: User sends message via WebSocket
- **WHEN** an authenticated user sends a `send_message` event
- **THEN** the handler SHALL forward the message to the target agent and store it

#### Scenario: Agent stream response
- **WHEN** an agent sends `agent_chunk` events followed by `agent_complete`
- **THEN** the handler SHALL relay chunks to the user and finalize the message

### Requirement: Utility function tests
The system SHALL test utility functions including pairing code generation, app scanner, and permission tier classification.

#### Scenario: Generate pairing code
- **WHEN** `generatePairingCode()` is called
- **THEN** it SHALL return a valid, unique pairing code

#### Scenario: Static scanner detects forbidden API
- **WHEN** the scanner analyzes code containing `eval()`
- **THEN** it SHALL flag the violation with the specific pattern detected
