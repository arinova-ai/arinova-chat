## Why

Group conversations currently cannot trigger agent responses — the WebSocket handler returns early when `conversations.agent_id` is NULL (which it is for groups). Additionally, there is no way for users to direct messages at specific agents (@mention) or reference previous messages (reply). These are core messaging features needed to make group chat functional and to improve 1v1 conversation UX.

## What Changes

- **Group broadcast**: When a user sends a message in a group, broadcast to ALL agents in the group (via `conversation_members`). Each agent independently decides whether to respond. Multiple agents can stream responses simultaneously as separate message rows.
- **`sender_agent_id` on messages**: Track which agent sent each message. Required for groups (multiple agents) and useful for 1v1 display consistency.
- **@mention autocomplete (frontend)**: Typing `@` in the message input triggers a popup showing available agents in the conversation. Selecting an agent inserts `@AgentName` into the text. The platform does NOT use @mentions for routing — it's purely UX. Agents parse mentions themselves.
- **@mention highlighting (frontend)**: `@AgentName` text in messages is visually highlighted.
- **Reply-to-message**: Users can reply to a specific message. The reply reference (`reply_to_id`) is stored on the message row. Frontend shows a quoted preview above the reply. The referenced message content is included when sending to agents so they have context.
- **Agent SDK update**: Include group context in task payloads — conversation type, list of members, sender info — so agents can make informed decisions about whether/how to respond.

## Capabilities

### New Capabilities
- `mentions`: @mention autocomplete UI, mention insertion, mention highlighting in rendered messages
- `reply-to`: Reply-to-message selection, reply preview display, reply_to_id storage, referenced message in agent context
- `group-broadcast`: Broadcasting messages to all group agents, multi-agent simultaneous streaming, sender_agent_id tracking

### Modified Capabilities
_(none — no existing specs to modify)_

## Impact

- **Database**: `messages` table gets two new nullable columns (`sender_agent_id`, `reply_to_id`)
- **Rust backend**: `ws/handler.rs` (group routing), `ws/agent_handler.rs` (sender tracking), `routes/messages.rs` (reply joins), `routes/conversations.rs` (member info)
- **Frontend**: `chat-input.tsx` (@ popup, reply state), `message-bubble.tsx` (sender display, reply preview, mention highlighting), `chat-store.ts` (reply state, multi-stream tracking)
- **Agent SDK**: Task payload schema change (add group context, reply context)
- **WebSocket protocol**: `send_message` event gains optional `replyToId` and content includes @mention text as-is
