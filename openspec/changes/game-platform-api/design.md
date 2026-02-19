## Context

Arinova Chat 目前的 Playground 系統是全包式架構：平台定義遊戲 schema、跑 runtime engine、處理 phase transition 和 action processing。這導致每個遊戲的 edge case 都是平台的責任，且 AI agent 智力差異讓複雜規則的遊戲無法正常運作。

現在要轉型為開放平台：Arinova 只提供玩家池（Human + AI Agent）、身份認證、Agent 代打 API、經濟系統。遊戲邏輯完全由外部開發者負責，遊戲以外部網站形式存在，透過 Arinova API 整合。

現有相關基礎設施：
- Developer Console 前端頁面（已有基本框架）
- 經濟系統（coins、交易、餘額，`playground-economy.ts`）
- Agent WS 連線（`agent-handler.ts` — agent 已經能透過 WS 接收任務並回應）
- Better Auth（用戶認證系統）

## Goals / Non-Goals

**Goals:**
- 外部遊戲可以透過 OAuth 取得 Arinova 用戶身份
- 外部遊戲可以呼叫用戶的 AI Agent（REST + SSE streaming）
- 外部遊戲可以透過 API 收費、發獎
- 開發者可以在 Developer Console 提交、管理遊戲
- 用戶可以在 App 目錄瀏覽、搜尋遊戲並跳轉遊玩
- 提供 `@arinova/game-sdk` JS library 給開發者

**Non-Goals:**
- 不做 iframe 嵌入（直接跳轉到外部遊戲）
- 不做遊戲內部邏輯（規則、state machine、phase transition）
- 不做配對/房間管理（遊戲開發者自己處理）
- 不做遊戲 UI rendering
- 不做遊戲審核系統（Phase 1 先手動審核）

## Decisions

### Decision 1: OAuth 2.0 Authorization Code Flow
外部遊戲透過標準 OAuth 2.0 Authorization Code Flow 取得用戶身份。

**選擇理由：** 業界標準，開發者熟悉，Better Auth 已支援 OAuth provider 功能。

**替代方案：**
- API Key + redirect token → 非標準，開發者學習成本高
- JWT bearer token 直接發給遊戲 → 安全性差（token 暴露在 URL）

**Flow：**
```
遊戲 redirect → /oauth/authorize?client_id=...&redirect_uri=...
用戶授權 → redirect back → ?code=...
遊戲 server → POST /oauth/token → { access_token, user }
```

### Decision 2: Agent Proxy 走 REST + SSE（Server-to-Server）
外部遊戲的 server 用 access_token 呼叫 Arinova Agent API。Arinova 內部透過已有的 agent WS 連線轉發。

**選擇理由：**
- REST 簡單，適合非串流場景
- SSE 適合串流，且是標準 HTTP，不需要遊戲 server 維護 WS 連線
- 複用現有的 `sendTaskToAgent()` 機制

**替代方案：**
- 讓遊戲直接 WS 連到 agent → 安全性問題，agent 連線歸用戶管不歸遊戲管
- WebSocket proxy → 遊戲 server 要額外維護 WS，太重

**API：**
```
POST /api/v1/agent/chat          → { response }     // 完整回應
POST /api/v1/agent/chat/stream   → SSE chunks       // 串流回應
```

### Decision 3: Economy API 走 Server-to-Server + 簽名驗證
經濟操作（扣幣、發獎）只允許遊戲 server 呼叫，需帶 app_secret 簽名，防止前端偽造。

**選擇理由：** 金錢操作必須 server-to-server，不能暴露在客戶端。

**API：**
```
POST /api/v1/economy/charge   → 向玩家收費
POST /api/v1/economy/award    → 發獎給玩家
GET  /api/v1/economy/balance  → 查詢玩家餘額
```

### Decision 4: App 目錄取代 Playground 列表
`playgrounds` table 改為 `apps` table，前端 `/playground` 路由改為 `/apps`（或保留 `/playground` 但內容改為 App 目錄）。

**選擇理由：** 語義更清楚，不再是「playground」而是「app/game」。

### Decision 5: `@arinova/game-sdk` 為純前端 JS Library
SDK 封裝 OAuth redirect flow + 後端 API 的型別定義。不包含 server-side 邏輯（server-side 直接 call REST API）。

**選擇理由：** 降低 SDK 複雜度，server-side 用標準 HTTP 即可。

## Risks / Trade-offs

- **[風險] Agent 不在線** → 遊戲呼叫 Agent API 時 agent 可能斷線。Mitigation: API 回傳明確的 `agent_offline` 錯誤，遊戲自行處理（顯示提示或用 fallback）。
- **[風險] 濫用 Agent API** → 惡意遊戲大量呼叫。Mitigation: per-app rate limit + 用量追蹤 + 超額收費。
- **[風險] 經濟系統安全] → 偽造交易。Mitigation: 所有經濟操作需 app_secret 簽名，server-to-server only。
- **[取捨] 不做 iframe 嵌入** → 用戶體驗較碎片化（離開 Arinova 去玩遊戲）。但簡化架構，Phase 2 可以考慮加回。
- **[取捨] 不做自動審核** → Phase 1 手動審核，可能成為瓶頸。Phase 2 可加自動化。

## Open Questions

- Playground 路由要改名為 `/apps` 還是保留 `/playground`？
- OAuth scope 要細分到什麼程度？（`profile`、`agents`、`economy`？）
- Agent API 的 rate limit 要設多少？per-app per-user per-minute？
- 開發者分潤比例？70/30 還是其他？
