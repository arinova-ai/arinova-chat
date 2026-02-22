## ADDED Requirements

### Requirement: Broadcast user messages to all group agents
The system SHALL deliver user messages to ALL agents in a group conversation. Each agent independently decides whether to respond. The platform SHALL NOT use @mentions or any content parsing to determine routing.

#### Scenario: User sends message in group with 3 agents
- **WHEN** user sends "Hello everyone" in a group with agents A, B, and C
- **THEN** agents A, B, and C all receive the message as a task

#### Scenario: User sends message in group with 1 agent
- **WHEN** user sends a message in a group with only agent A
- **THEN** agent A receives the message (behaves like a direct conversation)

### Requirement: Multiple agents can stream responses simultaneously
The system SHALL support multiple agents streaming responses at the same time in the same conversation. Each agent's response SHALL be an independent message row with its own streaming lifecycle.

#### Scenario: Two agents respond simultaneously
- **WHEN** agents A and B both respond to a user message in a group
- **THEN** two separate message bubbles are displayed, each streaming independently with its own `stream_start` / `stream_chunk` / `stream_end` events

#### Scenario: Per-conversation queue allows concurrent agent streams
- **WHEN** agent A is streaming a response and agent B also starts responding
- **THEN** both streams proceed concurrently (the queue is per-agent-per-conversation, not per-conversation)

### Requirement: Track message sender agent
The system SHALL store `sender_agent_id` on all agent messages to identify which agent sent the message. This field SHALL be set for both direct and group conversations.

#### Scenario: Agent message in group displays sender identity
- **WHEN** an agent message is rendered in a group conversation
- **THEN** the message bubble shows the agent's name and avatar

#### Scenario: Agent message in direct conversation
- **WHEN** an agent message is rendered in a direct conversation
- **THEN** the message bubble shows the agent's name and avatar (consistent with group behavior)

### Requirement: Agent task payload includes group context
The system SHALL include conversation context in agent task payloads: conversation type (direct/group), list of group members (agent IDs and names), and reply-to content if applicable.

#### Scenario: Agent receives group context
- **WHEN** user sends a message in a group conversation
- **THEN** each agent's task payload includes `conversationType: "group"` and a `members` array listing all agents in the group

#### Scenario: Agent receives direct context
- **WHEN** user sends a message in a direct conversation
- **THEN** the agent's task payload includes `conversationType: "direct"` with no members array
