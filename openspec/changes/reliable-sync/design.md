## Context

Arinova Chat 使用 WebSocket 做即時通訊。目前的 `ws.ts` (WebSocketManager) 有基本的 reconnect + exponential backoff + ping/pong，但缺乏：
- 手機切換 app 後的主動偵測與重連
- 斷線期間遺漏訊息的補推機制
- 串流中斷後的狀態修復
- Sidebar 對話列表的即時性

現有架構：Client WS → Server handler.ts → DB + sendToUser()。訊息已持久化到 PostgreSQL，但 WS 投遞是 fire-and-forget。

## Goals / Non-Goals

**Goals:**
- 用戶切換 app 再回來後 < 1 秒內自動重連並同步所有遺漏訊息
- 不漏任何訊息 — per-conversation sequence number 保證精確 gap detection
- 串流中斷後自動修復 — 不會永遠卡在 streaming 狀態
- Sidebar 永遠顯示最新對話狀態，點進去跳到最新位置
- 斷線時 UI 有明確提示

**Non-Goals:**
- Offline message composition（離線編輯草稿，上線後發送）
- End-to-end encryption
- Multi-device sync（目前同一 user 多 WS 已支援，但不追蹤 per-device seq）
- Push notification（獨立功能，已有 push 系統）

## Decisions

### 1. Per-conversation sequence number（非 global seq）

**選擇**: 每個 conversation 維護獨立的遞增 seq，存在 `messages.seq` 欄位。

**替代方案**: Telegram 風格的 per-user global pts。

**理由**: Arinova 的 conversation 數量較少（不像 Telegram 上百個群），per-conversation seq 更簡單：
- DB 層面只需要 `seq SERIAL` 在 messages table
- Client 只需追蹤 active conversation 的 lastSeq
- 不需要複雜的 global → per-chat 映射

### 2. Redis Sorted Set 做 pending events queue

**選擇**: `pending_ws_events:{userId}` Redis sorted set，score = timestamp，value = JSON event。

**替代方案**: PostgreSQL 做 queue / 不做 queue 只靠 REST 補。

**理由**:
- Redis sorted set 天然支援 range query（取 > lastTimestamp 的所有事件）
- 自動 TTL 清理（EXPIRE 24h）
- 我們已經有 Redis instance
- 純 REST 補差需要 client 知道該補哪些 conversation，且對大量 conversation 不友善

### 3. Sync protocol 走 WS 而非 REST

**選擇**: 重連後 client 送 `{ type: "sync", conversations: { [convId]: lastSeq } }`，server 透過同一條 WS 回 `{ type: "sync_response", ... }`。

**替代方案**: 額外的 REST endpoint `/api/sync`。

**理由**: WS 已建立，用同一條連線做 sync 更快（省一次 HTTP roundtrip），且 server 可以在 sync 完成後無縫切換到即時推送。

### 4. Sidebar freshness — 強制 invalidate cache

**選擇**:
- `loadMessages()` 目前有 `if (messagesByConversation[id]) return` 的快取，改為點擊時始終拉最新
- 收到 `sync_response` 後一次性更新所有 conversation 的 lastMessage + unreadCount
- WS 每收到 `stream_end` 時更新對應 conversation 在 sidebar 的 lastMessage

**替代方案**: 只靠 polling loadConversations()。

**理由**: 現在 `loadMessages` 的快取導致點進去看到舊資料。改成「always fetch latest, merge with existing」可以同時解決位置問題和新鮮度問題。

### 5. 串流中斷修復

**選擇**: 重連 sync 時，server 檢查 user 的所有 `status: "streaming"` messages：
- 如果 agent task 仍在進行 → 繼續推 chunks
- 如果 agent task 已完成 → 改為發送 `stream_end` + final content
- 如果 agent task 已失敗 → 發送 `stream_error`

Client 端也在 sync 後掃描本地 streaming messages，對超過 60 秒的標記為 stale 並從 API 拉最新狀態。

## Risks / Trade-offs

- **Redis 記憶體**: pending events queue 會佔用記憶體 → 設 24h TTL + 每 user 最多 1000 events cap
- **Seq 欄位 migration**: 需要 backfill 現有 messages 的 seq → 用 `ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at)` 一次性填入
- **Race condition**: 兩個 WS 同時 sync 同一 user → pending events queue 的 ZRANGEBYSCORE 是冪等的，重複收到同 seq 的 event client 端 skip 即可
- **大 conversation sync**: 如果某個 conversation 有幾百條未讀 → 只送 summary（unread count + last 5 messages），client 點進去再拉全部
