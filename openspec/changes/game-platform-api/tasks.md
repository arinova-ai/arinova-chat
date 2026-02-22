## 1. Cleanup — 移除舊 Playground Engine

- [x] 1.1 移除 `apps/server/src/lib/playground-runtime.ts`、`playground-agent.ts`、`playground-creation-spec.ts`、`playground-templates.ts`
- [x] 1.2 移除 `apps/server/src/ws/playground-handler.ts` 和相關 WS route 註冊
- [x] 1.3 移除前端遊戲 UI：`ActiveSession`、`WaitingRoom`、`GameResult`、`CreatePlaygroundDialog`、`AgentSelectDialog`（playground 用）
- [x] 1.4 移除前端 `playground-ws.ts` WebSocket client
- [x] 1.5 清理 shared types/schemas 中 playground runtime 相關型別（保留基礎 category 等可復用的）

## 2. Database — Apps Table

- [x] 2.1 建立 `apps` table（id, developerId, name, description, category, iconUrl, externalUrl, status, createdAt, updatedAt）
- [x] 2.2 建立 `app_oauth_clients` table（id, appId, clientId, clientSecret, redirectUris, createdAt）
- [x] 2.3 建立 `agent_api_calls` table（id, appId, userId, agentId, tokenCount, createdAt）用於用量追蹤
- [x] 2.4 Migrate：保留經濟系統相關 tables（coin_balances, transactions），舊 playground sessions/participants/messages 可標記 deprecated

## 3. OAuth 2.0 — Login with Arinova

- [x] 3.1 實作 `GET /oauth/authorize` — 授權頁面（顯示 app 名稱、requested scopes、authorize/deny 按鈕）
- [x] 3.2 實作 `POST /oauth/token` — Authorization Code → Access Token exchange
- [x] 3.3 實作 token 驗證 middleware（`requireAppAuth`），驗證 `Authorization: Bearer` header
- [x] 3.4 實作 `GET /api/v1/user/profile` — 回傳已授權用戶的基本資料
- [x] 3.5 實作 `GET /api/v1/user/agents` — 回傳已授權用戶的 agent 列表（需 `agents` scope）

## 4. Agent Proxy API

- [x] 4.1 實作 `POST /api/v1/agent/chat` — 同步模式：轉發 prompt 到 agent WS，等待完整回應
- [x] 4.2 實作 `POST /api/v1/agent/chat/stream` — SSE 串流模式：轉發 prompt，逐 chunk 回傳 SSE events
- [x] 4.3 加入 rate limiting（per-app per-user，可配置）
- [x] 4.4 加入用量記錄到 `agent_api_calls` table

## 5. Economy API

- [x] 5.1 實作 `POST /api/v1/economy/charge` — 向玩家收幣（需 app_secret 簽名驗證）
- [x] 5.2 實作 `POST /api/v1/economy/award` — 發獎給玩家（含平台抽成）
- [x] 5.3 實作 `GET /api/v1/economy/balance` — 查詢玩家餘額
- [x] 5.4 實作 app_secret 簽名驗證 middleware

## 6. App Submission — Developer Console

- [x] 6.1 後端：App CRUD routes（create, read, update, delete）
- [x] 6.2 後端：App publish/unpublish routes
- [x] 6.3 後端：OAuth client 自動生成（建立 app 時）+ secret 重新生成
- [x] 6.4 前端：Developer Console — App 管理頁面（建立、編輯、刪除、查看 credentials）
- [x] 6.5 前端：Developer Console — App usage dashboard（API calls、users、transactions 統計）

## 7. App Directory — 前端

- [x] 7.1 App 目錄列表頁（取代舊 playground list）— 卡片式展示、分類篩選、搜尋
- [x] 7.2 App 詳情頁 — 描述、截圖、Play 按鈕（跳轉外部 URL）
- [x] 7.3 更新 sidebar navigation — Playground 入口改為 Apps

## 8. Game SDK — @arinova/game-sdk

- [x] 8.1 建立 `packages/game-sdk` package（TypeScript、ESM）
- [x] 8.2 實作 `Arinova.init()` 和 `Arinova.login()` OAuth helper
- [x] 8.3 實作 `Arinova.agent.chat()` 和 `Arinova.agent.chatStream()` helpers
- [x] 8.4 匯出所有 API request/response TypeScript 型別
- [x] 8.5 撰寫 README 和基本使用範例
