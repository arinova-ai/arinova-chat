## ADDED Requirements

### Requirement: Agent ownership
The system SHALL assign a permanent, non-transferable owner to each agent. The owner is the user who created the agent. All API costs are billed to the owner.

#### Scenario: Agent displayed with owner
- **WHEN** an agent is shown in a group conversation
- **THEN** the display includes the owner's username (e.g., "Alice · ripple's agent")

#### Scenario: Owner identified on agent member record
- **WHEN** an agent is added to a group conversation
- **THEN** `conversation_members.owner_user_id` is set to the adding user's ID

### Requirement: Agent listen modes
The system SHALL support listen modes on agent conversation members: `owner_only` (default), `allowed_users`, `all_mentions`. The mode is controlled by the agent's owner and visible to all group members.

#### Scenario: owner_only mode (default)
- **WHEN** User B @mentions an agent in owner_only mode and User B is NOT the owner
- **THEN** the message is NOT sent to the agent

#### Scenario: owner_only mode — owner mentions
- **WHEN** the owner @mentions their agent in owner_only mode
- **THEN** the message IS sent to the agent

#### Scenario: allowed_users mode
- **WHEN** User B (in the agent's allowed_users list) @mentions the agent
- **THEN** the message IS sent to the agent

#### Scenario: allowed_users mode — unlisted user
- **WHEN** User C (NOT in the agent's allowed_users list and NOT the owner) @mentions the agent
- **THEN** the message is NOT sent to the agent

#### Scenario: all_mentions mode
- **WHEN** any group member @mentions the agent in all_mentions mode
- **THEN** the message IS sent to the agent

### Requirement: Two-layer agent message filtering (mention_only × listen_mode)
The system SHALL use two layers to determine whether a message reaches an agent. Layer 1: the conversation-level `mention_only` setting. Layer 2: the per-agent `listen_mode`. When `mention_only = false`, ALL messages are delivered to ALL agents (listen_mode is ignored). When `mention_only = true`, only @mentions trigger agents and listen_mode filters who can trigger.

#### Scenario: mention_only=false — all messages delivered
- **WHEN** a user sends a message (without @mention) in a group with `mention_only = false`
- **THEN** ALL agents in the group receive the message regardless of their listen_mode

#### Scenario: mention_only=true — listen_mode applied
- **WHEN** a non-owner sends an @mention in a group with `mention_only = true` and the agent is in `owner_only` mode
- **THEN** the agent does NOT receive the message

#### Scenario: Default for multi-user groups
- **WHEN** a new multi-user group is created
- **THEN** `mention_only` defaults to `true`

### Requirement: Agent task payload includes sender info
The system SHALL include `senderUserId` and `senderUsername` in agent task payloads so agents know who triggered them.

#### Scenario: Task payload with sender
- **WHEN** User A @mentions an agent and the listen mode allows it
- **THEN** the task sent to the agent includes `senderUserId` and `senderUsername` for User A

### Requirement: Agent frequency alert
The system SHALL alert the agent's owner if the agent is @mentioned excessively, suggesting `/agent mode owner_only`.

#### Scenario: Excessive mentions trigger alert
- **WHEN** an agent receives more than a threshold of mentions in a short period
- **THEN** the owner receives a notification suggesting to restrict the listen mode

### Requirement: Agent replies are public
In group conversations, all agent replies SHALL be visible to all group members regardless of listen mode settings.

#### Scenario: Agent reply visible to all
- **WHEN** an agent responds to a message in a group
- **THEN** all group members can see the agent's reply
