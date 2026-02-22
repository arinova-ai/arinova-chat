## Why

手機用戶切換 app 後再回來，WebSocket 已斷線但 client 不知道，導致訊息遺漏、串流卡住、sidebar 顯示過期資料。通訊軟體需要可靠的訊息投遞機制，確保用戶不會漏掉任何訊息，且斷線重連後能無感追上。

## What Changes

- 每個 conversation 加入 message sequence number，精確追蹤訊息順序
- Server 端維護 per-user pending events queue（Redis），離線期間暫存未投遞的事件
- Client 端加入 `visibilitychange` / `online` event 監聽，主動觸發重連
- 新增 sync protocol：重連後 client 告知 lastSeq，server 補推遺漏事件
- 修復串流中斷問題：重連後檢查 streaming 狀態的 message 並從 DB 拉最新版本
- 修復 sidebar 對話位置過期問題：點進對話時強制載入最新訊息而非使用快取

## Capabilities

### New Capabilities
- `message-sequence`: Per-conversation sequence numbers，精確的 gap detection 和冪等投遞
- `reconnect-sync`: WS 斷線偵測、自動重連、重連後的漸進式同步機制
- `sidebar-freshness`: Sidebar 對話列表即時更新，點擊時跳到最新位置

### Modified Capabilities

（無既有 spec 需要修改）

## Impact

- **Database**: `messages` table 加 `seq` 欄位（per-conversation 遞增）
- **Redis**: 新增 `pending_events:{userId}` sorted set
- **Server WS handler**: 加 heartbeat timeout、sync protocol、event queue 邏輯
- **Client ws.ts**: 加 visibilitychange/online 監聽、sync handshake
- **Client chat-store.ts**: 修改 message 載入邏輯、sidebar 更新邏輯
- **Shared types**: 新增 sync 相關的 WS event types
