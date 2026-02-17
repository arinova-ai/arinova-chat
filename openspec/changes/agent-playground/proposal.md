## Why

Arinova Chat 目前的互動模式侷限在對話（direct / group conversations）。用戶可以跟 agents 聊天，但缺乏一個讓 agents 創造並主持互動體驗的空間。Playground 讓 AI agents 成為創作者 — 用戶描述想要的體驗，agent 就能生成一個持久的互動空間（遊戲、畫室、辯論場等），其他用戶可以帶自己的 agents 加入。這把 Arinova 從「聊天平台」推向「AI 互動生態系」。

## What Changes

- 新增 **Playground** 作為獨立於 conversations 和 marketplace 之外的頂層功能，在 sidebar 有專屬入口。
- AI Agent 可以 **創建 playground**：用戶用自然語言描述想要什麼體驗，agent 生成 playground 的規則、場景定義、互動方式。
- Playground 是 **持久的**：創建後持續存在，創建者可以刪除。
- 支持 **多用戶參與**：多個用戶各自帶自己的 agent 進入同一個 playground 互動。
- 提供 **playground 瀏覽列表**：用戶可以瀏覽、搜尋已創建的 playgrounds，選擇加入。
- 編寫 **playground 創建規範文件**（markdown），定義 agent 如何創建 playground 的標準格式與流程。

## Capabilities

### New Capabilities

- `playground-schema`: Playground 資料模型 — playground 定義、規則、場景、角色、互動方式的結構化 schema。
- `playground-creation`: Agent 創建 playground 的流程 — 用戶描述需求、agent 生成定義、驗證、儲存。包含創建規範文件（md）。
- `playground-runtime`: Playground 運行時 — 多用戶 + 多 agent 在同一空間的即時互動、狀態同步、事件處理。
- `playground-management`: Playground 生命週期管理 — 瀏覽列表、搜尋、加入/離開、刪除、參與者管理。
- `playground-ui`: 前端 UI — sidebar 入口、playground 列表頁、playground 內部互動介面。

### Modified Capabilities

_(none — playground 與現有功能完全獨立)_

## Impact

- **Database**: 新增 `playgrounds`、`playground_participants`、`playground_state`、`playground_messages` 等表
- **Backend**: 新增 playground CRUD routes、WebSocket 頻道（多用戶即時互動）、agent playground 創建 API
- **Frontend**: Sidebar 新增 Playground 入口、playground 列表/搜尋頁、playground 互動頁面、agent 拖拉加入 UI
- **Shared types**: 新增 Playground、PlaygroundParticipant、PlaygroundState 等型別與 Zod schemas
- **Documentation**: 編寫 playground 創建規範 md 檔案，定義 agent 如何結構化地創建 playground
- **Demo playground**: 內建「狼人殺」示範 playground — 展示角色分配、資訊隔離、回合制、投票機制、多用戶多 agent 互動
