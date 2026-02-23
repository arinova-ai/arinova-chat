## Context

Currently, `stream_start` WebSocket events immediately create a message bubble with empty content and a spinner in the frontend (`chat-store.ts:732-761`). If the agent disconnects or fails before sending any `stream_chunk`, this bubble stays permanently — a "ghost message." Backend fixes (sending `stream_error` on failure paths) help but can't cover every edge case (network drops, process crashes, etc.).

Slack and similar apps use a different pattern: show a lightweight typing indicator at the bottom of the chat, and only create the actual message when content arrives. This structurally eliminates ghost messages.

## Goals / Non-Goals

**Goals:**
- Eliminate ghost empty message bubbles by deferring message creation to first `stream_chunk`
- Show a typing indicator bar at the bottom of the message list when agents are "thinking"
- Support multiple concurrent thinking agents in group conversations
- Maintain existing scroll-to-bottom behavior

**Non-Goals:**
- Changing the backend WebSocket protocol (same events: `stream_start`, `stream_chunk`, `stream_end`, `stream_error`)
- Adding typing indicators for user-to-user typing (not applicable — agents only)
- Animating the typing indicator (keep it simple, text-based)

## Decisions

### 1. New `thinkingAgents` state in chat store

Add `thinkingAgents: Record<string, ThinkingAgent[]>` keyed by conversationId.

```typescript
type ThinkingAgent = {
  messageId: string;
  agentId: string;
  agentName: string;
  seq: number;
  startedAt: Date;
};
```

**Rationale**: We need to track the messageId/seq from `stream_start` so that when the first `stream_chunk` arrives, we can create the message with the correct id and seq. Keying by conversationId supports groups with multiple agents thinking simultaneously.

### 2. Event handling changes

| Event | Current behavior | New behavior |
|-------|-----------------|-------------|
| `stream_start` | Create message bubble (empty, status=streaming) | Add to `thinkingAgents`, do NOT create message |
| `stream_chunk` (first for messageId) | Append chunk to existing message | Create message with chunk content, remove from `thinkingAgents` |
| `stream_chunk` (subsequent) | Append chunk | Append chunk (unchanged) |
| `stream_end` | Mark completed | If message exists: mark completed. If only in thinkingAgents (no chunks ever came): remove from thinkingAgents, no bubble. |
| `stream_error` (no message exists) | Update empty bubble to error | Remove from `thinkingAgents`, no bubble created. Optionally show toast. |
| `stream_error` (message exists) | Update bubble with error | Update bubble with error (unchanged) |

### 3. TypingIndicator component placement

Place the `TypingIndicator` component at the bottom of the message list, above the input area. It reads from `thinkingAgents[activeConversationId]` and renders agent names.

**Rationale**: Putting it in the message list (not inside a message bubble) avoids scroll issues and keeps it visually distinct from actual messages.

### 4. Sidebar lastMessage handling

Currently `stream_start` updates `lastMessage` on the conversation for the sidebar preview. With the new approach, defer sidebar update to `stream_end` (when content is finalized). During thinking, the sidebar can show the existing lastMessage — no change needed for the thinking state.

## Risks / Trade-offs

- **[Risk] First chunk delay feels slow** → The typing indicator provides visual feedback that something is happening, comparable to current spinner UX.
- **[Risk] stream_end arrives without any chunks** → Handle gracefully: just remove from thinkingAgents, no ghost bubble. Backend already saved the message to DB, but frontend won't show an empty bubble.
- **[Risk] Timeout for stuck thinking agents** → Consider adding a client-side timeout (e.g., 60s) that removes agents from the indicator if no chunks arrive. Out of scope for initial implementation but worth noting.
