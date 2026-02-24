## ADDED Requirements

### Requirement: Web Push delivery
The server SHALL send Web Push notifications using VAPID authentication with the same triggering logic as the Node.js server.

#### Scenario: Push on new message while user offline
- **WHEN** an agent completes a message and the user has no foreground connections
- **THEN** the server SHALL send a push notification to all user's subscriptions (if preferences allow)

#### Scenario: Respect quiet hours
- **WHEN** a push notification would be sent during the user's configured quiet hours
- **THEN** the server SHALL suppress the notification

#### Scenario: Deduplication
- **WHEN** multiple push-worthy events occur within 30 seconds
- **THEN** the server SHALL deduplicate by type (only send the first)

#### Scenario: Expired subscription cleanup
- **WHEN** a push delivery fails with a 410 Gone response
- **THEN** the server SHALL remove the expired subscription from the database

#### Scenario: Muted conversation
- **WHEN** a message arrives in a muted conversation
- **THEN** the server SHALL NOT send a push notification
