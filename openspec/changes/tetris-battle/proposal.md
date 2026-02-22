## Why

Arinova 正在建構 Game Platform API（OAuth、Agent Proxy、Economy），但沒有實際遊戲來驗證整個流程。自己用 `@arinova/game-sdk` 做一款雙人對戰俄羅斯方塊，既是平台的第一款 showcase 遊戲，也是 SDK 與 API 的端到端整合測試。透過 dogfooding 提前發現 SDK 設計問題。

## What Changes

- 新增獨立的 Tetris Battle 遊戲 web app（`apps/tetris-battle`）
- 使用 `@arinova/game-sdk` 做 OAuth 登入、Agent 選擇、Economy 扣幣/獎勵
- 遊戲模式：玩家 vs 自己的 AI Agent（1v1 對戰俄羅斯方塊）
- AI Agent 透過 Agent Proxy API 接收棋盤狀態，回傳操作指令
- 遊戲結果走 Economy API 結算（贏家獲得獎勵）
- 遊戲完成後上架到 App Directory 作為第一款平台遊戲

## Capabilities

### New Capabilities
- `tetris-engine`: 俄羅斯方塊核心遊戲引擎（棋盤、方塊生成、碰撞、消行、計分、對戰攻擊）
- `tetris-ai-integration`: AI Agent 對戰整合（棋盤狀態序列化、AI 操作解析、回合制/即時混合模式）
- `tetris-ui`: 遊戲前端 UI（雙人棋盤、即時動畫、遊戲結果畫面）
- `tetris-platform-integration`: 平台對接（SDK OAuth 登入、Agent 選擇、Economy 結算）

### Modified Capabilities

_(無修改既有 capability)_

## Impact

- **新 package**: `apps/tetris-battle`（Next.js app，獨立部署）
- **依賴**: `@arinova/game-sdk`（`packages/game-sdk`，需先完成 game-platform-api change）
- **API 依賴**: OAuth endpoints、Agent Proxy API、Economy API（均來自 game-platform-api）
- **部署**: 獨立 URL，在 App Directory 中以外部連結形式呈現
