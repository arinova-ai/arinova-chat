## Why

When an AI agent disconnects or fails between `stream_start` and the first `stream_chunk`, the frontend shows a permanently stuck empty message bubble (ghost message). This is a recurring edge case that's hard to fix exhaustively on the backend. By adopting Slack's typing indicator pattern — showing "Ron is thinking..." at the bottom of the chat instead of creating a message bubble on `stream_start` — we eliminate the entire class of ghost message bugs. Message bubbles are only created when real content arrives.

## What Changes

- **`stream_start` no longer creates a message bubble**. Instead, it adds the agent to a typing indicator bar displayed at the bottom of the message list.
- **First `stream_chunk` creates the message bubble** and removes the agent from the typing indicator.
- **Multiple agents thinking** (group chats) show combined names: "Ron, Alice 思考中..."
- **`stream_error` before any chunks** simply removes the typing indicator (+ optional toast), no ghost bubble.
- **`stream_error` after chunks** shows error on the existing message bubble (unchanged behavior).
- Store gains a new `thinkingAgents` state: `Record<conversationId, ThinkingAgent[]>` tracking agents between `stream_start` and first chunk.

## Capabilities

### New Capabilities
- `typing-indicator`: Slack-style typing indicator bar at bottom of chat, tracking thinking agents per conversation

### Modified Capabilities

## Impact

- **`apps/web/src/store/chat-store.ts`**: `handleWSEvent` logic for `stream_start`, `stream_chunk`, `stream_error` changes significantly
- **`apps/web/src/components/chat/`**: New `TypingIndicator` component, integration into message list layout
- **Backend**: No changes needed — same WebSocket events, just different frontend interpretation
- **Tests**: `chat-store.test.ts` needs updating for new stream_start/chunk behavior
