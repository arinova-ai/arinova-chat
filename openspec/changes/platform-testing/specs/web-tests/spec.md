## ADDED Requirements

### Requirement: Chat store tests
The system SHALL test the Zustand chat store logic including conversation management, message handling, and agent health tracking.

#### Scenario: Add conversation to store
- **WHEN** `addConversation()` is called with a valid conversation
- **THEN** the store SHALL add it to the conversations list and it SHALL be retrievable

#### Scenario: Set active conversation
- **WHEN** `setActiveConversation()` is called with a conversation ID
- **THEN** the store SHALL update the active conversation and load its messages

### Requirement: Chat component tests
The system SHALL test key chat components including ChatArea, MessageBubble, Sidebar, and input components.

#### Scenario: MessageBubble renders markdown
- **WHEN** a MessageBubble receives a message with markdown content
- **THEN** it SHALL render the markdown correctly with syntax highlighting

#### Scenario: Sidebar displays conversations
- **WHEN** the Sidebar renders with conversations in the store
- **THEN** it SHALL display conversation items with agent names and last messages

### Requirement: Auth component tests
The system SHALL test login and register page components including form validation and submission.

#### Scenario: Login form validation
- **WHEN** user submits login form with empty fields
- **THEN** the form SHALL display validation error messages

#### Scenario: Register form submission
- **WHEN** user fills in valid registration data and submits
- **THEN** the form SHALL call the register API with correct payload

### Requirement: Utility function tests
The system SHALL test web utility functions including API client helpers, WebSocket manager, and auth client.

#### Scenario: API client handles errors
- **WHEN** the API client receives a non-OK response
- **THEN** it SHALL throw an error with the response status and message

### Requirement: Hook tests
The system SHALL test custom React hooks including useAutoScroll.

#### Scenario: Auto scroll on new message
- **WHEN** useAutoScroll is active and a new message arrives
- **THEN** the scroll position SHALL move to the bottom
