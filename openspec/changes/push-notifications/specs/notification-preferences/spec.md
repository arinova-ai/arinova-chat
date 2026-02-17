## ADDED Requirements

### Requirement: Per-type notification toggle
The system SHALL allow users to enable/disable notifications per type (messages, playground invites, playground turns, playground results).

#### Scenario: Disable message notifications
- **WHEN** a user disables "message" notifications in settings
- **THEN** the system SHALL NOT send push notifications for new messages, but other types SHALL still be sent

#### Scenario: Enable all by default
- **WHEN** a new user grants notification permission
- **THEN** all notification types SHALL be enabled by default

### Requirement: Quiet hours
The system SHALL allow users to set quiet hours during which no push notifications are sent.

#### Scenario: Notification during quiet hours
- **WHEN** an event triggers a push during the user's quiet hours (e.g., 23:00-07:00)
- **THEN** the system SHALL suppress the push notification

#### Scenario: Notification outside quiet hours
- **WHEN** an event triggers a push outside the user's quiet hours
- **THEN** the system SHALL send the push normally

### Requirement: Global notification toggle
The system SHALL allow users to disable all push notifications with a single toggle.

#### Scenario: Global disable
- **WHEN** a user turns off the global notification toggle
- **THEN** the system SHALL NOT send any push notifications to that user

### Requirement: Notification preferences API
The system SHALL provide REST endpoints for managing notification preferences:
- `GET /api/notifications/preferences` — get current preferences
- `PUT /api/notifications/preferences` — update preferences

#### Scenario: Update preferences
- **WHEN** a user PUTs updated notification preferences
- **THEN** the system SHALL save the preferences and apply them immediately to future notifications
