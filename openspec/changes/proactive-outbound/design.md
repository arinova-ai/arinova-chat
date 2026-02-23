## Context

Agents connect to the Arinova Rust server via WebSocket and currently only respond to `task` events (user-initiated messages). The agent handler (`agent_handler.rs`) processes `agent_chunk`, `agent_complete`, and `agent_error` events — all tied to a pending task. There is no mechanism for an agent to initiate a message.

The OpenClaw plugin has a `sendMessageArinovaChat` function that is called when an agent wants to proactively send a message (e.g., after being @mentioned by another agent in a group). Currently it's a no-op that logs a warning.

The Agent SDK (`ArinovaAgent` class) has no `sendMessage` method — it only exposes `onTask` for receiving tasks and `sendChunk/sendComplete/sendError` within task context.

## Goals / Non-Goals

**Goals:**
- Agent can send a complete message to any conversation it belongs to
- Message appears in the user's chat with proper attribution (agent name, avatar)
- Works for both direct and group conversations
- OpenClaw plugin's `sendMessage` becomes functional
- Reuse existing frontend message handling (no new event types needed)

**Non-Goals:**
- Agent-initiated streaming (proactive messages are sent as complete text, not streamed)
- Agent creating new conversations (only send to existing ones)
- Agent sending messages to conversations it doesn't belong to
- Rate limiting for proactive sends (can add later if needed)

## Decisions

### 1. New WS event: `agent_send`

Agent sends:
```json
{
  "type": "agent_send",
  "conversationId": "<uuid>",
  "content": "<message text>"
}
```

**Why not reuse `agent_complete`?** That event is tied to a `taskId` and goes through the streaming pipeline. Proactive sends are simpler — no task, no streaming, just save and deliver.

### 2. Server reuses `stream_start` + `stream_end` to deliver to frontend

Rather than adding a new frontend event type, the server sends:
1. `stream_start` with `senderAgentId` and `senderAgentName`
2. `stream_end` with the full `content`

The frontend already handles this path (stream_end with content but no chunks = create completed message directly). This was just fixed in commit `0b16de9`.

**Alternative considered:** New `agent_message` event type. Rejected because it would require frontend changes and the existing stream_start/stream_end path already works.

### 3. SDK adds `sendMessage(conversationId, content)` method

Simple public method on `ArinovaAgent` that sends the `agent_send` WS event. No callback needed — fire and forget (server will log errors if the conversation doesn't exist or agent doesn't belong).

### 4. Server validates agent membership

Before creating the message, the server checks that the agent belongs to the conversation (via `conversation_members` for groups, or `agent_id` on the conversation for direct chats). Rejects silently if not a member.

## Risks / Trade-offs

- **No delivery confirmation to agent** → Agent SDK's `sendMessage` is fire-and-forget. If the conversation doesn't exist or agent isn't a member, the message is silently dropped. This is acceptable for v1; can add ack/error events later.
- **No streaming for proactive sends** → Proactive messages are delivered as complete text. This is fine since these are typically short (notifications, @mention responses). If streaming is needed, the agent should use the normal task flow.
- **No rate limiting** → A buggy agent could spam messages. Mitigated by the fact that agents are authenticated and server-side rate limiting can be added later.
