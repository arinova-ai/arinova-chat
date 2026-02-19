## Why

現有的 Playground 系統由 Arinova 全包遊戲邏輯（定義 schema、runtime engine、phase transition、action processing），導致每個遊戲的 edge case 都是平台的責任，AI agent 智力差異讓規則型遊戲無法正常運作，且不 scale。改為開放平台模式：Arinova 只提供玩家（Human + AI Agent）、身份認證、Agent 代打 API、經濟系統，遊戲邏輯完全由外部開發者負責。參考 Roblox / Telegram Mini Apps 模式，讓開發者創造內容、平台提供流量和基礎設施。

## What Changes

- **BREAKING** 移除現有 Playground runtime engine（`playground-runtime.ts`、`playground-agent.ts`、`playground-creation-spec.ts`、`playground-templates.ts`、前端遊戲 UI components）
- 將 `playgrounds` 概念替換為 **Apps**（外部遊戲/應用）目錄
- 新增 **Auth API**：OAuth 2.0「Login with Arinova」，外部遊戲用來取得用戶身份
- 新增 **Agent API**：外部遊戲透過 REST / SSE 呼叫用戶的 AI Agent，取得回應（支援 streaming）
- 新增 **Economy API**：外部遊戲透過 API 收費、發獎、查餘額
- 新增 **App 上架流程**：開發者在 Developer Console 提交遊戲（URL、icon、描述）→ 審核 → 上架
- 新增 **Game SDK**（JS library）：封裝 Auth/Agent/Economy API，方便外部開發者整合

## Capabilities

### New Capabilities

- `app-directory`: 遊戲/應用目錄 — 取代現有 playgrounds 表，用戶瀏覽、搜尋、發現外部遊戲
- `app-oauth`: OAuth 2.0 認證 — Login with Arinova，外部遊戲取得用戶身份和授權
- `agent-proxy-api`: Agent 代打 API — 外部遊戲發 prompt 給用戶的 AI Agent，支援 REST 完整回應和 SSE streaming
- `economy-api`: 經濟系統 API — 外部遊戲收費（扣幣）、發獎、查餘額、交易紀錄，平台抽成
- `game-sdk`: 前端 JS SDK — 封裝所有 API 為簡單的 JS library，開發者 `npm install @arinova/game-sdk`
- `app-submission`: App 上架流程 — 開發者提交遊戲、審核狀態、上架/下架管理

### Modified Capabilities

- `playground-economy`: 經濟系統需要從 playground-only 擴展為通用 App 經濟，支援外部 API 呼叫

## Impact

- **Database**: `playgrounds` → `apps` table 重構；新增 `app_oauth_clients`、`agent_api_calls`（用量追蹤）；保留經濟相關 tables
- **Backend**: 移除 `playground-runtime.ts`、`playground-agent.ts`、`playground-handler.ts`、`playground-creation-spec.ts`、`playground-templates.ts`；新增 OAuth routes、Agent proxy routes、Economy API routes
- **Frontend**: 移除 playground 遊戲 UI components（`ActiveSession`、`WaitingRoom`、`GameResult`、`CreatePlaygroundDialog` 等）；Playground 列表頁改為 App 目錄頁；保留 Developer Console 並擴展 App 管理功能
- **New package**: `@arinova/game-sdk` — 外部開發者用的 JS SDK
- **Shared types**: 新增 App、OAuthClient、AgentProxyRequest/Response 型別
