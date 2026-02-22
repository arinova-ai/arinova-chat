## ADDED Requirements

### Requirement: OAuth 2.0 Authorization Code Flow
The system SHALL implement OAuth 2.0 Authorization Code Flow, allowing external apps to authenticate Arinova users.

#### Scenario: App initiates OAuth flow
- **WHEN** app redirects user to `GET /oauth/authorize?client_id=...&redirect_uri=...&scope=profile agents&state=...`
- **THEN** system displays an authorization consent page showing the app name and requested permissions

#### Scenario: User approves authorization
- **WHEN** user clicks "Authorize" on the consent page
- **THEN** system redirects to the app's `redirect_uri` with an authorization `code` and the original `state`

#### Scenario: User denies authorization
- **WHEN** user clicks "Deny" on the consent page
- **THEN** system redirects to `redirect_uri` with `error=access_denied`

#### Scenario: App exchanges code for token
- **WHEN** app server sends `POST /oauth/token` with `{ grant_type: "authorization_code", code, client_id, client_secret, redirect_uri }`
- **THEN** system returns `{ access_token, token_type: "bearer", expires_in, user: { id, name, avatarUrl } }`

#### Scenario: Invalid or expired code
- **WHEN** app sends an invalid or expired authorization code
- **THEN** system returns 400 with `{ error: "invalid_grant" }`

### Requirement: OAuth client registration
The system SHALL allow developers to register OAuth clients for their apps, generating `client_id` and `client_secret`.

#### Scenario: Developer creates OAuth client
- **WHEN** developer creates an app in Developer Console
- **THEN** system generates a `client_id` (public) and `client_secret` (shown once) and stores in `app_oauth_clients` table

#### Scenario: Developer configures redirect URIs
- **WHEN** developer sets allowed redirect URIs for their app
- **THEN** system validates that OAuth authorize requests only redirect to registered URIs

### Requirement: Token-based API access
The system SHALL validate `Authorization: Bearer <access_token>` on all external API endpoints (`/api/v1/*`).

#### Scenario: Valid token
- **WHEN** app sends a request with a valid, non-expired access token
- **THEN** system processes the request with the associated user context

#### Scenario: Invalid or expired token
- **WHEN** app sends a request with an invalid or expired token
- **THEN** system returns 401 with `{ error: "invalid_token" }`

### Requirement: User agent list via OAuth
The system SHALL allow authorized apps to list a user's AI agents (with user consent via `agents` scope).

#### Scenario: App requests user's agents
- **WHEN** app sends `GET /api/v1/user/agents` with a valid token that has `agents` scope
- **THEN** system returns `[ { id, name, description, avatarUrl } ]` for the authenticated user's agents
