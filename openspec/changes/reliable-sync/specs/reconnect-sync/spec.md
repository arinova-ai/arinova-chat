## ADDED Requirements

### Requirement: Visibility-based reconnection
Client SHALL 監聽 `document.visibilitychange` 事件。當頁面從 hidden 變為 visible 時，MUST 立即檢查 WS 連線狀態，若已斷線則觸發重連。

#### Scenario: User returns from background
- **WHEN** user switches back to the Arinova tab/app after being in background
- **THEN** client checks WS connection within 100ms and initiates reconnect if disconnected

#### Scenario: Connection still alive
- **WHEN** user returns from background and WS is still connected
- **THEN** client sends a ping to verify connection is alive; if no pong within 3 seconds, reconnect

### Requirement: Network-based reconnection
Client SHALL 監聽 `navigator.onLine` 和 `window.online` event。網路恢復時 MUST 立即觸發重連。

#### Scenario: Network restored
- **WHEN** device goes from offline to online
- **THEN** client triggers WS reconnection immediately (bypass exponential backoff)

### Requirement: Sync handshake on reconnect
WS 重連成功後，client SHALL 立即發送 sync request，包含每個已載入 conversation 的 lastSeq。

#### Scenario: Sync after reconnect
- **WHEN** client reconnects and has conversations "abc" (lastSeq=5) and "def" (lastSeq=12)
- **THEN** client sends `{ type: "sync", conversations: { "abc": 5, "def": 12 } }`

#### Scenario: Server sync response
- **WHEN** server receives sync request with conversation "abc" lastSeq=5
- **THEN** server responds with all messages in "abc" with seq > 5, plus conversation summaries for all user conversations (unreadCount, lastMessage)

### Requirement: Server-side pending events queue
Server SHALL 在 Redis 中維護 per-user pending events queue。當 user 的 WS 不在線時，message-related events MUST 被存入 queue。

#### Scenario: User offline when agent replies
- **WHEN** agent completes a response while user has no active WS connection
- **THEN** the stream_end event is stored in `pending_ws_events:{userId}` Redis sorted set

#### Scenario: Queue cleanup on sync
- **WHEN** server successfully delivers pending events during sync
- **THEN** delivered events are removed from the Redis queue

#### Scenario: Queue TTL
- **WHEN** a pending event has been in the queue for more than 24 hours
- **THEN** it is automatically expired by Redis TTL

### Requirement: Streaming interruption recovery
重連 sync 時，server SHALL 檢查 user 是否有 `status: "streaming"` 的 messages 並修復。

#### Scenario: Stream completed while disconnected
- **WHEN** user reconnects and a message was streaming but has since completed
- **THEN** server sends `stream_end` with the final content for that message

#### Scenario: Stream still in progress
- **WHEN** user reconnects and a message is still actively streaming
- **THEN** server resumes sending stream_chunk events to the user

#### Scenario: Stream failed while disconnected
- **WHEN** user reconnects and a streaming message has error status in DB
- **THEN** server sends `stream_error` for that message

### Requirement: Connection status UI
Client SHALL 在 WS 斷線時顯示明確的 UI 指示，告知用戶連線已中斷且正在重連。

#### Scenario: Disconnected banner
- **WHEN** WS connection is lost
- **THEN** a banner appears at the top of the chat area showing "Reconnecting..."

#### Scenario: Banner dismissal
- **WHEN** WS reconnects and sync completes
- **THEN** the disconnected banner disappears

### Requirement: Agent response queuing during active stream
當某個 conversation 已有進行中的 agent streaming 時，新的 user message SHALL 被接受並儲存，但 agent response 的觸發 MUST 排隊等待當前 stream 結束。

#### Scenario: User sends message while agent is streaming
- **WHEN** agent is actively streaming a response in conversation "abc" and user sends a new message
- **THEN** user message is saved to DB and displayed in UI, but the new agent response is NOT triggered until the current stream completes

#### Scenario: Queue processes after stream ends
- **WHEN** the current agent stream completes (stream_end or stream_error) and there is a queued user message
- **THEN** server automatically triggers agent response for the queued message

#### Scenario: Multiple queued messages
- **WHEN** user sends 3 messages while agent is streaming
- **THEN** all 3 user messages are saved and displayed, and after the current stream ends, agent responds considering all 3 messages as context

### Requirement: Server-side heartbeat timeout
Server SHALL 在 WS 連線上設定 heartbeat timeout。如果 45 秒內沒收到任何 client message（包括 ping），MUST 主動關閉連線。

#### Scenario: Client stops sending pings
- **WHEN** server receives no messages from a WS client for 45 seconds
- **THEN** server closes the connection with appropriate close code
