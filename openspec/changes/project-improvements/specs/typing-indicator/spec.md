## ADDED Requirements

### Requirement: Typing indicator for agent responses
The frontend SHALL display a "typing" animation when an agent is processing a message before streaming begins.

#### Scenario: Agent starts processing
- **WHEN** user sends a message and the server begins forwarding to the agent
- **THEN** a typing indicator (animated dots) appears in the chat below the user's message

#### Scenario: Streaming begins
- **WHEN** the agent starts streaming its response
- **THEN** the typing indicator is replaced by the actual streaming message bubble

#### Scenario: Agent fails to respond
- **WHEN** the agent does not respond within 30 seconds
- **THEN** the typing indicator disappears and an error message is shown
