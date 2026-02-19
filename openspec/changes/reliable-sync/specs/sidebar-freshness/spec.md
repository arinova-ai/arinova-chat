## ADDED Requirements

### Requirement: Always load latest messages on conversation open
用戶點擊 conversation 時，client SHALL 始終從 server 載入最新的 messages，而非依賴快取。

#### Scenario: Open conversation with cached messages
- **WHEN** user clicks on a conversation that has cached messages from 5 minutes ago
- **THEN** client fetches latest messages from server and merges with cache, scrolling to the newest message

#### Scenario: Open conversation with no cache
- **WHEN** user clicks on a conversation with no cached messages
- **THEN** client fetches messages from server and displays them, scrolled to bottom

### Requirement: Real-time sidebar last message update
Sidebar 的對話列表 SHALL 在收到 `stream_end` 時即時更新該 conversation 的 lastMessage 預覽，而非等待下一次 `loadConversations()` polling。

#### Scenario: Agent finishes response
- **WHEN** agent completes a streaming response in conversation "abc"
- **THEN** sidebar immediately shows the agent's response as lastMessage for "abc", without a full conversation list reload

### Requirement: Sync updates sidebar in bulk
收到 `sync_response` 後，client SHALL 一次性更新所有 conversation 的 unreadCount 和 lastMessage。

#### Scenario: Reconnect with missed messages
- **WHEN** sync_response contains updated summaries for 3 conversations
- **THEN** sidebar updates all 3 conversations' unreadCount and lastMessage in a single state update

### Requirement: Real-time typing indicator in sidebar
Sidebar SHALL 在非 active conversation 收到 `stream_chunk` 時顯示 "Typing..." 文字，而非靠 API polling 判斷。

#### Scenario: Agent streaming in background conversation
- **WHEN** agent 1 is streaming in conversation "abc" while user is viewing conversation "def"
- **THEN** sidebar shows "Typing..." for conversation "abc" in real-time

#### Scenario: Streaming ends
- **WHEN** stream_end is received for conversation "abc"
- **THEN** sidebar replaces "Typing..." with the actual last message preview

### Requirement: Server-side unread count tracking
Server SHALL 在 `conversation_reads` table 中追蹤每個 user 對每個 conversation 的 `lastReadSeq`。未讀數 = conversation 的 max seq - user 的 lastReadSeq。

#### Scenario: User opens conversation
- **WHEN** user opens conversation "abc" which has messages up to seq 15
- **THEN** client sends `mark_read` event, server updates lastReadSeq to 15, unread count becomes 0

#### Scenario: New message while user is away
- **WHEN** agent sends a message (seq 16) in conversation "abc" while user is viewing "def"
- **THEN** server calculates unread count for "abc" as 16 - 15 = 1

#### Scenario: Unread count survives page refresh
- **WHEN** user refreshes the page
- **THEN** sidebar shows correct unread counts from server (not lost like client-only memory)

#### Scenario: Sync response includes unread counts
- **WHEN** client reconnects and receives sync_response
- **THEN** each conversation summary includes server-calculated unreadCount

### Requirement: Scroll to latest on open
點擊 conversation 後，message list SHALL 自動捲到最新的訊息位置。

#### Scenario: Open conversation after being away
- **WHEN** user opens a conversation that received new messages while user was viewing another conversation
- **THEN** the message list scrolls to the bottom showing the latest messages
