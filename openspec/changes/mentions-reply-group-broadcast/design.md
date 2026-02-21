## Context

Arinova Chat supports group conversations (multiple agents + one user) at the DB/API level, but the WebSocket handler's `trigger_agent_response` only works for direct (1v1) conversations — it reads `conversations.agent_id` which is NULL for groups, then returns early. Messages table lacks `sender_agent_id` (can't identify which agent sent a message in a group) and `reply_to_id` (no reply threading).

The platform takes a "dumb pipe" approach: broadcast all messages to all group members, let agents decide whether to respond. @mentions are a frontend UX feature, not a routing mechanism.

## Goals / Non-Goals

**Goals:**
- Group conversations trigger agent responses (broadcast to all members)
- Multiple agents can stream responses simultaneously
- Users can @mention agents with autocomplete
- Users can reply to specific messages
- Agents receive enough context (group info, reply content) to make response decisions

**Non-Goals:**
- Server-side @mention routing (agents decide themselves)
- Agent-to-agent communication (future scope)
- Threaded conversations / sub-threads (reply is flat, not nested)
- Multi-human groups (Phase 2/3, current groups are 1 user + N agents)

## Decisions

### 1. Group message broadcast — fan-out at WS handler level

When a user sends a message in a group, the server queries `conversation_members` for all agent IDs, then calls `do_trigger_agent_response` for each agent. Each agent gets its own pending message row (`role: "agent"`, `sender_agent_id` set).

**Why not queue-based fan-out?** Overkill for current scale. Direct dispatch in the WS handler is simple and follows the existing 1v1 pattern. Can move to a queue later if needed.

**Parallel vs sequential dispatch:** Dispatch all agents in parallel using `tokio::spawn`. Each agent's response is an independent message with its own streaming lifecycle. No ordering dependency.

### 2. Multi-agent streaming — independent message streams

Each agent response is a separate `message` row with its own `id`. The frontend receives `stream_start { messageId: "A" }` and `stream_start { messageId: "B" }` and renders two independent streaming bubbles. Existing `stream_chunk` / `stream_end` events already carry `messageId`, so no protocol change needed.

**Per-conversation queue concern:** Currently there's a per-conversation queue (one active stream at a time). For group broadcast, we need to allow multiple concurrent streams in the same conversation. Change the queue to per-agent-per-conversation.

### 3. sender_agent_id — nullable UUID on messages

Add `sender_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL` to `messages`. Set for all `role: "agent"` messages (both 1v1 and group). NULL for `role: "user"` messages. This also retroactively improves 1v1 — we can show agent avatar/name per-message instead of per-conversation.

For existing messages: backfill by joining `messages.conversation_id` → `conversations.agent_id` for direct conversations. Group messages before this change don't exist (groups never worked), so no concern there.

### 4. reply_to_id — nullable UUID on messages

Add `reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL` to `messages`. When fetching messages, JOIN to get the replied-to message's content and sender info (single-level, no recursive joins).

WS `send_message` event adds optional `replyToId` field. Agent task payload includes the replied-to message content so the agent has context.

### 5. @mention — frontend-only with text content

Mentions are stored as plain text in message content: `@AgentName`. The frontend provides an autocomplete popup (triggered by `@` keystroke) that inserts the agent's display name. The frontend also highlights `@AgentName` patterns when rendering.

No structured `mentions` column in DB. The agent SDK can parse `@` patterns from the message content. This keeps the platform simple and avoids sync issues if agent names change.

### 6. Agent task payload — add group context

Current task payload sent to agents: `{ id, content }`. Expand to include:
```json
{
  "id": "task-uuid",
  "content": "user message text",
  "conversationType": "group",
  "replyTo": { "role": "agent", "agentName": "...", "content": "..." },
  "members": [{ "agentId": "...", "agentName": "..." }, ...]
}
```

This gives agents enough info to decide whether to respond (e.g., check if they're @mentioned, check conversation type).

## Risks / Trade-offs

- **Multiple agents all responding** → Could be noisy. Mitigation: This is the agent developer's responsibility. Platform docs should advise using @mention parsing. Future: add a "quiet mode" agent setting.
- **Parallel streams performance** → N agents streaming simultaneously = N concurrent DB writes + WS sends. Mitigation: Acceptable for small groups (2-5 agents). Monitor and add backpressure if needed.
- **No structured mentions** → Agent name changes break @mention text. Mitigation: Agent names rarely change. If needed later, add a `mentions` JSONB column with agent IDs.
- **Backfill sender_agent_id** → Requires a one-time migration query. Mitigation: Simple UPDATE...FROM join, safe to run.
