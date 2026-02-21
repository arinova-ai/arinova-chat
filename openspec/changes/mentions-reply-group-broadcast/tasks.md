## 1. Database Schema

- [x] 1.1 Add `sender_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL` and `reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL` columns to `messages` table via SQL migration
- [x] 1.2 Backfill `sender_agent_id` for existing agent messages in direct conversations: `UPDATE messages SET sender_agent_id = c.agent_id FROM conversations c WHERE messages.conversation_id = c.id AND messages.role = 'agent' AND c.agent_id IS NOT NULL`
- [x] 1.3 Update Drizzle schema in `apps/server/src/db/schema.ts` to include `senderAgentId` and `replyToId` columns
- [x] 1.4 Update Rust `Message` struct in `apps/rust-server/src/db/models.rs` to include `sender_agent_id: Option<Uuid>` and `reply_to_id: Option<Uuid>`

## 2. Shared Types

- [x] 2.1 Update `Message` interface in `packages/shared/src/types/index.ts` — add `senderAgentId?: string`, `senderAgentName?: string`, `replyToId?: string`, `replyTo?: { role: string; content: string; senderAgentName?: string }`
- [x] 2.2 Update `WSClientEvent` `send_message` type — add optional `replyToId?: string`
- [x] 2.3 Update `WSServerEvent` `stream_start` type — add `senderAgentId?: string`, `senderAgentName?: string`
- [x] 2.4 Update agent task event type — add `conversationType?: string`, `members?: { agentId: string; agentName: string }[]`, `replyTo?: { role: string; content: string; senderAgentName?: string }`

## 3. Backend — Group Broadcast

- [x] 3.1 Refactor `WsState` — change `active_streams` from `DashSet<String>` (keyed by conversation_id) to `DashSet<String>` keyed by `{conversation_id}:{agent_id}` to allow concurrent per-agent streams
- [x] 3.2 Update `QueuedResponse` struct — add `agent_id: String` field so queued items know which agent to dispatch to
- [x] 3.3 Refactor `trigger_agent_response` — for group conversations, query `conversation_members` to get all agent IDs, then call `do_trigger_agent_response` for each agent via `tokio::spawn`
- [x] 3.4 Update `do_trigger_agent_response` — accept `agent_id` as parameter instead of reading from `conversations.agent_id`; set `sender_agent_id` on inserted agent message row
- [x] 3.5 Update `process_next_in_queue` — use `agent_id` from `QueuedResponse` instead of re-querying conversation

## 4. Backend — Reply-To

- [x] 4.1 Update `send_message` WS handler — parse optional `replyToId` from client event, pass to `trigger_agent_response`
- [x] 4.2 Update `trigger_agent_response` — accept `reply_to_id` parameter, set on user message INSERT
- [x] 4.3 Update `do_trigger_agent_response` — when `reply_to_id` is set, fetch the replied-to message content and include in agent task payload as `replyTo` object
- [x] 4.4 Update agent task payload — include `conversationType`, `members` list (for groups), and `replyTo` context

## 5. Backend — Message API

- [x] 5.1 Update `MessageRow` struct and GET messages query — JOIN `agents` table to include `sender_agent_id`, `sender_agent_name`, and LEFT JOIN `messages` for `reply_to_id` with replied-to message content/role/sender
- [x] 5.2 Update message JSON serialization — include `senderAgentId`, `senderAgentName`, `replyToId`, `replyTo` object in response
- [x] 5.3 Update `stream_start` event sent to client — include `senderAgentId` and `senderAgentName`

## 6. Frontend — Reply-To

- [x] 6.1 Add `replyingTo: Message | null` state and `setReplyingTo` / `clearReplyingTo` actions to `chat-store.ts`
- [x] 6.2 Add "Reply" action to message hover bar and `MessageActionSheet` in `message-bubble.tsx`
- [x] 6.3 Create `ReplyPreview` component — shows above chat input with sender name, content snippet, and dismiss button
- [x] 6.4 Update `ChatInput` — render `ReplyPreview` when `replyingTo` is set; pass `replyToId` in `sendMessage`; clear reply state after send
- [x] 6.5 Update `sendMessage` in chat-store — include `replyToId` in WS `send_message` event
- [x] 6.6 Add `ReplyQuote` display inside `MessageBubble` — compact quoted block above content showing original sender and snippet

## 7. Frontend — @Mention Autocomplete

- [x] 7.1 Add conversation members data to chat-store — for groups fetch from `/api/conversations/{id}/members`, for direct use the single agent
- [x] 7.2 Create `MentionPopup` component — list of agents filtered by query text, keyboard navigation (Arrow/Enter/Escape), same pattern as slash popup
- [x] 7.3 Update `ChatInput` — detect `@` trigger at any cursor position, extract query after `@`, show `MentionPopup`, on select insert `@AgentName` at cursor position
- [x] 7.4 Add mention highlighting in `MarkdownContent` or `MessageBubble` — detect `@AgentName` patterns matching conversation members and render with highlight style

## 8. Frontend — Group Message Display

- [x] 8.1 Update `MessageBubble` — show sender agent name and avatar for agent messages using `senderAgentId` / `senderAgentName` from message data instead of conversation-level `agentName` prop
- [x] 8.2 Update `stream_start` handler in chat-store — set `senderAgentId` and `senderAgentName` on the optimistic streaming message
- [x] 8.3 Handle multiple simultaneous streaming messages in chat-store — currently assumes one streaming message per conversation, update to support multiple

## 9. Agent SDK

- [x] 9.1 Update TypeScript agent SDK (`packages/agent-sdk`) — add `conversationType`, `members`, `replyTo` fields to task event type
- [x] 9.2 Update Python agent SDK (`packages/agent-sdk-python`) — add same fields to task event type

## 10. Testing

- [ ] 10.1 Test group broadcast — create group, send message, verify all agents receive task
- [ ] 10.2 Test multi-agent streaming — verify two agents can stream simultaneously in same conversation
- [ ] 10.3 Test reply-to — send reply, verify reply_to_id stored, verify agent receives reply context
- [ ] 10.4 Test @mention autocomplete — verify popup appears, filters, inserts correctly
