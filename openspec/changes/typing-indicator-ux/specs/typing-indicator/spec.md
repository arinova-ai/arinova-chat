## ADDED Requirements

### Requirement: Typing indicator on stream_start
The system SHALL display a typing indicator at the bottom of the message list when a `stream_start` event is received, instead of creating a message bubble.

#### Scenario: Single agent starts thinking
- **WHEN** a `stream_start` event arrives for agent "Ron" in a conversation
- **THEN** a typing indicator SHALL appear showing "Ron 思考中..."
- **AND** no message bubble SHALL be created

#### Scenario: Multiple agents thinking in group
- **WHEN** `stream_start` events arrive for agents "Ron" and "Alice" in the same conversation
- **THEN** the typing indicator SHALL show "Ron, Alice 思考中..."

#### Scenario: Typing indicator only visible for active conversation
- **WHEN** thinking agents exist for a non-active conversation
- **THEN** no typing indicator SHALL be displayed

### Requirement: Message creation on first chunk
The system SHALL create the message bubble only when the first `stream_chunk` arrives for a given messageId, using the metadata (messageId, seq, agentId, agentName) stored from the corresponding `stream_start`.

#### Scenario: First chunk creates message
- **WHEN** the first `stream_chunk` arrives for a messageId that is in `thinkingAgents`
- **THEN** a message bubble SHALL be created with the chunk as initial content and status "streaming"
- **AND** the agent SHALL be removed from the typing indicator

#### Scenario: Subsequent chunks append normally
- **WHEN** a `stream_chunk` arrives for a messageId that already has a message bubble
- **THEN** the chunk SHALL be appended to the existing message content

### Requirement: Clean removal on error without content
The system SHALL remove the agent from the typing indicator without creating a message bubble when `stream_error` arrives and no chunks have been received.

#### Scenario: Agent disconnects before any chunks
- **WHEN** a `stream_error` event arrives for a messageId that is still in `thinkingAgents` (no chunks received)
- **THEN** the agent SHALL be removed from the typing indicator
- **AND** no message bubble SHALL be created

#### Scenario: Agent errors after chunks started
- **WHEN** a `stream_error` event arrives for a messageId that has an existing message bubble
- **THEN** the message bubble SHALL show the error content with status "error"

### Requirement: Clean removal on stream_end without content
The system SHALL remove the agent from the typing indicator without creating a message bubble when `stream_end` arrives and no chunks have been received.

#### Scenario: Stream ends without any chunks
- **WHEN** a `stream_end` event arrives for a messageId that is still in `thinkingAgents`
- **THEN** the agent SHALL be removed from the typing indicator
- **AND** no empty message bubble SHALL be created

### Requirement: Scroll behavior with typing indicator
The system SHALL scroll to the bottom of the message list when the typing indicator appears or when a new message is created from the first chunk.

#### Scenario: Typing indicator triggers scroll
- **WHEN** a typing indicator appears and the user is near the bottom of the chat
- **THEN** the view SHALL scroll to keep the indicator visible
