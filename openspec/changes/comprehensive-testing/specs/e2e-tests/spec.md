## ADDED Requirements

### Requirement: Auth flow E2E tests
The system SHALL have Playwright tests covering the complete authentication lifecycle.

#### Scenario: Register new user
- **WHEN** navigating to /register and submitting valid credentials
- **THEN** the user is redirected to the chat interface

#### Scenario: Login with existing user
- **WHEN** navigating to /login and submitting valid credentials
- **THEN** the user is redirected to the chat interface with conversations loaded

#### Scenario: Logout
- **WHEN** clicking the sign out button in the sidebar
- **THEN** the user is redirected to /login

#### Scenario: Auth guard redirect
- **WHEN** navigating to / without being logged in
- **THEN** the user is redirected to /login

### Requirement: Chat flow E2E tests
The system SHALL have Playwright tests covering the core messaging experience.

#### Scenario: Create bot and start conversation
- **WHEN** clicking "Create Bot", entering a name, and submitting
- **THEN** a new bot is created and appears in the agent list

#### Scenario: Send message
- **WHEN** typing a message in the chat input and pressing Enter
- **THEN** the message appears in the message list as a user message

#### Scenario: Conversation appears in sidebar
- **WHEN** a new conversation is created
- **THEN** it appears in the conversation list in the sidebar

### Requirement: Conversation management E2E tests
The system SHALL have Playwright tests for conversation lifecycle operations.

#### Scenario: Rename conversation
- **WHEN** opening the conversation dropdown and selecting Rename, then entering a new name
- **THEN** the conversation title updates in the sidebar

#### Scenario: Pin conversation
- **WHEN** opening the conversation dropdown and clicking Pin
- **THEN** the conversation shows a pin indicator and moves to the top

#### Scenario: Delete conversation
- **WHEN** opening the conversation dropdown, clicking Delete, and confirming
- **THEN** the conversation is removed from the sidebar

### Requirement: Bot management E2E tests
The system SHALL have Playwright tests for bot configuration.

#### Scenario: Edit bot name and description
- **WHEN** opening the bot manage dialog and changing name/description, then saving
- **THEN** the updated name appears in the chat header and conversation list

#### Scenario: Delete bot
- **WHEN** opening the bot manage dialog, clicking "Delete Bot", and confirming twice
- **THEN** the bot and its conversations are removed

### Requirement: Settings E2E tests
The system SHALL have Playwright tests for the settings page.

#### Scenario: Update display name
- **WHEN** navigating to /settings, changing the name, and submitting
- **THEN** a success message appears and the name is updated

#### Scenario: Change password validation
- **WHEN** entering mismatched new and confirm passwords
- **THEN** an inline error is displayed without submitting to the server

### Requirement: Responsive layout E2E tests
The system SHALL have Playwright tests verifying mobile vs desktop layout behavior.

#### Scenario: Mobile shows sidebar or chat, not both
- **WHEN** viewing on a mobile viewport (375px width)
- **THEN** only the sidebar or chat area is visible, never both simultaneously

#### Scenario: Desktop shows sidebar and chat together
- **WHEN** viewing on a desktop viewport (1280px width)
- **THEN** both sidebar and chat area are visible side by side
