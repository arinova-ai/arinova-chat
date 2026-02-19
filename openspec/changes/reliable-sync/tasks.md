## 1. Database — Message Sequence Numbers + Read Tracking

- [x] 1.1 在 `messages` table 加 `seq` 欄位（integer, nullable initially）
- [x] 1.2 建立 migration：用 `ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at)` 回填現有 messages 的 seq
- [x] 1.3 將 `seq` 設為 NOT NULL，加 unique constraint `(conversation_id, seq)`
- [x] 1.4 在 message insert 時自動計算 next seq（`SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE conversation_id = ?`）
- [x] 1.5 新增 `conversation_reads` table（userId, conversationId, lastReadSeq, updatedAt），追蹤每個用戶在每個對話讀到第幾則
- [x] 1.6 API：用戶開啟 conversation 時更新 lastReadSeq（`PUT /api/conversations/:id/read`）

## 2. Shared Types — Sync Protocol

- [x] 2.1 新增 WS event types：`sync`（client→server）、`sync_response`（server→client）
- [x] 2.2 擴充現有 WS event types：`stream_start`/`stream_chunk`/`stream_end`/`stream_error` 加 `seq` 欄位
- [x] 2.3 新增 Zod schemas 驗證 sync events
- [x] 2.4 `sync_response` 包含每個 conversation 的 `unreadCount`（server 端計算：maxSeq - lastReadSeq）

## 3. Server — Pending Events Queue

- [x] 3.1 新增 `pending-events.ts` 工具：`pushEvent(userId, event)` 存入 Redis sorted set
- [x] 3.2 實作 `getPendingEvents(userId)` 從 Redis 取所有待投遞事件
- [x] 3.3 實作 `clearPendingEvents(userId)` 清除已投遞事件
- [x] 3.4 設定 Redis TTL 24h + 每 user 最多 1000 events cap

## 4. Server — WS Handler 改造

- [x] 4.1 `sendToUser()` 改造：user 離線時改存 pending events queue 而非丟棄
- [x] 4.2 所有 message events 加入 `seq` 欄位（從 DB insert 結果取得）
- [x] 4.3 處理 `sync` event：查 DB 補遺漏 messages + 回傳 conversation summaries（含 server-side unreadCount）
- [x] 4.4 Sync 時檢查 streaming messages 狀態並修復（completed/error/still-streaming）
- [x] 4.5 加 server-side heartbeat timeout（45 秒無 message 則關閉連線）
- [x] 4.6 處理 `mark_read` event：用戶正在瀏覽的 conversation，即時更新 lastReadSeq

## 5. Client — WebSocketManager 改造

- [x] 5.1 加 `visibilitychange` 監聽：頁面可見時立即檢查連線並重連
- [x] 5.2 加 `online` event 監聯：網路恢復時立即重連（bypass backoff）
- [x] 5.3 重連成功後自動發送 `sync` request（帶各 conversation 的 lastSeq）
- [x] 5.4 處理 `sync_response`：merge 遺漏 messages + 更新 conversation summaries
- [x] 5.5 加 connection status 狀態追蹤（connected/disconnected/syncing）
- [x] 5.6 收到 event 時追蹤 lastSeq per conversation，偵測 gap 觸發 sync

## 6. Client — Chat Store 改造

- [x] 6.1 移除 `loadMessages()` 的快取 guard — 點擊 conversation 時始終拉最新 messages
- [x] 6.2 拉到新 messages 後自動 scroll to bottom
- [x] 6.3 `handleWSEvent` 處理 `sync_response`：批次更新 sidebar 的 unreadCount + lastMessage
- [x] 6.4 `stream_end` 時即時更新 sidebar 對應 conversation 的 lastMessage 預覽（不等 loadConversations）
- [x] 6.5 `stream_chunk` 時更新 sidebar 的 typing indicator（非 active conversation 也要顯示 "Typing..."）
- [x] 6.6 `unreadCounts` 改為從 server-side `sync_response` 取得，不再純 client memory 計數
- [x] 6.7 用戶開啟 conversation 時送 `mark_read` event 到 server（更新 lastReadSeq），同時清除本地 unreadCount

## 7. Server — Agent Response Queuing

- [x] 7.1 `triggerAgentResponse()` 加入 per-conversation queue：如果該 conversation 已有進行中的 stream，新的 user message 排隊等待
- [x] 7.2 `stream_end` / `stream_error` 完成後自動 dequeue 並觸發下一條排隊的 agent response
- [x] 7.3 前端 `sendMessage()` 在 agent streaming 時仍正常顯示 user message，但不會立刻產生空白 agent bubble

## 8. Client — Connection Status UI

- [x] 8.1 實作 ConnectionBanner 元件：斷線時顯示「Reconnecting...」banner
- [x] 8.2 在 ChatLayout 中整合 ConnectionBanner，基於 wsManager 的 connection status 顯示/隱藏
