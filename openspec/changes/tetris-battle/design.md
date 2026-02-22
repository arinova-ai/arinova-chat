## Context

Arinova Game Platform API（game-platform-api change）提供 OAuth、Agent Proxy、Economy 三大 API。需要一款真實遊戲做 dogfooding 驗證。雙人對戰俄羅斯方塊是經典且規則明確的遊戲，適合作為第一款平台遊戲。

玩家與自己的 AI Agent 對戰。AI 透過 Agent Proxy API 接收棋盤狀態、回傳操作。

## Goals / Non-Goals

**Goals:**
- 完整走通 SDK OAuth → Agent 選擇 → 遊戲 → Economy 結算的全流程
- 可玩的俄羅斯方塊對戰遊戲（消行攻擊、即時掉落）
- AI Agent 能合理地玩俄羅斯方塊（不需要很強，能下就好）
- 驗證 SDK API 設計的合理性，發現問題及時回饋修改

**Non-Goals:**
- 不做排行榜、匹配系統、多人觀戰
- 不做複雜的 AI 難度調整
- 不做 mobile-first（桌面優先，responsive 即可）
- 不做離線模式

## Decisions

### 1. 遊戲架構：純前端 + API 呼叫

**選擇**: 遊戲邏輯全部跑在瀏覽器端（Canvas/React），不需要遊戲 server。

**理由**: 俄羅斯方塊是單機邏輯，不需要 authoritative server。AI 對手的操作透過 Agent Proxy API 取得後在本地模擬。簡單直接。

**替代方案**: 用 WebSocket 做 game server — 過度工程，1v1 打 AI 不需要。

### 2. AI 對戰模式：回合制輪詢

**選擇**: 每隔 N 秒（例如 2 秒）將 AI 棋盤狀態送給 Agent，Agent 回傳一組操作指令（移動 + 旋轉 + 硬降），前端執行。

**理由**: 即時逐幀呼叫 API 延遲太高且浪費 token。回合制輪詢讓 AI 有思考時間，也符合 LLM 的使用模式。

**AI 輸入格式**:
```
Your Tetris board (10x20, # = filled, . = empty):
..........
..........
...##.....
...##.....
......####
Current piece: T
Next piece: L
Score: 1200
Lines sent to opponent: 3

Respond with moves: left/right/rotate/drop (e.g. "left left rotate drop")
```

**AI 輸出**: 簡單文字指令，如 `"right right rotate drop"`，前端解析執行。

### 3. 對戰攻擊機制

**選擇**: 經典 Tetris Battle 規則 — 消 2 行以上送垃圾行給對手。

| 消行數 | 送出垃圾行 |
|--------|-----------|
| 1 行   | 0         |
| 2 行   | 1         |
| 3 行   | 2         |
| 4 行   | 4         |

垃圾行從底部插入，隨機留一個空洞。

### 4. 前端技術

**選擇**: React + Canvas（HTML5 Canvas 畫棋盤，React 管 UI）

**理由**: Canvas 適合遊戲渲染（60fps 動畫），React 管遊戲外的 UI（分數、按鈕、結果畫面）。不需要引入 Phaser/PixiJS 等遊戲框架 — 俄羅斯方塊夠簡單。

### 5. Economy 整合

**選擇**: 入場費 + 獎金模式
- 開局：雙方各扣 10 coins（走 `/api/v1/economy/charge`）
- 勝者：獲得 20 coins × (1 - 平台費率)（走 `/api/v1/economy/award`）

### 6. 項目結構

```
apps/tetris-battle/
├── src/
│   ├── app/              # Next.js App Router
│   │   ├── page.tsx      # 首頁（登入 / 開始遊戲）
│   │   ├── game/
│   │   │   └── page.tsx  # 遊戲主頁面
│   │   └── result/
│   │       └── page.tsx  # 結果頁面
│   ├── engine/           # 遊戲引擎（純邏輯，無 UI 依賴）
│   │   ├── board.ts      # 棋盤狀態、碰撞檢測
│   │   ├── pieces.ts     # 方塊定義（I, O, T, S, Z, J, L）
│   │   ├── game.ts       # 遊戲循環、計分、等級
│   │   └── types.ts      # 型別定義
│   ├── components/       # React 組件
│   │   ├── TetrisBoard.tsx    # Canvas 棋盤渲染
│   │   ├── GameInfo.tsx       # 分數、等級、下一塊
│   │   ├── AgentBoard.tsx     # AI 對手棋盤（較小）
│   │   └── GameOverDialog.tsx # 結果對話框
│   ├── hooks/
│   │   ├── useGame.ts         # 遊戲主 hook
│   │   └── useAgentPlayer.ts  # AI Agent 輪詢邏輯
│   └── lib/
│       └── arinova.ts         # SDK 初始化 + helpers
├── package.json
└── next.config.ts
```

## Risks / Trade-offs

- **[AI 回應太慢]** → Agent Proxy 可能需要 1-3 秒回應。Mitigation: AI 棋盤在等待期間方塊自動緩慢下降，收到指令後才執行操作。
- **[AI 不會玩]** → LLM 可能給出無效操作。Mitigation: 前端忽略無效指令，AI 方塊自動下落。prompt 盡量簡化。
- **[SDK 尚未完成]** → game-platform-api 是前置依賴。Mitigation: 可以先做遊戲引擎和 UI，API 整合最後接。開發期間 mock SDK 呼叫。
- **[Canvas 在不同螢幕的 DPI 問題]** → 用 `devicePixelRatio` 處理 retina 螢幕。
