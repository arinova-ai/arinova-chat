## ADDED Requirements

### Requirement: Per-conversation message sequence numbers
每則 message 在其所屬 conversation 中 SHALL 有唯一的遞增 `seq` 欄位（integer）。seq 在同一 conversation 內 MUST 嚴格遞增且不跳號。

#### Scenario: New message gets next seq
- **WHEN** a message is inserted into conversation "abc"
- **THEN** its `seq` equals the previous highest seq in that conversation + 1

#### Scenario: First message in conversation
- **WHEN** the first message is inserted into a new conversation
- **THEN** its `seq` is 1

#### Scenario: Concurrent inserts maintain order
- **WHEN** two messages are inserted concurrently into the same conversation
- **THEN** each gets a unique seq with no gaps (e.g., 5 and 6)

### Requirement: Backfill existing messages
系統 SHALL 提供 migration 為既有 messages 回填 seq 值，基於 `created_at` 排序。

#### Scenario: Migration backfill
- **WHEN** the migration runs on a conversation with 100 existing messages
- **THEN** all 100 messages get seq 1-100 in chronological order

### Requirement: WS events include seq
所有透過 WebSocket 推送的 message-related events（stream_start, stream_chunk, stream_end, stream_error）SHALL 包含該 message 的 `seq` 欄位。

#### Scenario: stream_start event contains seq
- **WHEN** server sends a `stream_start` event for a new agent message
- **THEN** the event payload includes `seq` field matching the message's database seq

### Requirement: Client tracks lastSeq per conversation
Client MUST 維護每個已載入 conversation 的 `lastSeq`。收到新 event 時，如果 event.seq > lastSeq + 1，表示有 gap。

#### Scenario: Gap detection
- **WHEN** client has lastSeq=5 for conversation "abc" and receives event with seq=8
- **THEN** client detects a gap (missing seq 6, 7) and triggers a sync request
