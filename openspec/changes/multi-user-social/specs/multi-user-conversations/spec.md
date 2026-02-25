## ADDED Requirements

### Requirement: Conversation user members
The system SHALL track user membership in conversations via `conversation_user_members` table. Each member has a role (admin, vice_admin, member).

#### Scenario: Creator added as admin
- **WHEN** a user creates a group conversation
- **THEN** the creator is added to `conversation_user_members` with role "admin"

#### Scenario: User joins via invite link
- **WHEN** a user joins a group via invite link
- **THEN** the user is added to `conversation_user_members` with role "member"

### Requirement: Human-to-human direct conversation
The system SHALL support direct conversations between two human users. Creating a human-to-human direct conversation requires mutual friendship.

#### Scenario: Direct conversation with friend
- **WHEN** User A (friend of User B) creates a direct conversation with User B
- **THEN** the direct conversation is created with both users as members

#### Scenario: Direct conversation with non-friend rejected
- **WHEN** User A (not friend of User B) attempts to create a direct conversation with User B
- **THEN** system rejects with error "You must be friends to start a direct conversation"

#### Scenario: Existing direct conversation reused
- **WHEN** User A creates a direct conversation with User B but one already exists
- **THEN** system returns the existing conversation instead of creating a duplicate

### Requirement: Multi-user group conversation
The system SHALL support group conversations with up to 50 human users and up to 10 agents.

#### Scenario: Group created successfully
- **WHEN** a user creates a group conversation with a title
- **THEN** a group conversation is created with the creator as admin

#### Scenario: User limit enforced
- **WHEN** a 51st user attempts to join a group with 50 members
- **THEN** system rejects with error "Group has reached the maximum of 50 users"

#### Scenario: Agent limit enforced
- **WHEN** a user attempts to add an 11th agent to a group with 10 agents
- **THEN** system rejects with error "Group has reached the maximum of 10 agents"

### Requirement: Message sender identification
The system SHALL identify the sender of each message in multi-user conversations via `sender_user_id` field.

#### Scenario: User message in group
- **WHEN** User A sends a message in a group conversation
- **THEN** the message is stored with `sender_user_id = User A's ID` and delivered to all group members

#### Scenario: Legacy single-user message
- **WHEN** a message exists without `sender_user_id` (pre-migration)
- **THEN** system infers sender from `conversations.user_id`

### Requirement: WebSocket delivery to all members
The system SHALL deliver messages to all user members of a conversation via WebSocket.

#### Scenario: Message broadcast in group
- **WHEN** User A sends a message in a group with Users B, C, D
- **THEN** Users B, C, D all receive the message via their WebSocket connections

#### Scenario: Blocked user filtered from delivery
- **WHEN** User A sends a message but User C has blocked User A
- **THEN** User C does NOT receive User A's message (server-side filter)

### Requirement: Group settings
The system SHALL support per-group settings: history visibility, max users, max agents, invite link, invite enabled.

#### Scenario: History visible for new member
- **WHEN** a new member joins a group with `history_visible = true`
- **THEN** the member can see messages from before they joined

#### Scenario: History hidden for new member
- **WHEN** a new member joins a group with `history_visible = false`
- **THEN** the member can only see messages from after they joined
