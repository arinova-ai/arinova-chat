## ADDED Requirements

### Requirement: Vitest coverage configuration
The system SHALL configure Vitest coverage reporting for all packages (shared, server, web) with Istanbul provider.

#### Scenario: Run coverage report
- **WHEN** developer runs `pnpm test:coverage`
- **THEN** the system SHALL generate a coverage report showing line, branch, function, and statement coverage per package

### Requirement: Test utilities and mock factories
The system SHALL provide shared test utilities including mock user factory, mock agent factory, mock conversation factory, and auth helper for creating authenticated test contexts.

#### Scenario: Create mock user in test
- **WHEN** a test calls `createMockUser()` from test utilities
- **THEN** it SHALL return a valid User object with randomized but realistic data

#### Scenario: Create authenticated test context
- **WHEN** a test calls `createAuthContext()` from test utilities
- **THEN** it SHALL return a mock session with valid auth token for use in API route tests

### Requirement: Test database setup
The system SHALL provide a test database setup script that creates/resets a `arinova_test` database and runs Drizzle migrations.

#### Scenario: Setup test database
- **WHEN** developer runs the test database setup
- **THEN** the system SHALL create the test database, run all migrations, and confirm readiness

#### Scenario: Reset between test suites
- **WHEN** an integration test suite starts
- **THEN** the system SHALL truncate all tables to ensure clean state
