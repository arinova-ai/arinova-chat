## Context

Arinova Chat 是一個人與 AI agent 的即時通訊平台，目前支持一對一對話和群組對話。Playground 是一個全新的頂層功能，讓 AI agents 創造互動空間，多個用戶可以各帶自己的 agent 加入。

現有基礎：
- WebSocket 即時通訊（user ↔ server、agent ↔ server）
- Agent 管理（CRUD、health check、A2A endpoint）
- Group conversations（多 agent 在同一對話）
- PostgreSQL + Drizzle ORM、Redis caching

Playground 與現有的 conversations 和 marketplace apps **完全獨立**，不共用表或路由。

## Goals / Non-Goals

**Goals:**
- 讓 AI agent 能根據用戶描述，結構化地創建持久的互動空間
- 支持多用戶各帶自己的 agent 同時參與一個 playground
- 即時狀態同步 — 所有參與者看到一致的 playground 狀態
- 角色系統 — playground 可以定義不同角色（如狼人殺的村民/狼人），每個角色有不同的可見資訊
- 回合制支持 — playground 可以定義回合、階段、計時等遊戲機制
- 內建「狼人殺」作為第一個示範 playground

**Non-Goals:**
- 即時圖形渲染 / Canvas / WebGL（Phase 1 是文字 + 結構化 UI）
- 與 marketplace apps 整合（完全獨立功能）
- 真實金錢提現（Play Coins 和 Arinova Coins 都是平台內虛擬貨幣，不可提現）
- AI agent 自主創建 playground（Phase 1 必須由用戶發起，agent 協助生成）
- 手機 native playground 體驗（先 web responsive）

## Decisions

### 1. Playground 定義格式：結構化 JSON Schema

**Decision**: Playground 使用 JSON 定義（`PlaygroundDefinition`），包含 metadata、rules、roles、phases、actions 等。Agent 根據用戶描述生成這個 JSON。

**Alternatives considered**:
- 純 Markdown / 自然語言規則：靈活但無法程式化執行、無法驗證
- Code-based（JS/TS sandbox）：太複雜，安全風險高，門檻高

**Rationale**: JSON Schema 讓 agent 可以結構化生成、平台可以驗證和執行、前端可以渲染 UI。提供足夠的表達力同時保持安全。

### 2. 狀態管理：Server-authoritative + WebSocket broadcast

**Decision**: Playground 狀態由 server 管理（single source of truth），所有 action 經 server 驗證後更新狀態，再 broadcast 給所有參與者。

**Alternatives considered**:
- Client-side state + conflict resolution：延遲低但一致性差，容易作弊
- CRDT-based：太複雜，回合制遊戲不需要

**Rationale**: 回合制 playground 對延遲不敏感，server-authoritative 保證一致性和公平性。用 Redis pub/sub 做跨 instance broadcast。

### 3. Playground WebSocket：獨立 namespace `/ws/playground`

**Decision**: 新增 `/ws/playground` WebSocket endpoint，與現有的 `/ws`（user chat）和 `/ws/agent`（agent chat）分開。

**Alternatives considered**:
- 複用 `/ws` 加 event type 區分：簡單但會讓現有 chat WebSocket 邏輯變複雜
- HTTP polling：延遲太高，不適合即時互動

**Rationale**: 獨立 namespace 讓 playground 的連線管理、認證、rate limiting 可以獨立設定，不影響 chat 功能。

### 4. 角色系統：Per-role state visibility

**Decision**: 每個 playground 角色（role）定義自己的 `visibleState` 和 `availableActions`。Server 在 broadcast 時根據參與者的角色過濾狀態。

**Rationale**: 狼人殺等遊戲需要資訊不對稱 — 狼人知道誰是同伴，村民不知道。Platform-level isolation 比 app-level filtering 更安全。

### 5. Agent 創建流程：Conversation-driven + validation

**Decision**: 用戶在 playground 創建頁面描述需求 → 系統 agent 生成 `PlaygroundDefinition` JSON → 平台驗證 schema → 儲存。用戶可以預覽和微調。

**Alternatives considered**:
- 表單 UI 手動填寫：門檻高，不符合「AI agent 創建」的核心理念
- 完全自動不預覽：用戶無法控制結果

**Rationale**: Conversation-driven 讓創建過程自然直覺，validation 確保結果合法，預覽讓用戶有最終控制權。

### 7. 雙軌經濟系統：Play Coins + Arinova Coins

**Decision**: 採用雙軌制 — 免費場使用 Play Coins（系統每日發放），付費場使用 Arinova Coins（用戶儲值）。Playground 創建者在定義中自訂經濟規則。

**Alternatives considered**:
- 只用 Arinova Coins：門檻太高，新用戶沒有動力嘗試
- 只用免費代幣：缺乏刺激感和真實賭注
- 固定統一規則：不同遊戲類型需要不同經濟模式

**Rationale**: 雙軌制讓免費場降低門檻吸引用戶，付費場提供真實刺激。創建者自定義經濟規則最靈活 — 狼人殺可以用入場費制，撲克可以用回合下注制。

### 8. 經濟規則由 Playground 創建者定義

**Decision**: PlaygroundDefinition 新增 `economy` 欄位，創建者定義貨幣類型（play/arinova/free）、入場費、獎池分配、下注規則等。平台負責驗證和結算。

**Alternatives considered**:
- 平台統一定義幾種模式讓創建者選：簡單但不夠靈活
- 完全自由 scripting：太複雜，安全風險高

**Rationale**: 結構化的 economy schema 讓 agent 可以生成、平台可以驗證執行，同時給創建者足夠的自由度。平台抽成比例可統一管理。

### 9. 示範 playground：狼人殺

**Decision**: 內建狼人殺作為預設 playground template，展示角色分配、資訊隔離、回合制（白天討論→投票→夜晚行動）、勝負判定。

**Rationale**: 狼人殺規則廣為人知，天然展示多用戶多角色互動、資訊不對稱、回合機制，是最佳示範題材。

## Risks / Trade-offs

- **[Agent 生成品質不穩定]** → Mitigation: 提供嚴格的 JSON Schema 和詳細的創建規範文件，引導 agent 生成結構正確的定義。提供 built-in templates 作為 fallback。
- **[多人即時同步延遲]** → Mitigation: Redis pub/sub + WebSocket。回合制天然容忍較高延遲。
- **[Playground 規則表達力不足]** → Mitigation: Phase 1 先支持回合制 + 基本條件判斷。複雜邏輯留給 Phase 2（可能引入 scripting）。
- **[濫用/不當內容]** → Mitigation: Playground 定義經過 schema validation，可加 content moderation。公開 playground 需要基本審核。
- **[狀態膨脹]** → Mitigation: 限制 playground state 大小（maxStateSize），限制參與者人數上限。
- **[經濟系統濫用]** → Mitigation: Play Coins 每日發放有上限、Arinova Coins 場次有最低/最高入場費限制。異常行為偵測（同一用戶反覆開場自己贏）。
- **[獎池結算爭議]** → Mitigation: Server-authoritative 結算，所有交易記錄在 ledger 中，可追溯。

## Open Questions

- Playground 是否支持觀眾模式（只看不玩）？
- 用戶是否可以 fork 別人的 playground template？
- Playground 歷史紀錄保留多久？
- 是否需要 playground 內的文字聊天頻道（類似遊戲內聊天）？
- Play Coins 每日發放量多少？是否有等級/VIP 區分？
- Arinova Coins 場次的平台抽成比例？（例如獎池的 5%？）
- 是否需要防沉迷機制（每日 Arinova Coins 場次消費上限）？
