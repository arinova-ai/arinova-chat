## 1. Rust Server — handle `agent_send`

- [x] 1.1 Add `agent_send` match arm in `agent_handler.rs`: extract `conversationId` and `content`, validate non-empty, look up agent membership (direct: `conversations.agent_id`, group: `conversation_members`), reject silently if not a member
- [x] 1.2 Create message in DB (`role='agent'`, `status='completed'`, `sender_agent_id`), get next seq, update `conversations.updated_at`
- [x] 1.3 Look up conversation `user_id`, send `stream_start` (with `senderAgentId`, `senderAgentName`) + `stream_end` (with `content`) to the user via `send_to_user_or_queue`

## 2. Agent SDK — add `sendMessage` method

- [x] 2.1 Add `sendMessage(conversationId: string, content: string): void` method to `ArinovaAgent` class in `client.ts` — sends `{ type: "agent_send", conversationId, content }` over WS. No-op if not connected.
- [x] 2.2 Export the method in types (`types.ts`) if needed

## 3. OpenClaw Plugin — wire up `sendMessage`

- [x] 3.1 Update `send.ts`: replace the `console.warn` no-op with actual SDK `sendMessage` call. Access the agent client instance from runtime, call `sendMessage(conversationId, text)`.
- [x] 3.2 Bump plugin version, build, publish (agent-sdk@0.0.10, openclaw-plugin@0.0.19)
