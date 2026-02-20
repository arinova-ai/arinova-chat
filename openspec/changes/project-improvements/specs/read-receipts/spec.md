## ADDED Requirements

### Requirement: Read receipt tracking
The system SHALL track when a user has read messages in a conversation and display read status on sent messages.

#### Scenario: Message marked as read
- **WHEN** user opens a conversation and views messages
- **THEN** server records the latest read message ID/timestamp for that user

#### Scenario: Read status displayed
- **WHEN** user views their sent messages in a 1v1 conversation
- **THEN** a "Read" or checkmark indicator appears on messages the agent/recipient has acknowledged

#### Scenario: Unread indicator on conversation list
- **WHEN** new messages arrive in a conversation the user hasn't opened
- **THEN** the conversation shows an unread count badge (already exists, verify integration)
