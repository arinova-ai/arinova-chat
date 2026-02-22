## Why

Arinova Chat MVP 功能已完成，但在安全性、效能、錯誤處理、UX、基礎設施等方面需要全面加強，才能達到 production-ready 的品質。目前存在 WebSocket 缺少輸入驗證、N+1 查詢、缺少 Error Boundary 等關鍵問題。

## What Changes

### Phase 1: 安全 + 效能 + 錯誤處理
- WebSocket 訊息 payload schema 驗證
- WS 速率限制改用 Redis 持久化
- 檔案上傳 magic number 驗證
- 資料庫索引（messages.conversationId, conversations.userId, messages.seq 等）
- 修復 `loadConversations()` N+1 查詢（改用 JOIN）
- React Error Boundary 包裹 chat UI
- WS 連線錯誤提示用戶
- 表單驗證錯誤顯示

### Phase 2: 基礎設施 + Agent 狀態
- Health check 深度檢查（DB、Redis 連線狀態）
- 錯誤追蹤整合（Sentry）
- 結構化日誌 + request correlation ID
- Agent online/offline 狀態 badge 顯示
- 操作 loading states（建立/刪除對話等）

### Phase 3: UX 打磨 + 程式碼品質
- 統一 API 錯誤回應格式
- Redis 查詢批量化（mget）
- 搜索結果分頁
- 新用戶空狀態引導
- 表單 type safety（Zod schema）
- 伺服器端訊息內容 sanitization

### Phase 4: 功能增強
- Agent 系統提示編輯 UI
- 打字指示器（typing indicator）
- 已讀回執（read receipts）
- 訊息反應/emoji
- Bundle 優化（highlight.js 替換）
- 對話匯出功能

## Capabilities

### New Capabilities
- `ws-validation`: WebSocket 訊息驗證與 Redis 速率限制
- `upload-security`: 檔案上傳安全加強（magic number 驗證）
- `db-performance`: 資料庫索引與 N+1 查詢修復
- `error-resilience`: Error Boundary、WS 錯誤提示、表單驗證回饋
- `health-monitoring`: 深度 health check、Sentry、結構化日誌
- `agent-status-ui`: Agent 線上狀態顯示
- `api-consistency`: 統一 API 錯誤格式、Redis 批量查詢
- `ux-polish`: 空狀態引導、loading states、搜索分頁
- `typing-indicator`: 打字指示器
- `read-receipts`: 已讀回執
- `message-reactions`: 訊息反應/emoji
- `system-prompt-ui`: Agent 系統提示編輯介面
- `conversation-export`: 對話匯出功能
- `bundle-optimization`: 前端 bundle 優化

### Modified Capabilities

## Impact

- **Server**: 路由驗證、WS handler、DB schema migration、health check、日誌系統
- **Frontend**: Error Boundary、store 錯誤處理、新 UI 元件（agent badge、typing indicator、reactions）
- **Database**: 新索引、conversations 查詢重寫
- **Dependencies**: 新增 Sentry SDK、file-type 套件；可能替換 highlight.js
- **Infrastructure**: Redis 用於 WS 速率限制；Sentry 整合
