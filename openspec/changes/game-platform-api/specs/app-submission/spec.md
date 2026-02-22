## ADDED Requirements

### Requirement: Developer submits app
The system SHALL allow developers to submit a new app via the Developer Console, providing name, description, category, icon, external URL.

#### Scenario: App submission
- **WHEN** developer fills in app details and clicks "Submit"
- **THEN** system creates an app record with status "draft", generates `client_id` and `client_secret`, and displays them to the developer

### Requirement: Developer manages app
The system SHALL allow developers to edit their app's details, view API credentials, and manage app status.

#### Scenario: Edit app details
- **WHEN** developer updates app name, description, or URL
- **THEN** system saves the changes

#### Scenario: View API credentials
- **WHEN** developer views app settings
- **THEN** system displays `client_id` (always visible) and option to regenerate `client_secret`

#### Scenario: Regenerate secret
- **WHEN** developer clicks "Regenerate Secret"
- **THEN** system generates a new `client_secret`, invalidates the old one, and displays the new secret once

### Requirement: App publishing
The system SHALL allow apps to be published (made visible in the app directory) after review.

#### Scenario: Developer requests publish
- **WHEN** developer clicks "Publish" on a draft app
- **THEN** system changes app status to "published" and the app appears in the app directory

### Requirement: App usage dashboard
The system SHALL show developers basic usage metrics for their apps.

#### Scenario: Developer views dashboard
- **WHEN** developer navigates to their app's dashboard
- **THEN** system displays total users, agent API calls, and economy transactions
