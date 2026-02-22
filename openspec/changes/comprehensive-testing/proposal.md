## Why

The Arinova Chat project has zero automated tests. No unit tests, no integration tests, no E2E tests. As the codebase grows (17 route files, 2 WebSocket handlers, 17+ frontend components, Zustand store, marketplace, communities), regressions are invisible until users hit them. Adding comprehensive testing now prevents compounding tech debt and enables confident refactoring.

## What Changes

- Add Vitest as the test runner for both `apps/server` and `apps/web`
- Add React Testing Library for frontend component tests
- Add Playwright for end-to-end UI tests
- Create test infrastructure: database setup/teardown, mock factories, WebSocket test helpers
- Write unit tests for all pure utility functions (sandbox executor, app scanner, permission tier, rate limiter, message-seq, A2A SSE parser)
- Write integration tests for all server API routes against a test database
- Write WebSocket protocol tests for client and agent handlers
- Write frontend component tests for all chat components, auth pages, and settings
- Write Zustand store tests for all actions and state transitions
- Write Playwright E2E tests for all major user flows (auth, chat, bot management, conversation management, settings)
- Add `test` scripts to all package.json files and the root turbo.json

## Capabilities

### New Capabilities
- `test-infrastructure`: Test framework setup (Vitest, RTL, Playwright), configs, test database utilities, mock factories, shared test helpers
- `server-unit-tests`: Unit tests for pure server functions — sandbox executor, app-scanner, permission-tier, rate limiters, A2A client SSE parsing, message-seq
- `server-integration-tests`: Integration tests for all 17 API route files and 2 WebSocket handlers against test DB and mocked external services
- `frontend-unit-tests`: Unit tests for Zustand store, lib utilities (api.ts, ws.ts, config.ts, push.ts), and React component tests for all chat components and pages
- `e2e-tests`: Playwright end-to-end tests covering auth flows, chat flows, conversation management, bot management, settings, and responsive layout

### Modified Capabilities

## Impact

- **New dependencies**: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@playwright/test`, `jsdom`, `msw` (for API mocking)
- **New files**: Test configs, test utilities, ~50+ test files across server and web
- **Package.json changes**: New `test`, `test:unit`, `test:e2e` scripts in server, web, and root
- **turbo.json**: New `test` task definition
- **Docker**: Test database may use existing docker-compose PostgreSQL on a separate database name
- **CI**: Test scripts ready for CI integration (no CI config changes in this change)
