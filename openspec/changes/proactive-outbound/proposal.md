## Why

Agents currently can only send messages as replies to user-initiated tasks (via the A2A SSE stream). The OpenClaw plugin's `sendMessage` function is a no-op that logs a warning. This blocks use cases like agent-to-agent mentions in groups (where a mentioned agent needs to proactively respond), scheduled messages, and agent-initiated notifications.

## What Changes

- Add a new `agent_send` WebSocket event type that agents can send to initiate a message in a conversation they belong to
- Rust server handles `agent_send`: validates the agent belongs to the conversation, creates the message in DB, streams it to the user, and optionally triggers mentioned agents
- Agent SDK adds a `sendMessage(conversationId, content)` method on the client
- OpenClaw plugin's `sendMessageArinovaChat` uses the SDK's new `sendMessage` instead of being a no-op

## Capabilities

### New Capabilities
- `agent-proactive-send`: Allow agents to send messages to conversations they belong to, outside of a task reply context. Covers the WS event, server handling, SDK method, and plugin integration.

### Modified Capabilities

## Impact

- `apps/rust-server/src/ws/agent_handler.rs` — handle new `agent_send` event
- `apps/rust-server/src/ws/handler.rs` — reuse message creation + user notification logic
- `packages/agent-sdk/src/client.ts` — add `sendMessage` method
- `packages/agent-sdk/src/types.ts` — add types for proactive send
- `packages/openclaw-plugin/src/send.ts` — replace no-op with actual SDK call
- `apps/web/src/store/chat-store.ts` — may need to handle a new event type for non-streamed messages (or reuse existing `stream_start`/`stream_end` flow)
