## 1. Test Infrastructure Setup

- [x] 1.1 Install test dependencies: vitest, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, jsdom, @playwright/test, msw in the appropriate packages
- [x] 1.2 Create `apps/server/vitest.config.ts` with node environment and TypeScript path resolution
- [x] 1.3 Create `apps/web/vitest.config.ts` with jsdom environment and React Testing Library setup file
- [x] 1.4 Create `apps/web/src/test-setup.ts` with @testing-library/jest-dom/vitest matchers import
- [x] 1.5 Create `e2e/playwright.config.ts` with base URL, webServer config, and Chromium project
- [x] 1.6 Create `apps/server/src/test-utils/db.ts` with test database connection, truncateAll, and cleanup functions
- [x] 1.7 Create `apps/server/src/test-utils/factories.ts` with createTestUser, createTestAgent, createTestConversation, createTestMessage factory functions
- [x] 1.8 Create `apps/server/src/test-utils/server.ts` with buildTestApp helper that creates a Fastify instance for route testing
- [x] 1.9 Add `test` scripts to root package.json, apps/server/package.json, apps/web/package.json, and `test` task to turbo.json
- [x] 1.10 Add `test:e2e` script to root package.json for Playwright

## 2. Server Unit Tests

- [x] 2.1 Create `apps/server/src/sandbox/executor.test.ts` — safe execution, blocked globals, timeout, console capture, output truncation
- [x] 2.2 Create `apps/server/src/utils/app-scanner.test.ts` — clean code passes, dangerous patterns detected, file scannability
- [x] 2.3 Create `apps/server/src/utils/permission-tier.test.ts` — tier classification, manual review detection
- [x] 2.4 Create `apps/server/src/a2a/client.test.ts` — URL derivation, delta extraction, error handling (mock fetch)
- [x] 2.5 Create `apps/server/src/lib/message-seq.test.ts` — sequence generation (first message, sequential numbering)

## 3. Server Integration Tests

- [x] 3.1 Create `apps/server/src/routes/health.test.ts` — GET /health returns OK
- [x] 3.2 Create `apps/server/src/routes/agents.test.ts` — CRUD, token regeneration, stats, unauthorized access, delete cascade
- [x] 3.3 Create `apps/server/src/routes/conversations.test.ts` — CRUD, search, pin/unpin, mute, mark-read, clear messages
- [x] 3.4 Create `apps/server/src/routes/messages.test.ts` — cursor pagination (before/after/around), search, delete
- [x] 3.5 Create `apps/server/src/routes/groups.test.ts` — create group, add/remove members, duplicate member rejection
- [x] 3.6 Create `apps/server/src/routes/communities.test.ts` — CRUD, membership, roles, channels, ownership transfer
- [x] 3.7 Create `apps/server/src/routes/marketplace.test.ts` — browse, clone, publish/unpublish, categories
- [x] 3.8 Create `apps/server/src/routes/wallet.test.ts` — balance, topup, purchase, insufficient balance, refund
- [x] 3.9 Create `apps/server/src/routes/notifications.test.ts` — get/update preferences, default values
- [x] 3.10 Create `apps/server/src/ws/handler.test.ts` — WS connection, send message, rate limiting, sync
- [x] 3.11 Create `apps/server/src/ws/agent-handler.test.ts` — agent auth, auth timeout, task processing, disconnect cleanup

## 4. Frontend Unit Tests

- [x] 4.1 Create `apps/web/src/store/chat-store.test.ts` — sendMessage optimistic insert, setActiveConversation clears unreads, handleWSEvent (stream_chunk, stream_end), deleteConversation nulls active, toggleTimestamps persists
- [x] 4.2 Create `apps/web/src/lib/api.test.ts` — JSON response, 204 undefined, error throwing, credential inclusion
- [x] 4.3 Create `apps/web/src/lib/config.test.ts` — relative/absolute asset URL handling

## 5. Frontend Component Tests

- [x] 5.1 Create `apps/web/src/app/login/page.test.tsx` — form rendering, error display, register link
- [x] 5.2 Create `apps/web/src/app/register/page.test.tsx` — short password error, successful registration
- [x] 5.3 Create `apps/web/src/components/chat/message-bubble.test.tsx` — user vs agent alignment, streaming cursor, error retry, copy action
- [x] 5.4 Create `apps/web/src/components/chat/chat-input.test.tsx` — Enter send, Shift+Enter newline, disabled state
- [x] 5.5 Create `apps/web/src/components/chat/conversation-item.test.tsx` — click, unread badge, delete confirmation
- [x] 5.6 Create `apps/web/src/components/chat/markdown-content.test.tsx` — markdown rendering, XSS sanitization
- [x] 5.7 Create `apps/web/src/components/chat/connection-banner.test.tsx` — hidden when connected, shows disconnected state

## 6. E2E Tests (Playwright)

- [x] 6.1 Create `e2e/helpers/auth.ts` with registerUser, loginUser, logoutUser helper functions
- [x] 6.2 Create `e2e/tests/auth.spec.ts` — register, login, logout, auth guard redirect
- [x] 6.3 Create `e2e/tests/chat.spec.ts` — create bot, send message, conversation in sidebar
- [x] 6.4 Create `e2e/tests/conversation-management.spec.ts` — rename, pin, delete conversation
- [x] 6.5 Create `e2e/tests/bot-management.spec.ts` — edit bot, delete bot
- [x] 6.6 Create `e2e/tests/settings.spec.ts` — update name, password validation
- [x] 6.7 Create `e2e/tests/responsive.spec.ts` — mobile sidebar/chat toggle, desktop side-by-side

## 7. Verification

- [x] 7.1 Run all server unit tests and verify they pass
- [x] 7.2 Run all server integration tests and verify they pass
- [x] 7.3 Run all frontend unit and component tests and verify they pass
- [x] 7.4 Run Playwright E2E tests and verify they pass
- [x] 7.5 Run full test suite from root (`pnpm test`) and verify clean output
