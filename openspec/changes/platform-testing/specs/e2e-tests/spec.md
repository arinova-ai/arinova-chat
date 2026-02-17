## ADDED Requirements

### Requirement: Playwright setup
The system SHALL configure Playwright for E2E testing with Chrome, targeting the local development environment.

#### Scenario: Run E2E tests
- **WHEN** developer runs `pnpm test:e2e`
- **THEN** Playwright SHALL launch a browser and execute all E2E test suites

### Requirement: Auth flow E2E tests
The system SHALL test the full authentication flow including registration, login, and logout.

#### Scenario: User registers and logs in
- **WHEN** a new user fills in registration form and submits
- **THEN** the user SHALL be redirected to the chat page with an active session

#### Scenario: User logs out
- **WHEN** a logged-in user clicks sign out
- **THEN** the user SHALL be redirected to the login page and the session SHALL be invalidated

### Requirement: Chat flow E2E tests
The system SHALL test the core chat flow including creating a conversation, sending messages, and receiving responses.

#### Scenario: Create new conversation
- **WHEN** a user clicks "New Chat" and selects an agent
- **THEN** a new conversation SHALL appear in the sidebar

#### Scenario: Send and receive message
- **WHEN** a user sends a message in an active conversation
- **THEN** the message SHALL appear in the chat area and an agent response SHALL be received

### Requirement: Agent management E2E tests
The system SHALL test agent CRUD operations via the UI.

#### Scenario: Create new agent
- **WHEN** a user fills in the create bot form and submits
- **THEN** the new agent SHALL appear in the agent list
