## Context

Arinova Chat is a Turborepo monorepo with a Fastify backend (`apps/server`) and Next.js 15 frontend (`apps/web`). The project has zero automated tests. The server has 17 route files, 2 WebSocket handlers, and an A2A SSE client. The frontend has a Zustand store, WebSocket manager, 17+ chat components, and 3 page routes. The project uses PostgreSQL (Drizzle ORM) and Redis.

## Goals / Non-Goals

**Goals:**
- Establish test infrastructure that works with the existing monorepo setup
- Achieve meaningful coverage of all API routes, WebSocket protocols, and UI flows
- Tests must be fast enough to run during development (< 60s for unit tests)
- E2E tests must cover all critical user journeys
- Test setup must be reproducible (test DB, mocks)

**Non-Goals:**
- 100% line coverage — focus on behavior coverage of critical paths
- Load/performance testing
- Visual regression testing (screenshot comparison)
- CI pipeline configuration (scripts will be CI-ready but no CI config changes)

## Decisions

### Decision 1: Vitest over Jest
**Choice**: Vitest for both server and frontend unit/integration tests.
**Rationale**: Native ESM support (the project uses `"type": "module"` everywhere), fast HMR-based watch mode, built-in TypeScript support without `ts-jest`, compatible with the existing Vite/Next.js toolchain. Jest requires additional ESM configuration that is fragile.

### Decision 2: Playwright over Puppeteer for E2E
**Choice**: Playwright for all end-to-end tests.
**Rationale**: Better cross-browser support, built-in auto-waiting, better test isolation with browser contexts, first-class TypeScript support, and a superior test runner with parallel execution. Puppeteer is lower-level and requires more boilerplate for test scenarios.

### Decision 3: Test database strategy
**Choice**: Use the same Docker PostgreSQL instance (port 5458) but a separate `arinova_test` database. Each test file gets a clean state via transaction rollback or truncation.
**Rationale**: Avoids needing a separate Docker setup. Transaction rollback is fastest for isolation. The existing `docker-compose.yml` already runs PostgreSQL.

### Decision 4: API mocking strategy for frontend
**Choice**: Use `msw` (Mock Service Worker) for frontend API mocking in component tests. Use direct fetch mocking in Zustand store tests.
**Rationale**: MSW intercepts at the network level, giving realistic API simulation without coupling tests to implementation. For store tests, direct mocking is simpler since we're testing state transitions.

### Decision 5: WebSocket testing approach
**Choice**: For server WS tests, use the `ws` library to create real WebSocket clients connecting to a test server instance. For frontend WS tests, mock the WebSocketManager class.
**Rationale**: Server-side WS logic is complex (auth, streaming, queuing) and benefits from integration-level testing with real connections. Frontend WS logic is simpler (send/receive events) and can be effectively tested with mocks.

### Decision 6: E2E test isolation
**Choice**: Each E2E test suite seeds its own user/agent data via API calls in `beforeAll`, and cleans up in `afterAll`. Tests use unique email addresses to avoid conflicts.
**Rationale**: Database seeding via API ensures tests exercise real code paths. Unique emails prevent parallel test interference.

### Decision 7: Test file organization
**Choice**: Co-locate test files next to source files using `*.test.ts` / `*.test.tsx` naming. E2E tests live in a dedicated `e2e/` directory at the project root.
**Rationale**: Co-location makes it easy to find tests for a given module. E2E tests are separate because they span both apps.

## Risks / Trade-offs

- **[Test DB pollution]** → Mitigation: Each test file truncates relevant tables in `beforeEach`. Integration tests use a shared `setupTestDB` utility.
- **[E2E flakiness from streaming]** → Mitigation: Use Playwright's `waitForSelector` and `waitForFunction` with generous timeouts for streaming-related assertions. Add retry configuration.
- **[WS tests timing sensitivity]** → Mitigation: Use event-driven assertions (wait for specific messages) rather than timeouts.
- **[Test maintenance burden]** → Mitigation: Create shared mock factories and test utilities to reduce boilerplate. Focus on behavior tests, not implementation details.
- **[Dev server dependency for E2E]** → Mitigation: Playwright `webServer` config auto-starts both server and web on test ports.
