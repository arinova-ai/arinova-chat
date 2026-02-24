## ADDED Requirements

### Requirement: Send friend request
The system SHALL allow a user to send a friend request to another user by username. Duplicate requests SHALL be rejected.

#### Scenario: Friend request sent successfully
- **WHEN** User A sends a friend request to User B
- **THEN** a pending friendship record is created and User B receives a notification

#### Scenario: Duplicate friend request rejected
- **WHEN** User A sends a friend request to User B but one already exists (pending or accepted)
- **THEN** system rejects with error "Friend request already exists"

#### Scenario: Friend request to self rejected
- **WHEN** User A sends a friend request to themselves
- **THEN** system rejects with error "Cannot send friend request to yourself"

### Requirement: Accept or reject friend request
The addressee SHALL be able to accept or reject a pending friend request.

#### Scenario: Friend request accepted
- **WHEN** User B accepts User A's friend request
- **THEN** friendship status changes to "accepted" and both users appear in each other's friend lists

#### Scenario: Friend request rejected
- **WHEN** User B rejects User A's friend request
- **THEN** the friendship record is deleted. User A can send a new request later.

### Requirement: Remove friend
Either party SHALL be able to remove a friendship. Removing a friend SHALL preserve conversation history but prevent new messages.

#### Scenario: Friend removed
- **WHEN** User A removes User B from friends
- **THEN** the friendship record is deleted, existing direct conversation is preserved but neither party can send new messages

### Requirement: Friend list
The system SHALL provide an API to list all accepted friends for a user.

#### Scenario: Friend list returned
- **WHEN** User A requests their friend list
- **THEN** system returns all users with accepted friendship status, including username, display name, and avatar

### Requirement: Direct conversation requires friendship
The system SHALL NOT allow creating a human-to-human direct conversation unless both users are friends.

#### Scenario: Direct conversation with friend succeeds
- **WHEN** User A (friend of User B) creates a direct conversation with User B
- **THEN** the direct conversation is created

#### Scenario: Direct conversation with non-friend rejected
- **WHEN** User A (not friend of User B) attempts to create a direct conversation with User B
- **THEN** system rejects with error "You must be friends to start a direct conversation"
