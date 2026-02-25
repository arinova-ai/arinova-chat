## 1. Store Changes

- [x] 1.1 Add `ThinkingAgent` type and `thinkingAgents` state to chat store (`apps/web/src/store/chat-store.ts`)
- [x] 1.2 Rewrite `stream_start` handler: add agent to `thinkingAgents` instead of creating message bubble
- [x] 1.3 Rewrite `stream_chunk` handler: on first chunk for a messageId, create message from `thinkingAgents` metadata + remove from indicator; subsequent chunks append as before
- [x] 1.4 Update `stream_end` handler: if messageId is in `thinkingAgents` (no chunks arrived), remove from indicator without creating bubble; otherwise finalize as before
- [x] 1.5 Update `stream_error` handler: if messageId is in `thinkingAgents`, remove from indicator without creating bubble; if message exists, update with error as before

## 2. TypingIndicator Component

- [x] 2.1 Create `TypingIndicator` component (`apps/web/src/components/chat/typing-indicator.tsx`) that reads `thinkingAgents[conversationId]` and renders "Agent1, Agent2 思考中..."
- [x] 2.2 Integrate `TypingIndicator` into the message list layout, positioned at the bottom of messages above the input area

## 3. Scroll & Sidebar

- [x] 3.1 Ensure scroll-to-bottom triggers when typing indicator appears and when first chunk creates a message
- [x] 3.2 Remove sidebar `lastMessage` update from `stream_start` — defer to `stream_end` only

## 4. Tests

- [x] 4.1 Update `chat-store.test.ts`: stream_start should add to thinkingAgents, not create message
- [x] 4.2 Update `chat-store.test.ts`: first stream_chunk should create message and remove from thinkingAgents
- [x] 4.3 Update `chat-store.test.ts`: stream_error/stream_end with no chunks should remove from thinkingAgents only
