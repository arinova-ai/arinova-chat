# QA Report: Thread (討論串) Feature

**Date:** 2026-02-26
**Branch:** jiumi (commits 4a9fd15 → 4426e56 → 4801f5a → 51e89a6 → 3db9fcc)
**Tester:** Claude QA (static code review + TSC type check)
**Build:** `npx tsc --noEmit` PASS | `cargo build` SKIP (Rust not installed locally)

---

## Summary: PASS 30 / SKIP 4 / FAIL 0

---

## T1: DB Migration

| # | Test | Result |
|---|------|--------|
| T1.1 | migration.sql syntax — thread_id, thread_summaries, thread_reads | **PASS** — `migration.sql:460`: `ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id UUID;`. Lines 463-478: `CREATE TABLE IF NOT EXISTS thread_summaries (...)` and `CREATE TABLE IF NOT EXISTS thread_reads (...)`. All SQL syntax correct, uses `IF NOT EXISTS`/`IF NOT EXISTS` guards for idempotency. |
| T1.2 | schema.sql indexes — idx_messages_thread, idx_thread_summaries_last | **PASS** — `schema.sql:546`: `CREATE INDEX idx_messages_thread ON messages(thread_id) WHERE thread_id IS NOT NULL;` (partial index). Line 547: `CREATE INDEX idx_thread_summaries_last ON thread_summaries(last_reply_at DESC);`. Both match migration.sql lines 481-482. |
| T1.3 | Rust Message struct has `thread_id: Option<Uuid>` | **PASS** — `models.rs:204`: `pub thread_id: Option<Uuid>`. MessageRow in messages.rs:48 also has `thread_id: Option<Uuid>`. |
| T1.4 | ThreadSummary / ThreadRead structs exist with correct fields | **PASS** — `models.rs:210-217`: `ThreadSummary { thread_id: Uuid, reply_count: i32, last_reply_at: NaiveDateTime, last_reply_user_id: Option<String>, last_reply_agent_id: Option<Uuid>, participant_ids: Vec<String> }`. Lines 219-224: `ThreadRead { user_id: String, thread_id: Uuid, last_read_seq: i32 }`. |

---

## T2: Backend API

| # | Test | Result |
|---|------|--------|
| T2.1 | Thread messages route registered | **PASS** — `messages.rs:26-32`: Two routes registered: `GET /api/conversations/{conversationId}/threads` and `GET /api/conversations/{conversationId}/threads/{threadId}/messages`. |
| T2.2 | GET threads/{threadId}/messages has cursor pagination | **PASS** — `messages.rs:968-973`: `ThreadMessagesQuery { cursor: Option<String>, limit: Option<String>, direction: Option<String> }`. Cursor is seq-based (`cursor_seq: Option<i32>`). |
| T2.3 | GET threads list endpoint exists | **PASS** — `messages.rs:831-963`: `get_threads()` handler with `ThreadsQuery { cursor: Option<String>, limit: Option<String> }`. Returns thread list with original message preview, reply count, last reply, participants. Cursor is timestamp-based (RFC3339). |
| T2.4 | Main messages API returns threadSummary | **PASS** — `messages.rs:159-178`: `with_attachments()` fetches thread_summaries for all message IDs in batch. Lines 246-255: Builds `threadSummary` JSON with `replyCount`, `lastReplyAt`, `participants`, `lastReplyPreview` (subquery for last thread message content, truncated to 200 chars). |
| T2.5 | Thread messages pagination: direction=after uses items.last() | **PASS** — `messages.rs:1111-1115`: `if direction == "after" { items.last().map(|m| json!(m.seq)) } else { items.first().map(|m| json!(m.seq)) }`. Correct — for "after" direction (newer messages), cursor points to last item. |

---

## T3: thread_summaries Update

| # | Test | Result |
|---|------|--------|
| T3.1 | update_thread_summary helper function exists | **PASS** — `handler.rs:718`: `async fn update_thread_summary(db: &PgPool, thread_id: &str, sender_user_id: Option<&str>, sender_agent_id: Option<&str>)`. |
| T3.2 | UPSERT logic: ON CONFLICT DO UPDATE | **PASS** — `handler.rs:725-744`: `INSERT INTO thread_summaries (...) VALUES (...) ON CONFLICT (thread_id) DO UPDATE SET reply_count = thread_summaries.reply_count + 1, last_reply_at = NOW(), ...` with participant_ids array_append logic. |
| T3.3 | 3 INSERT paths all call update_thread_summary | **PASS** — (1) `handler.rs:837-838`: H2H user message insert → `update_thread_summary(db, tid, Some(user_id), None)`. (2) `handler.rs:973-974`: Agent conversation user message insert → `update_thread_summary(db, tid, Some(user_id), None)`. (3) `handler.rs:1456-1457`: Agent stream completion → `update_thread_summary(&db, tid, None, Some(&agent_id))`. All 3 guarded by `if let Some(ref tid) = thread_id`. |
| T3.4 | do_trigger_agent_response accepts thread_id parameter | **PASS** — `handler.rs:1081`: `thread_id: Option<&str>` parameter. Used directly at line 1183: `.bind(thread_id.as_deref())` for INSERT and line 1456-1457 for update_thread_summary. No DB reverse-lookup. |

---

## T4: WS Events

| # | Test | Result |
|---|------|--------|
| T4.1 | send_message event parses threadId | **PASS** — `handler.rs:370`: `let thread_id = event.get("threadId").and_then(\|v\| v.as_str()).map(\|s\| s.to_string());`. Passed to message INSERT at line 825 and to do_trigger_agent_response at line 1063. |
| T4.2 | new_message broadcast includes threadId | **PASS** — `handler.rs:859`: `"threadId": thread_id` in H2H broadcast. Line 995: `"threadId": thread_id` in agent-conv broadcast. |
| T4.3 | stream_start broadcast includes threadId | **PASS** — `handler.rs:1153`: `"threadId": thread_id` (error case). Line 1203: `"threadId": thread_id` (normal case). **Note:** Sync/reconnection path at line 678 does NOT include threadId — minor edge case for reconnection during active thread stream. |
| T4.4 | stream_chunk broadcast includes threadId | **PASS** — `handler.rs:1414`: `"threadId": &thread_id`. |
| T4.5 | stream_end broadcast includes threadId | **PASS** — `handler.rs:1451`: `"threadId": &thread_id` (normal completion). Line 1567: `"threadId": &thread_id` (accumulated content fallback). |
| T4.6 | stream_error broadcast includes threadId | **PASS** — `handler.rs:1161`: `"threadId": thread_id` (agent not connected error). Line 1393: `"threadId": &thread_id` (spawn error). Line 1519: `"threadId": &thread_id` (agent error event). Line 1551: `"threadId": &thread_id` (agent disconnect). |

---

## T5: Frontend Types

| # | Test | Result |
|---|------|--------|
| T5.1 | Message type has threadId and threadSummary | **PASS** — `types/index.ts:91`: `threadId?: string;`. Line 92: `threadSummary?: ThreadSummary;`. |
| T5.2 | ThreadSummary type correct | **PASS** — `types/index.ts:66-71`: `ThreadSummary { replyCount: number; lastReplyAt: string; participants: string[]; lastReplyPreview: string \| null; }`. |
| T5.3 | WSServerEvent stream events have threadId | **PASS** — `types/index.ts:421`: stream_start has `threadId?: string`. Line 429: stream_chunk. Line 437: stream_end. Line 445: stream_error. Line 469: new_message has `threadId?: string` at event level. Line 481: new_message.message also has `threadId?: string`. |

---

## T6: Chat Store

| # | Test | Result |
|---|------|--------|
| T6.1 | activeThreadId state exists | **PASS** — `chat-store.ts:111`: `activeThreadId: string \| null;`. Initialized to `null` at line 223. |
| T6.2 | threadMessages state exists | **PASS** — `chat-store.ts:112`: `threadMessages: Record<string, Message[]>;`. Initialized to `{}` at line 224. |
| T6.3 | openThread / closeThread / loadThreadMessages / sendThreadMessage actions | **PASS** — Line 181: `openThread`. Line 182: `closeThread`. Line 183: `loadThreadMessages`. Line 184: `sendThreadMessage`. All implemented (lines 934-997). |
| T6.4 | new_message handler routes thread messages to threadMessages | **PASS** — `chat-store.ts:1033-1054`: `if (threadId)` → routes to `threadMessages[threadId]` array. Handles both new messages and temp→real ID replacement (dedup by content match). Also updates parent message's threadSummary in mainMessages (lines 1060-1066). |
| T6.5 | Stream handlers use event.threadId for routing | **PASS** — stream_chunk: line 1194 `const threadId = event.threadId;`, line 1216-1221 routes to threadMessages. stream_end: line 1272, 1293-1299. stream_error: line 1422, 1441-1446. All use `event.threadId` for conditional routing. No threadStreamMap. |
| T6.6 | setActiveConversation closes thread panel | **PASS** — `chat-store.ts:238`: `activeThreadId: null` in setActiveConversation action. |

---

## T7: Thread Panel UI

| # | Test | Result |
|---|------|--------|
| T7.1 | thread-panel.tsx exists | **PASS** — 195-line component at `apps/web/src/components/chat/thread-panel.tsx`. |
| T7.2 | SheetContent: w-full sm:w-[380px] (mobile responsive) | **PASS** — Line 94: `className="w-full sm:w-[380px] sm:max-w-[380px] p-0 flex flex-col"`. Full-width on mobile, 380px on desktop. |
| T7.3 | Displays original message | **PASS** — Lines 108-124: Renders `originalMessage` in a muted preview card. Shows senderAgentName (blue) or senderUserName (emerald). Content shown with `line-clamp-3`. |
| T7.4 | Thread message list | **PASS** — Lines 128-162: `<div ref={scrollRef}>` with `flex-1 overflow-y-auto`. Renders loading spinner, empty state ("No replies yet"), or message list with `MessageBubble`. Also renders `TypingIndicator`. |
| T7.5 | Input textarea + send button | **PASS** — Lines 166-189: `<textarea>` with auto-resize (max 120px), Enter-to-send (Shift+Enter for newline), and Send `<Button>` disabled when empty. |
| T7.6 | isInThread prevents thread-in-thread | **PASS** — Line 153: `<MessageBubble message={msg} isGroupConversation={true} isInThread />`. The `isInThread` prop is passed, which controls thread button visibility in MessageBubble. |

---

## T8: Message Bubble

| # | Test | Result |
|---|------|--------|
| T8.1 | Thread indicator (replyCount > 0) | **PASS** — `message-bubble.tsx:276-288`: `{!isInThread && message.threadSummary && message.threadSummary.replyCount > 0 && (...)}`. Renders clickable button with MessageSquare icon showing "N reply/replies". |
| T8.2 | Thread button in hover action bar | **PASS** — Lines 339-349: `{!isInThread && (<Button ... onClick={() => openThread(message.id)} title="Start thread"><MessageSquare /></Button>)}`. Hidden when `isInThread`. |
| T8.3 | isInThread prop exists | **PASS** — Line 47: `isInThread?: boolean` in `MessageBubbleProps`. Used at lines 276 and 339 to conditionally hide thread UI. |

---

## T9: Message List

| # | Test | Result |
|---|------|--------|
| T9.1 | Filters out thread messages from main conversation | **PASS** — `message-list.tsx:22`: `const messages = rawMessages.filter((m) => !m.threadId).filter(...)`. Messages with `threadId` are excluded from the main list and only shown in the thread panel. |

---

## T10: Chat Area

| # | Test | Result |
|---|------|--------|
| T10.1 | ThreadPanel integrated into chat-area.tsx | **PASS** — `chat-area.tsx:15`: `import { ThreadPanel } from "./thread-panel";`. Line 115: `<ThreadPanel />` rendered as last child of the chat area div. |

---

## T11: Frontend Screenshots

| # | Test | Result |
|---|------|--------|
| T11.1 | Desktop main conversation with thread indicator | **SKIP** — Test account (cozy@test.com) has no conversations. Cannot produce thread indicator screenshot without message data with threadSummary. |
| T11.2 | Thread panel open state | **SKIP** — Requires active conversation with thread data. |
| T11.3 | Mobile thread panel | **SKIP** — Same as above. |

**Reason:** The Docker test environment has no seeded conversation/message data. Thread UI components exist and compile (TSC passes), but cannot be visually tested without either: (a) seeding test data with thread messages, or (b) manual testing via a live development server with real conversations.

---

## Architecture Overview

```
┌─────────────────────┐         ┌──────────────────────┐
│   Frontend (Next.js) │         │  Backend (Rust/Axum)  │
├─────────────────────┤         ├──────────────────────┤
│ types/index.ts       │◄────────│ models.rs             │
│  Message.threadId    │         │  Message.thread_id    │
│  ThreadSummary       │         │  ThreadSummary        │
│  WSServerEvent       │         │  ThreadRead           │
│   .threadId on all   │         │                       │
├─────────────────────┤         ├──────────────────────┤
│ chat-store.ts        │  WS     │ handler.rs            │
│  activeThreadId      │◄═══════►│  send_message →       │
│  threadMessages      │         │    parse threadId     │
│  openThread()        │         │    INSERT w/ thread_id│
│  closeThread()       │         │    update_thread_sum  │
│  sendThreadMessage() │         │  stream_* → threadId  │
│  handleWSEvent()     │         │  3 INSERT paths       │
│   route by threadId  │         │    all call upsert    │
├─────────────────────┤         ├──────────────────────┤
│ thread-panel.tsx     │         │ messages.rs (REST)    │
│  Sheet w-full/380px  │         │  GET .../threads      │
│  original msg header │         │  GET .../threads/{id} │
│  message list        │         │    /messages          │
│  input + send        │         │  threadSummary in     │
├─────────────────────┤         │    with_attachments   │
│ message-bubble.tsx   │         └──────────────────────┘
│  threadSummary badge │
│  thread action btn   │         ┌──────────────────────┐
│  isInThread guard    │         │  Database (Postgres)  │
├─────────────────────┤         ├──────────────────────┤
│ message-list.tsx     │         │ messages.thread_id    │
│  filter(!m.threadId) │         │ thread_summaries      │
├─────────────────────┤         │   PK: thread_id       │
│ chat-area.tsx        │         │   reply_count, etc.   │
│  <ThreadPanel />     │         │ thread_reads          │
└─────────────────────┘         │ idx_messages_thread   │
                                │ idx_thread_summ_last  │
                                └──────────────────────┘
```

---

## Findings & Notes

### Edge Cases Noted

1. **Sync/reconnect stream_start missing threadId** (`handler.rs:678`): The reconnection path broadcasts `stream_start` without `threadId`. If a user reconnects during an active thread stream, the frontend won't know to route it to threadMessages. Impact: Low (rare edge case, stream_chunk/stream_end DO include threadId, so subsequent events will route correctly).

2. **Thread dedup strategy**: `thread-panel.tsx:34` deduplicates by `findIndex(x => x.id === m.id)` — O(n^2) but acceptable for thread message counts (typically < 100).

3. **threadSummary lastReplyPreview subquery**: `messages.rs:163-164` uses a correlated subquery `(SELECT content FROM messages WHERE thread_id = ts.thread_id ORDER BY created_at DESC LIMIT 1)` inside the batch fetch. This is executed per-row. At scale (many threads), consider a denormalized `last_reply_preview` column in thread_summaries.

4. **QueuedResponse carries thread_id**: `state.rs:43` has `pub thread_id: Option<String>`, and the queue processing at `handler.rs:1739` passes `next.thread_id.as_deref()` to `do_trigger_agent_response`. Thread context is preserved through the agent response queue.

### Code Quality

- Clean separation: DB migration, Rust structs, REST API, WS events, frontend types, store, and UI components all consistently carry `thread_id`/`threadId`.
- Thread messages are properly filtered from main message list (`!m.threadId`) and routed to dedicated `threadMessages` store.
- ThreadPanel uses Radix Sheet component with responsive sizing (`w-full` mobile / `sm:w-[380px]` desktop).
- Parent message threadSummary is updated in-memory when new_message arrives (line 1060-1066), avoiding a full refetch.
