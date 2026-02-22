## ADDED Requirements

### Requirement: Vitest configuration for server
The system SHALL have a Vitest configuration at `apps/server/vitest.config.ts` that resolves TypeScript paths, sets the test environment to `node`, and includes all `**/*.test.ts` files.

#### Scenario: Server unit tests run successfully
- **WHEN** running `pnpm --filter server test`
- **THEN** Vitest discovers and executes all test files in `apps/server/src/`

### Requirement: Vitest configuration for web
The system SHALL have a Vitest configuration at `apps/web/vitest.config.ts` that uses `jsdom` environment, configures React Testing Library setup, and includes all `**/*.test.ts` and `**/*.test.tsx` files.

#### Scenario: Frontend tests run with jsdom
- **WHEN** running `pnpm --filter web test`
- **THEN** Vitest executes component tests in a jsdom environment with React Testing Library available

### Requirement: Playwright configuration
The system SHALL have a Playwright configuration at `e2e/playwright.config.ts` that targets `http://localhost:3500` as the base URL, configures the `webServer` to start both backend (port 3501) and frontend (port 3500), and runs tests in Chromium.

#### Scenario: E2E tests launch dev servers automatically
- **WHEN** running `pnpm test:e2e` from the project root
- **THEN** Playwright starts the backend and frontend servers, waits for them to be ready, and executes all E2E test files

### Requirement: Test database utilities
The system SHALL provide a `test-utils/db.ts` module that exports functions to create a test database connection, truncate all tables, and close the connection.

#### Scenario: Test database cleanup between tests
- **WHEN** a test file calls `truncateAll()` in `beforeEach`
- **THEN** all business tables (agents, conversations, messages, etc.) are emptied while preserving schema

### Requirement: Mock factories
The system SHALL provide a `test-utils/factories.ts` module with factory functions for creating test entities: `createTestUser()`, `createTestAgent()`, `createTestConversation()`, `createTestMessage()`.

#### Scenario: Factory creates valid test user
- **WHEN** calling `createTestUser()` without arguments
- **THEN** it returns a user object with a unique ID, valid email, and name suitable for database insertion

#### Scenario: Factory accepts overrides
- **WHEN** calling `createTestAgent({ name: "Custom Bot" })`
- **THEN** it returns an agent object with name "Custom Bot" and defaults for all other fields

### Requirement: Turbo test task
The system SHALL define a `test` task in `turbo.json` and add `test` scripts to root `package.json`, `apps/server/package.json`, and `apps/web/package.json`.

#### Scenario: Root test command runs all tests
- **WHEN** running `pnpm test` from the project root
- **THEN** Turborepo executes `test` in both `server` and `web` packages

### Requirement: React Testing Library setup
The system SHALL provide a test setup file for the web package that imports `@testing-library/jest-dom/vitest` matchers, making DOM assertion matchers (e.g., `toBeInTheDocument`, `toHaveTextContent`) available in all frontend tests.

#### Scenario: Jest-dom matchers available
- **WHEN** a frontend test uses `expect(element).toBeInTheDocument()`
- **THEN** the assertion works without explicit imports in the test file
