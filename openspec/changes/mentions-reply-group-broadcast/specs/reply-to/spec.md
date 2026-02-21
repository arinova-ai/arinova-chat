## ADDED Requirements

### Requirement: Reply to a specific message
The system SHALL allow users to reply to a specific message. The reply reference SHALL be stored as `reply_to_id` on the new message row. The replied-to message's content and sender info SHALL be displayed as a quoted preview above the reply in the message bubble.

#### Scenario: User initiates reply
- **WHEN** user selects "Reply" action on a message
- **THEN** a reply preview appears above the message input showing the original message's sender and content snippet

#### Scenario: Send reply message
- **WHEN** user sends a message while a reply preview is active
- **THEN** the message is saved with `reply_to_id` set to the referenced message's ID, and the reply preview is cleared

#### Scenario: Cancel reply
- **WHEN** user clicks the dismiss button on the reply preview
- **THEN** the reply preview is removed and the message input returns to normal mode

#### Scenario: Display reply in message bubble
- **WHEN** a message with `reply_to_id` is rendered
- **THEN** a compact quoted block showing the original message's sender name and content snippet is displayed above the message content

#### Scenario: Tap reply preview to scroll
- **WHEN** user taps/clicks the quoted reply block in a message bubble
- **THEN** the view scrolls to the original referenced message

### Requirement: Reply context sent to agents
The system SHALL include the replied-to message's content and sender info in the task payload sent to agents, so agents have context for the reply.

#### Scenario: Agent receives reply context
- **WHEN** a user sends a reply message in a conversation
- **THEN** the agent task payload includes `replyTo` with the original message's role, agent name (if agent), and content
