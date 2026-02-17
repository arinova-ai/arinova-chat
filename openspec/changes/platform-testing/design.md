## Context

Arinova Chat 是一個 monorepo（apps/server + apps/web + packages/shared），已有 Vitest 4 設定但幾乎沒有測試。測試基礎設施（vitest configs、turbo test script）已存在，需要補內容。

現有測試：
- `packages/shared/src/schemas/index.test.ts` — 106 cases，覆蓋 Zod schemas
- `apps/server/vitest.config.ts` — 空殼，無 test files
- `apps/web/vitest.config.ts` — 空殼，無 test files

## Goals / Non-Goals

**Goals:**
- 建立 test utilities 和 mock factories，降低寫測試的門檻
- 覆蓋 server 端所有 API routes 的 happy path + error cases
- 覆蓋 server 端 WebSocket handlers（user + agent）
- 覆蓋 web 端關鍵 components 和 stores
- 建立 E2E tests 覆蓋核心用戶流程
- 設定 coverage reporting，追蹤覆蓋率
- 補齊 marketplace-app-platform change 遺留的 2 個 test tasks（1.3、4.3）

**Non-Goals:**
- 100% coverage（目標是關鍵路徑覆蓋，不追求數字）
- Visual regression testing（不做截圖比對）
- Performance/load testing（Phase 2）
- Mobile-specific testing

## Decisions

### 1. Test framework：繼續使用 Vitest

**Decision**: 不換框架，繼續用 Vitest 4 + Turbo orchestration。

**Rationale**: 已經設定好了，生態系成熟，跟 TypeScript 和 monorepo 整合良好。

### 2. Server API tests：使用 Fastify inject

**Decision**: 用 Fastify 的 `app.inject()` 做 API route testing，不需要啟動真正的 HTTP server。

**Alternatives considered**:
- Supertest：需要啟動 server，比較慢
- Direct function calls：跳過 middleware，不夠完整

**Rationale**: `inject()` 模擬完整的 HTTP request lifecycle（包括 middleware），但不需要 port binding，速度快且可靠。

### 3. Database tests：使用 test database

**Decision**: Integration tests 使用獨立的 test database（`arinova_test`），每個 test suite 前清空/重建 schema。

**Rationale**: In-memory mock 無法真正測試 Drizzle ORM 查詢邏輯。用真實 PostgreSQL 但獨立 database 確保不影響開發環境。

### 4. Web component tests：Vitest + Testing Library

**Decision**: 使用 `@testing-library/react` + `jsdom` 環境做 component tests。

**Rationale**: Testing Library 鼓勵測試用戶行為而非實作細節，是 React 社群標準。

### 5. E2E：Playwright

**Decision**: 使用 Playwright 做 E2E tests，覆蓋 auth flow、chat、agent management。

**Rationale**: Playwright 是目前最穩定的 E2E 框架，支援 multiple browsers，API 直覺。

### 6. Mock strategy：MSW for API mocking in web tests

**Decision**: Web component tests 用 MSW（Mock Service Worker）攔截 API requests。

**Rationale**: MSW 在 network layer 攔截，不需要修改 production code，mock 更接近真實。

## Risks / Trade-offs

- **[Test database setup complexity]** → Mitigation: 提供 Docker Compose test profile + setup script
- **[Tests 太慢影響 DX]** → Mitigation: Unit tests 和 integration tests 分開跑，unit tests 保持 < 30s
- **[E2E flaky tests]** → Mitigation: 只測核心流程，使用 Playwright 的 auto-waiting，避免 hardcoded delays
