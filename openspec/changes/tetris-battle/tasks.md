## 1. Project Setup

- [x] 1.1 初始化 `apps/tetris-battle` Next.js app（App Router、TypeScript、Tailwind）
- [x] 1.2 設定 turborepo 整合（pnpm workspace、turbo.json）
- [x] 1.3 新增 `@arinova/game-sdk` 為 dependency（來自 `packages/game-sdk`）

## 2. Tetris Engine — 核心邏輯

- [x] 2.1 實作 `engine/types.ts` — 型別定義（Board、Piece、GameState、MoveCommand）
- [x] 2.2 實作 `engine/pieces.ts` — 7 種 tetromino 定義、旋轉矩陣、bag-of-7 隨機器
- [x] 2.3 實作 `engine/board.ts` — 棋盤建立、碰撞檢測、方塊放置、行清除、垃圾行插入
- [x] 2.4 實作 `engine/game.ts` — 遊戲循環（tick、移動、旋轉、軟降、硬降）、計分、升級、遊戲結束偵測
- [x] 2.5 實作對戰攻擊邏輯 — 消行數→垃圾行計算、垃圾行接收處理

## 3. Game UI — 前端渲染

- [x] 3.1 實作 `components/TetrisBoard.tsx` — Canvas 棋盤渲染（格子、方塊顏色、ghost piece、掉落動畫）
- [x] 3.2 實作 `components/GameInfo.tsx` — 分數、等級、消行數、下一塊預覽
- [x] 3.3 實作 `components/DualBoard.tsx` — 雙棋盤 layout（玩家左大、AI 右小）
- [x] 3.4 實作 `components/GameOverDialog.tsx` — 勝負結果畫面
- [x] 3.5 實作 `components/Countdown.tsx` — 3-2-1-GO 倒數動畫

## 4. Game Hooks — 遊戲邏輯整合

- [x] 4.1 實作 `hooks/useGame.ts` — 管理 GameState、tick 計時器、鍵盤輸入、暫停
- [x] 4.2 實作 `hooks/useAgentPlayer.ts` — AI 輪詢（棋盤序列化 → Agent API → 解析指令 → 執行）
- [x] 4.3 實作 `hooks/useBattleManager.ts` — 管理雙方 board、垃圾行交換、勝負判定

## 5. AI Agent 整合

- [x] 5.1 實作棋盤狀態序列化為 AI prompt 文字格式
- [x] 5.2 實作 AI 回應解析器 — 將文字指令（left/right/rotate/drop）轉為 MoveCommand[]
- [x] 5.3 實作 AI timeout 處理 — 5 秒無回應自動 hard drop
- [x] 5.4 實作 Agent 離線偵測與 UI 提示

## 6. Platform 對接

- [x] 6.1 實作 SDK 初始化與 OAuth 登入頁面（Login with Arinova 按鈕）
- [x] 6.2 實作 Agent 選擇 UI — 取得用戶 agent 列表、選擇對手
- [x] 6.3 實作 Economy 入場費扣款（開局扣 10 coins）
- [x] 6.4 實作 Economy 獎勵發放（勝者得 20 coins）
- [x] 6.5 餘額不足時顯示提示並阻止開局

## 7. Pages — 頁面組合

- [x] 7.1 實作首頁 `app/page.tsx` — 登入狀態判斷、Agent 選擇、Start Game 按鈕
- [x] 7.2 實作遊戲頁 `app/game/page.tsx` — 雙棋盤 + 遊戲邏輯 + AI 輪詢整合
- [x] 7.3 實作結果頁 `app/result/page.tsx` — 顯示勝負、分數、coins 變化、再來一局

## 8. Polish & 上架

- [x] 8.1 新增遊戲 icon 和 meta tags
- [x] 8.2 在 App Directory 註冊 Tetris Battle app（name、description、URL、icon）
