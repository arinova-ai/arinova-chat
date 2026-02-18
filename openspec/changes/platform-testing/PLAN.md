# Platform Testing — Implementation Plan

## Overview
全部 57 個 task 分 5 個 Phase 推進。先搞 infrastructure，再由內而外：shared → server unit → server API → web → E2E。

---

## Phase 1: Test Infrastructure (Section 1)

### 1.1 Vitest coverage 配置
- 在 root `vitest.workspace.ts` 或各 package 的 `vitest.config.ts` 加入 Istanbul coverage provider
- 安裝 `@vitest/coverage-istanbul`
- 設定 coverage thresholds (建議先不卡門檻，先跑起來)

### 1.2 Root `test:coverage` script
- 在 root `package.json` 加 `"test:coverage": "turbo test -- --coverage"`

### 1.3-1.6 Test utilities (Mock factories)
- 建立 `apps/server/src/test/factories.ts`：
  - `createMockUser()` — 產生 fake user (id, email, name)
  - `createMockAgent()` — 產生 fake agent (id, ownerId, name, secretToken, etc.)
  - `createMockConversation()` — 產生 fake conversation (id, userId, agentId, type)
  - `createAuthContext()` — mock requireAuth，注入 fake user 到 request

### 1.7 Test database setup
- 建立 `apps/server/src/test/setup-db.ts`
  - 用 `DATABASE_URL` 指向 test db (`arinova_test`)
  - globalSetup: run migrations, afterEach: truncate tables
  - export `testDb` instance

### 1.8 Docker Compose test profile
- 在 `docker-compose.yml` 加 test profile，或建 `docker-compose.test.yml`
- 新增 `arinova_test` database

---

## Phase 2: Shared Package + Server Unit Tests (Section 2, 9)

### Section 2 — Shared Package Missing Tests
**2.1** `packages/shared/src/schemas/index.test.ts` 擴充：
- appManifestSchema 完整驗證 (valid manifest, missing fields, invalid enums, static vs dynamic mode, refine rules)
- WebSocket event schemas (wsClientEventSchema, agentWSClientEventSchema)
- Playground schemas (playgroundDefinitionSchema)
- Push notification schemas

**2.2** Scanner tests (已有，擴充邊界案例)

### Section 9 — Server Utility Tests
**9.1** `apps/server/src/utils/pairing-code.test.ts`
- Token 格式 (ari_ prefix, 52 chars, hex suffix)
- 唯一性 (多次呼叫不重複)

**9.2** `apps/server/src/utils/app-scanner.test.ts` — 已有，檢查是否需要補充

**9.3** `apps/server/src/utils/permission-tier.test.ts`
- 空陣列 → tier 0
- [storage] → tier 1, [audio] → tier 1
- [network] → tier 2
- [storage, network] → tier 2 (最高優先)
- requiresManualReview(0) → false, (1) → false, (2) → true

**9.4** `apps/server/src/utils/agent-app-bridge.test.ts`
- actionsToToolDefinitions — 各 controlMode 下的 filter
- validateAction — 合法/非法 action
- AppSession class — state machine transitions, event history limit
- getStateForRole — role isolation
- buildAgentContext — context 格式

---

## Phase 3: Server API Integration Tests (Section 3-8)

**策略：** 用 test database + Fastify inject (不起真實 HTTP server)。Mock auth middleware 注入 fake user。

### Section 3 — Auth & Middleware Tests
- `apps/server/src/middleware/auth.test.ts`
- 測 requireAuth: 有 session → pass, 無 session → 401, invalid → 401
- 測 rate limiting (if applicable at middleware level)

### Section 4 — Agent API Tests
- `apps/server/src/routes/agents.test.ts`
- CRUD: create (valid/invalid), list (own only), get (exists/not found/not owner), update, delete
- Pairing endpoint

### Section 5 — Conversation API Tests
- `apps/server/src/routes/conversations.test.ts`
- Create direct conversation, list (own only), get, update (rename/pin), delete, clear messages

### Section 6 — Group Conversation Tests
- `apps/server/src/routes/groups.test.ts`
- Create group, list, member management

### Section 7 — Message API Tests
- `apps/server/src/routes/messages.test.ts`
- Search, pagination (before/after/around cursors)

### Section 8 — WebSocket Tests
- `apps/server/src/ws/handler.test.ts`
- User WS: auth connect, reject no auth, send_message, cancel_stream, ping/pong
- Agent WS: agent_auth, chunk/complete events, disconnect cleanup

---

## Phase 4: Web Frontend Tests (Section 10-13)

### Section 10 — Store Tests
- `apps/web/src/store/chat-store.test.ts`
- Conversation/message CRUD, active conversation, search, agent health, unread counts

### Section 11 — Component Tests
**11.1-11.2** 安裝 + 配置：
- 安裝 `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
- 更新 `vitest.config.ts`: environment 改 `jsdom` for component tests

**11.3-11.7** Component tests：
- MessageBubble: markdown, code highlight, copy/delete/retry
- Sidebar: conversation list, search, active state
- ChatArea: conditional rendering
- NewChatDialog: agent selection
- CreateBotDialog: form validation

### Section 12 — Auth Page Tests
- Login: form render, validation, submission, OAuth
- Register: form render, password validation, submission

### Section 13 — Utility & Hook Tests
- API client: request format, error handling, toast
- WebSocket manager: connect/disconnect, event handling, reconnect
- useAutoScroll hook

---

## Phase 5: E2E Tests (Section 14-17)

### Section 14 — E2E Setup
- 安裝 Playwright
- 配置 for local dev environment
- 建 helpers: login, seed data

### Section 15 — Auth Flow E2E
- 註冊 → 導向 chat
- 登入 → 導向 chat
- 登出 → 導向 login

### Section 16 — Chat Flow E2E
- 新建對話
- 發送訊息 → 收到回覆
- 切換對話

### Section 17 — Agent Management E2E
- 建立 bot
- 刪除 bot

---

## Execution Order

| Phase | Sections | Estimated Tasks | 備註 |
|-------|----------|-----------------|------|
| 1 | 1 | 8 | 基礎建設，必須先做 |
| 2 | 2, 9 | 8 | 純 unit test，不需 DB |
| 3 | 3-8 | 19 | 需要 test DB，Fastify inject |
| 4 | 10-13 | 15 | 需要 jsdom + testing-library |
| 5 | 14-17 | 7 | 需要 Playwright + 運行中的 server |

**總計: 57 tasks**

## 技術決策
- **Test runner:** Vitest (已安裝)
- **Coverage:** Istanbul provider
- **Server integration:** Fastify `app.inject()` (不需起 HTTP server)
- **Auth mocking:** Mock Better Auth `auth.api.getSession` 或直接 mock `requireAuth`
- **DB:** 真實 PostgreSQL test database (確保 schema 正確性)
- **Frontend components:** @testing-library/react + jsdom
- **E2E:** Playwright
- **Mock strategy:** `vi.mock()` for external deps (web-push, fetch, WebSocket)
