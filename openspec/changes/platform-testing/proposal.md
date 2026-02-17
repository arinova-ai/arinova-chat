## Why

Arinova Chat 目前測試覆蓋率極低（~2.5%）。只有 `packages/shared` 的 Zod schema validation 有測試（106 cases），server 和 web 完全沒有測試。隨著 playground、經濟系統等新功能加入，沒有測試保護等於在裸奔。需要建立完整的測試基礎設施和關鍵路徑測試。

## What Changes

- 建立 **server 端 unit tests** — 覆蓋 API routes、middleware、WebSocket handlers、業務邏輯
- 建立 **server 端 integration tests** — 覆蓋資料庫操作、API 端到端流程
- 建立 **web 端 component tests** — 覆蓋關鍵 React components 和 hooks
- 建立 **web 端 store tests** — 覆蓋 Zustand store 邏輯
- 建立 **E2E tests** — 覆蓋關鍵用戶流程（登入、對話、agent 管理）
- 設定 **coverage reporting** — 追蹤覆蓋率變化
- 補齊 **shared package** 缺少的 tests（manifest validation、marketplace app-platform 相關的 1.3 和 4.3）

## Capabilities

### New Capabilities

- `test-infrastructure`: 測試基礎設施 — Vitest coverage 設定、test utilities（mock factories、test helpers）、CI test pipeline
- `server-tests`: Server 端測試 — API route tests、middleware tests、WebSocket handler tests、業務邏輯 unit tests、database integration tests
- `web-tests`: Web 端測試 — React component tests、Zustand store tests、hook tests、utility function tests
- `e2e-tests`: E2E 測試 — Playwright 設定、關鍵用戶流程測試（auth、chat、agent management）

### Modified Capabilities

_(none)_

## Impact

- **Test infrastructure**: Vitest coverage config、test helpers/factories、Playwright setup
- **Server**: 新增 test files for routes、middleware、ws handlers、utils
- **Web**: 新增 test files for components、stores、hooks、utils
- **CI/CD**: 新增 test pipeline（如果有 CI）
- **Dependencies**: 可能新增 @testing-library/react、Playwright、msw（mock service worker）等 test dependencies
