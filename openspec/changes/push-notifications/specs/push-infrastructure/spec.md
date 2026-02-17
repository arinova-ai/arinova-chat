## ADDED Requirements

### Requirement: VAPID key management
The system SHALL use VAPID keys for Web Push authentication. Keys SHALL be configured via environment variables (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).

#### Scenario: Server starts with VAPID keys
- **WHEN** the server starts with valid VAPID environment variables
- **THEN** the push service SHALL initialize successfully

#### Scenario: Missing VAPID keys
- **WHEN** the server starts without VAPID keys configured
- **THEN** the push service SHALL log a warning and disable push notifications gracefully (not crash)

### Requirement: Service Worker registration
The system SHALL register a Service Worker on the frontend that handles push events and notification clicks.

#### Scenario: Service Worker registers on page load
- **WHEN** a user loads the app in a browser that supports Service Workers
- **THEN** the system SHALL register the Service Worker and it SHALL be ready to receive push events

#### Scenario: Browser does not support Service Workers
- **WHEN** a user loads the app in a browser without Service Worker support
- **THEN** the system SHALL skip registration silently without errors

### Requirement: Push subscription management
The system SHALL store push subscriptions (endpoint, p256dh key, auth key) in the `push_subscriptions` table. One user MAY have multiple subscriptions (multi-device).

#### Scenario: Subscribe to push
- **WHEN** a user grants notification permission
- **THEN** the system SHALL create a PushSubscription via the Push API and POST it to the server for storage

#### Scenario: Multiple devices
- **WHEN** a user subscribes from a second device
- **THEN** the system SHALL store both subscriptions and deliver push to all active devices

#### Scenario: Unsubscribe
- **WHEN** a user revokes notification permission or unsubscribes
- **THEN** the system SHALL remove the subscription from the server

#### Scenario: Expired subscription cleanup
- **WHEN** the server attempts to send a push and receives a 410 Gone response
- **THEN** the system SHALL delete the expired subscription from the database

### Requirement: Push delivery service
The system SHALL provide a server-side push delivery service that sends Web Push notifications to subscribed users using the `web-push` library.

#### Scenario: Send push to user
- **WHEN** a push notification is triggered for a user with active subscriptions
- **THEN** the service SHALL send the push payload to all of the user's subscriptions

#### Scenario: User has no subscriptions
- **WHEN** a push notification is triggered for a user with no subscriptions
- **THEN** the service SHALL skip silently without error

### Requirement: VAPID public key endpoint
The system SHALL expose `GET /api/push/vapid-key` to provide the VAPID public key to the frontend for subscription creation.

#### Scenario: Frontend fetches VAPID key
- **WHEN** the frontend requests the VAPID public key
- **THEN** the server SHALL return the public key string
