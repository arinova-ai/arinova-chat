## ADDED Requirements

### Requirement: Password authentication compatible with Better Auth
The Rust server SHALL hash new passwords with argon2id and SHALL verify existing passwords hashed by Better Auth's argon2id implementation.

#### Scenario: Existing user login
- **WHEN** a user who registered via the Node.js server attempts to log in
- **THEN** the Rust server SHALL successfully verify their password against the existing argon2id hash in the `account` table

#### Scenario: New user registration
- **WHEN** a new user registers with email and password
- **THEN** the server SHALL create entries in `user` and `account` tables with argon2id-hashed password, matching Better Auth's schema

### Requirement: Session management
The server SHALL manage sessions via the existing `session` table with cookie-based tokens.

#### Scenario: Login creates session
- **WHEN** a user successfully authenticates
- **THEN** the server SHALL insert a row into `session` table and set a secure HttpOnly cookie with the session token

#### Scenario: Session validation
- **WHEN** a request includes a valid session cookie
- **THEN** the `requireAuth` middleware SHALL extract user ID, email, and name from the session

#### Scenario: Session expiry
- **WHEN** a session is older than 30 days
- **THEN** the server SHALL reject it and require re-authentication

### Requirement: OAuth flows (Google + GitHub)
The server SHALL implement OAuth2 authorization code flow for Google and GitHub, writing to the same `account` table rows as Better Auth.

#### Scenario: Google OAuth login
- **WHEN** a user initiates Google OAuth
- **THEN** the server SHALL redirect to Google, handle the callback, create/update user and account records, and set a session cookie

#### Scenario: GitHub OAuth login
- **WHEN** a user initiates GitHub OAuth
- **THEN** the server SHALL redirect to GitHub, handle the callback, create/update user and account records, and set a session cookie

### Requirement: Auth API path compatibility
All auth endpoints SHALL be served under `/api/auth/*` with the same paths and response shapes as Better Auth.

#### Scenario: Sign up endpoint
- **WHEN** POST `/api/auth/sign-up/email` is called with email and password
- **THEN** the server SHALL create the user and return the session data

#### Scenario: Sign in endpoint
- **WHEN** POST `/api/auth/sign-in/email` is called with valid credentials
- **THEN** the server SHALL return session data and set session cookie

#### Scenario: Sign out endpoint
- **WHEN** POST `/api/auth/sign-out` is called
- **THEN** the server SHALL delete the session and clear the cookie

#### Scenario: Get session endpoint
- **WHEN** GET `/api/auth/get-session` is called with a valid session cookie
- **THEN** the server SHALL return the current user and session data
