## ADDED Requirements

### Requirement: Offline-only push delivery
The system SHALL only send push notifications to users who are **offline** (no active WebSocket connection). Online users already receive real-time updates via WebSocket.

#### Scenario: User offline receives push
- **WHEN** an event triggers a notification for an offline user
- **THEN** the system SHALL send a push notification

#### Scenario: User online skips push
- **WHEN** an event triggers a notification for a user with an active WebSocket connection
- **THEN** the system SHALL NOT send a push notification

### Requirement: New message notification
The system SHALL send a push notification when an agent replies to a user's message in a direct conversation.

#### Scenario: Agent replies while user offline
- **WHEN** an agent completes a response in a conversation and the user is offline
- **THEN** the system SHALL send a push with title "[Agent Name]" and body containing a preview of the message

### Requirement: Group message notification
The system SHALL send a push notification when an agent replies in a group conversation.

#### Scenario: Agent replies in group while user offline
- **WHEN** an agent replies in a group conversation and the user is offline
- **THEN** the system SHALL send a push with title "[Group Name]" and body "[Agent Name]: message preview"

### Requirement: Playground invitation notification
The system SHALL send a push notification when a user is invited to join a playground.

#### Scenario: User invited to playground
- **WHEN** a user is invited to a playground and is offline
- **THEN** the system SHALL send a push with title "Playground 邀請" and body describing the playground

### Requirement: Playground turn notification
The system SHALL send a push notification when it's a user's turn to act in a playground.

#### Scenario: User's turn in playground
- **WHEN** a playground phase transitions and the user needs to act, and the user is offline
- **THEN** the system SHALL send a push with title "[Playground Name]" and body "輪到你了！"

### Requirement: Playground result notification
The system SHALL send a push notification when a playground session finishes.

#### Scenario: Playground session ends
- **WHEN** a playground session finishes and a participant is offline
- **THEN** the system SHALL send a push with title "[Playground Name]" and body indicating win/loss result

### Requirement: Notification deduplication and rate limiting
The system SHALL deduplicate notifications and enforce a minimum interval between same-type notifications for the same user.

#### Scenario: Rapid messages from same agent
- **WHEN** an agent sends 5 messages in 10 seconds to an offline user
- **THEN** the system SHALL send at most 1 push notification (not 5)

#### Scenario: Rate limit per type
- **WHEN** multiple playground turn notifications trigger within 30 seconds
- **THEN** the system SHALL send only the first and suppress subsequent ones within the window
