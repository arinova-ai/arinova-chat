## Context

Arinova Chat MVP 已完成核心功能（auth、1v1 chat、streaming、search），需要在安全性、效能、錯誤處理、UX、基礎設施全面加強。目前架構：Fastify + WebSocket（server）→ Next.js + Zustand（frontend），PostgreSQL + Redis + Drizzle ORM。

## Goals / Non-Goals

**Goals:**
- 修復所有安全漏洞（WS 驗證、上傳安全、速率限制）
- 解決效能瓶頸（N+1 查詢、缺少索引）
- 提升錯誤恢復能力（Error Boundary、WS 重連提示）
- 加入監控基礎設施（Sentry、結構化日誌、深度 health check）
- 完善 UX（loading states、空狀態、搜索分頁）
- 新增功能（typing indicator、reactions、read receipts、system prompt UI、對話匯出）
- 優化 bundle size

**Non-Goals:**
- Phase 2/3 的 Groups、Communities 功能
- 移動端原生 app
- 多語言 i18n
- 主題系統（dark/light toggle）

## Decisions

### 1. WS 驗證：Zod schema at handler entry
- 在 `ws/handler.ts` 的事件分發前用 Zod 驗證整個 payload
- **Why over alternatives**: 比 JSON Schema 更 TypeScript-native，已在 routes 中使用

### 2. 速率限制：Redis INCR + EXPIRE
- 用 Redis `INCR` + `EXPIRE` 做 sliding window rate limiting
- Key pattern: `ws:rate:{userId}:{minuteTimestamp}`
- **Why over alternatives**: 比 token bucket 簡單，比 in-memory 持久

### 3. N+1 修復：Drizzle subquery + leftJoin
- 用 Drizzle 的 `leftJoin` 在單一查詢中取得 conversations + agent + lastMessage
- **Why over alternatives**: 比 raw SQL 更 type-safe，比 DataLoader 更簡單

### 4. Error Boundary：自定義 React component
- 建立 `ErrorBoundary` component 包裹 `ChatLayout`
- fallback 顯示錯誤訊息 + 重試按鈕
- **Why over alternatives**: React 19 原生支援，比 next/error.tsx 更精細

### 5. Sentry 整合：@sentry/nextjs + @sentry/node
- Frontend 用 `@sentry/nextjs`，Server 用 `@sentry/node` Fastify plugin
- DSN 透過環境變數配置
- **Why over alternatives**: 比 Rollbar 生態更好，比自建更省力

### 6. 結構化日誌：Pino（Fastify 內建）
- 利用 Fastify 內建的 Pino logger，加入 request ID 和 JSON format
- **Why over alternatives**: 零額外依賴，Fastify 原生支援

### 7. Message reactions：新 DB table + WS events
- 新增 `message_reactions` table：`(messageId, userId, emoji, createdAt)`
- 透過 WS 事件即時同步 reactions
- **Why over alternatives**: 比 JSON column 更好查詢，比 Redis-only 更持久

### 8. Bundle 優化：dynamic import highlight.js
- 用 `next/dynamic` lazy-load markdown 渲染元件
- **Why over alternatives**: 比換 Prism.js 改動小，利用 Next.js 內建 code splitting

## Risks / Trade-offs

- [Redis rate limiting] Redis 掛了 WS 完全阻斷 → fallback 到 in-memory，記 warning log
- [N+1 JOIN 重寫] 查詢邏輯複雜，可能引入 regression → 現有測試 + 新 integration test 覆蓋
- [Sentry 引入] 增加 bundle size ~30KB → 用 lazy loading + 只在 production 啟用
- [Reactions DB migration] 新 table 需要 migration → Drizzle generate + push
- [多項改動同時進行] 衝突風險高 → 每個 phase 完成後 commit + 測試
