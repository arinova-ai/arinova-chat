## ADDED Requirements

### Requirement: Notification permission request flow
The system SHALL prompt users to grant notification permission with a friendly, non-intrusive UI after their first successful login.

#### Scenario: First login prompt
- **WHEN** a user logs in for the first time and the browser supports push
- **THEN** the system SHALL show a prompt explaining the benefits of notifications with "Enable" and "Later" options

#### Scenario: User clicks Enable
- **WHEN** the user clicks "Enable"
- **THEN** the system SHALL trigger the browser's native notification permission dialog

#### Scenario: User clicks Later
- **WHEN** the user clicks "Later"
- **THEN** the system SHALL dismiss the prompt and remind again after 3 days

### Requirement: iOS Home Screen guidance
The system SHALL detect iOS Safari users who have not added the app to Home Screen and show a step-by-step guidance banner.

#### Scenario: iOS user without Home Screen install
- **WHEN** an iOS Safari user visits the app and it's not running as a standalone PWA
- **THEN** the system SHALL display a guidance banner with steps to add to Home Screen

#### Scenario: Already installed as PWA
- **WHEN** the app is running in standalone mode (added to Home Screen)
- **THEN** the system SHALL NOT show the guidance banner

### Requirement: Notification settings page
The system SHALL add a notification settings section in the user settings page with toggles for each notification type, quiet hours configuration, and global toggle.

#### Scenario: User views notification settings
- **WHEN** a user navigates to settings → notifications
- **THEN** the system SHALL display all notification type toggles, quiet hours picker, and global toggle with current values

#### Scenario: User updates settings
- **WHEN** a user toggles a notification type and saves
- **THEN** the system SHALL persist the change and confirm with a success indicator

### Requirement: Notification click navigation
The system SHALL navigate the user to the relevant content when they click a push notification.

#### Scenario: Click message notification
- **WHEN** a user clicks a push notification for a new message
- **THEN** the app SHALL open and navigate to that conversation

#### Scenario: Click playground notification
- **WHEN** a user clicks a push notification for a playground event
- **THEN** the app SHALL open and navigate to that playground session
