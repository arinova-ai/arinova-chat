## 1. Database Schema

- [x] 1.1 Add `mention_only BOOLEAN NOT NULL DEFAULT true` column to `conversations` table via SQL migration
- [x] 1.2 Update Drizzle schema in `apps/server/src/db/schema.ts` to include `mentionOnly` column
- [x] 1.3 Update Rust `Conversation`-related queries — include `mention_only` in the `trigger_agent_response` conversation query

## 2. Backend — Mention Parsing & Dispatch Filtering

- [x] 2.1 In `trigger_agent_response` (`ws/handler.rs`): after fetching conversation, also read `mention_only` flag from the query
- [x] 2.2 When `mention_only = true` and `conv_type = "group"`: parse `@all` (case-insensitive) from message content — if found, keep all agent_ids (broadcast)
- [x] 2.3 When `mention_only = true`, no `@all`, and `conv_type = "group"`: parse `@AgentName` patterns from content, fetch agent names for the member IDs, filter `agent_ids` to only those whose name matches (case-insensitive)
- [x] 2.4 When filtered `agent_ids` is empty (no mentions matched): skip dispatch entirely (no agent responds)
- [x] 2.5 When `mention_only = false` or `conv_type = "direct"`: no change, dispatch to all (existing behavior)

## 3. Backend — Conversation API

- [x] 3.1 Include `mentionOnly` field in GET `/api/conversations` response (in `routes/conversations.rs`)
- [x] 3.2 Accept `mentionOnly` in PUT `/api/conversations/:id` update handler — allow toggling the flag

## 4. Frontend — Conversation State

- [x] 4.1 Update `ConversationWithAgent` interface in `chat-store.ts` to include `mentionOnly: boolean`
- [x] 4.2 Update `updateConversation` action to support `mentionOnly` field

## 5. Frontend — Group Settings Toggle

- [x] 5.1 Add mention_only toggle to group conversation settings/header UI — switch with label explaining the behavior
- [x] 5.2 Wire toggle to `updateConversation({ mentionOnly: boolean })` API call

## 6. Frontend — Chat Input

- [x] 6.1 Update `ChatInput` placeholder: show `@mention an agent...` when active conversation is a group with `mentionOnly = true`, otherwise show `Type a message...`
- [x] 6.2 Add `@all` as first item in `MentionPopup` when the conversation has `mentionOnly = true` — selecting it inserts `@all ` into the input
- [x] 6.3 Hide `@all` from MentionPopup when `mentionOnly = false` (all agents already receive every message)

## 7. Testing

- [x] 7.1 Build Rust server — verify compilation
- [x] 7.2 Build Next.js frontend — verify compilation
- [x] 7.3 Run Rust server tests — verify all pass
