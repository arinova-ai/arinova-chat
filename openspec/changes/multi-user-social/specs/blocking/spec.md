## ADDED Requirements

### Requirement: Block a user
The system SHALL allow a user to block another user. Blocking is bidirectional in effect — neither party can interact with the other.

#### Scenario: User blocks another user
- **WHEN** User A blocks User B
- **THEN** a friendship record with status "blocked" is created (requester_id = A). Any existing friendship is replaced.

### Requirement: Unblock a user
The system SHALL allow a user to unblock a user they previously blocked. Unblocking removes the block record but does NOT restore friendship.

#### Scenario: User unblocks
- **WHEN** User A unblocks User B
- **THEN** the block record is deleted. They are no longer friends; User A must send a new friend request if desired.

### Requirement: Block hides messages in groups
In shared group conversations, the system SHALL hide messages from blocked users (and their agents) from the blocker. This is a server-side filter — messages are stored but not delivered.

#### Scenario: Blocked user's message hidden
- **WHEN** User B (blocked by User A) sends a message in a shared group
- **THEN** User A does NOT receive the message via WebSocket

#### Scenario: Blocked user's agent messages hidden
- **WHEN** User B's agent sends a message in a shared group
- **THEN** User A does NOT receive the agent's message via WebSocket

### Requirement: Block prevents agent interaction
Blocking SHALL prevent the blocked user's @mentions from reaching the blocker's agents, and the blocker's @mentions from reaching the blocked user's agents.

#### Scenario: Blocked user cannot trigger blocker's agent
- **WHEN** User B (blocked by User A) @mentions User A's agent in a group
- **THEN** the agent does NOT receive the task

#### Scenario: Blocker cannot trigger blocked user's agent
- **WHEN** User A @mentions User B's agent in a group (User A blocked User B)
- **THEN** User B's agent does NOT receive the task

### Requirement: Block prevents direct conversation
Blocking SHALL prevent creating new direct conversations and sending messages in existing ones.

#### Scenario: Direct conversation with blocked user rejected
- **WHEN** User A (who blocked User B) attempts to create a direct conversation with User B
- **THEN** system rejects the request

#### Scenario: Existing direct conversation blocked
- **WHEN** User A blocks User B and they have an existing direct conversation
- **THEN** neither party can send new messages in that conversation
