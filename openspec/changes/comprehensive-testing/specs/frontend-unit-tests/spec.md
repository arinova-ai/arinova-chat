## ADDED Requirements

### Requirement: Chat store tests
The system SHALL have unit tests for the Zustand `useChatStore` covering all major actions and state transitions.

#### Scenario: sendMessage optimistic insert
- **WHEN** calling `sendMessage("hello")`
- **THEN** a temporary message with `temp-` prefix ID appears immediately in the conversation's message list

#### Scenario: setActiveConversation clears unreads
- **WHEN** calling `setActiveConversation(id)` for a conversation with unread count > 0
- **THEN** the unread count for that conversation becomes 0

#### Scenario: handleWSEvent stream_chunk
- **WHEN** a `stream_chunk` event is received for an active conversation
- **THEN** the streaming message's content is updated with the new chunk appended

#### Scenario: handleWSEvent stream_end
- **WHEN** a `stream_end` event is received
- **THEN** the message status changes from "streaming" to "completed"

#### Scenario: deleteConversation nulls active
- **WHEN** deleting the currently active conversation
- **THEN** `activeConversationId` becomes null

#### Scenario: toggleTimestamps persists
- **WHEN** calling `toggleTimestamps()`
- **THEN** `showTimestamps` is toggled and the value is persisted to localStorage

### Requirement: API utility tests
The system SHALL have unit tests for the `api()` fetch wrapper covering JSON handling, error throwing, 204 responses, and credential inclusion.

#### Scenario: Successful JSON response
- **WHEN** the API returns 200 with JSON body
- **THEN** the parsed JSON object is returned

#### Scenario: 204 returns undefined
- **WHEN** the API returns 204 No Content
- **THEN** the function returns undefined

#### Scenario: Error response throws ApiError
- **WHEN** the API returns 400 with error message
- **THEN** an ApiError is thrown with status 400 and the message

### Requirement: Config utility tests
The system SHALL have unit tests for the config module covering URL construction and asset URL handling.

#### Scenario: Relative asset URL prefixed
- **WHEN** calling `assetUrl("/uploads/image.png")`
- **THEN** the result is `${BACKEND_URL}/uploads/image.png`

#### Scenario: Absolute asset URL unchanged
- **WHEN** calling `assetUrl("https://cdn.example.com/image.png")`
- **THEN** the result is `https://cdn.example.com/image.png`

### Requirement: Login page tests
The system SHALL have component tests for the login page covering form rendering, submission, error display, and navigation.

#### Scenario: Renders login form
- **WHEN** the login page is rendered
- **THEN** email input, password input, and submit button are visible

#### Scenario: Shows error on failed login
- **WHEN** submitting invalid credentials
- **THEN** an error message is displayed

#### Scenario: Register link navigates
- **WHEN** clicking the "Register" link
- **THEN** navigation to /register occurs

### Requirement: Register page tests
The system SHALL have component tests for the register page covering form validation and submission.

#### Scenario: Short password shows error
- **WHEN** submitting with a password shorter than 8 characters
- **THEN** an inline error about password length is shown without calling the API

#### Scenario: Successful registration redirects
- **WHEN** submitting valid registration data
- **THEN** the user is redirected to /

### Requirement: MessageBubble component tests
The system SHALL have component tests for the MessageBubble covering user vs agent rendering, status states, and actions.

#### Scenario: User message right-aligned
- **WHEN** rendering a message with role "user"
- **THEN** the message bubble is styled as right-aligned with user colors

#### Scenario: Streaming message shows cursor
- **WHEN** rendering a message with status "streaming"
- **THEN** a streaming cursor/spinner is visible

#### Scenario: Error message shows retry
- **WHEN** rendering a message with status "error"
- **THEN** a retry button is visible

#### Scenario: Copy action copies content
- **WHEN** clicking the copy button on a completed message
- **THEN** the message content is written to clipboard

### Requirement: ChatInput component tests
The system SHALL have component tests for ChatInput covering text input, send behavior, and file attachment.

#### Scenario: Send on Enter (desktop)
- **WHEN** pressing Enter without Shift in the textarea
- **THEN** the message is sent via the store's sendMessage action

#### Scenario: Shift+Enter adds newline
- **WHEN** pressing Shift+Enter in the textarea
- **THEN** a newline is inserted and the message is not sent

#### Scenario: Send button disabled when empty
- **WHEN** the textarea is empty and no file is attached
- **THEN** the send button is disabled

### Requirement: ConversationItem component tests
The system SHALL have component tests for ConversationItem covering click, rename, pin, delete, and visual indicators.

#### Scenario: Click selects conversation
- **WHEN** clicking the conversation item
- **THEN** the onClick callback is called

#### Scenario: Unread badge shows count
- **WHEN** rendering with unreadCount=5
- **THEN** a badge showing "5" is visible

#### Scenario: Delete requires confirmation
- **WHEN** clicking delete from the dropdown menu
- **THEN** a confirmation dialog appears before actual deletion

### Requirement: MarkdownContent component tests
The system SHALL have component tests for MarkdownContent covering rendering and sanitization.

#### Scenario: Renders markdown correctly
- **WHEN** rendering content with headings, bold, and code blocks
- **THEN** the appropriate HTML elements are generated

#### Scenario: XSS content is sanitized
- **WHEN** rendering content containing `<script>` tags or `onerror` attributes
- **THEN** the dangerous elements are removed from the output

### Requirement: ConnectionBanner component tests
The system SHALL have component tests for ConnectionBanner covering status display.

#### Scenario: Hidden when connected
- **WHEN** WebSocket status is "connected"
- **THEN** the banner is not rendered

#### Scenario: Shows disconnected state
- **WHEN** WebSocket status is "disconnected"
- **THEN** a disconnected warning banner is visible
