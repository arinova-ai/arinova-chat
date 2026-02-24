## ADDED Requirements

### Requirement: Username format validation
The system SHALL enforce username format: 3-32 characters, lowercase a-z 0-9 underscore only, MUST start with a letter, no consecutive underscores.

#### Scenario: Valid username accepted
- **WHEN** user submits username "ripple_42"
- **THEN** system accepts the username

#### Scenario: Username too short rejected
- **WHEN** user submits username "ab"
- **THEN** system rejects with error "Username must be at least 3 characters"

#### Scenario: Username with invalid characters rejected
- **WHEN** user submits username "ripple-test"
- **THEN** system rejects with error "Username can only contain lowercase letters, numbers, and underscores"

#### Scenario: Username not starting with letter rejected
- **WHEN** user submits username "42ripple"
- **THEN** system rejects with error "Username must start with a letter"

#### Scenario: Username with consecutive underscores rejected
- **WHEN** user submits username "ripple__test"
- **THEN** system rejects with error "Username cannot contain consecutive underscores"

### Requirement: Username global uniqueness
The system SHALL enforce global uniqueness of usernames. Uniqueness check SHALL be case-insensitive.

#### Scenario: Duplicate username rejected
- **WHEN** user submits username "ripple" and another user already has username "ripple"
- **THEN** system rejects with error "Username is already taken"

### Requirement: Username immutability
The system SHALL NOT allow users to change their username after registration.

#### Scenario: Username change attempt rejected
- **WHEN** user attempts to update their username via API
- **THEN** system returns 403 with error "Username cannot be changed"

### Requirement: Mandatory username at registration
The system SHALL require username selection during registration. Users MUST NOT be able to access the app without setting a username.

#### Scenario: New user redirected to username setup
- **WHEN** a newly registered user attempts to access the app without a username set
- **THEN** system redirects to username selection page

#### Scenario: Username set successfully
- **WHEN** user selects a valid, unique username on the setup page
- **THEN** username is saved and user gains access to the app

### Requirement: Username search
The system SHALL provide an API to search for users by username (prefix match).

#### Scenario: Search returns matching users
- **WHEN** user searches for "rip"
- **THEN** system returns users whose usernames start with "rip" (e.g., "ripple", "ripper")

#### Scenario: Search returns empty for no matches
- **WHEN** user searches for "zzzznonexistent"
- **THEN** system returns empty results
