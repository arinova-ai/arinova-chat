## 1. Security — WebSocket Validation & Rate Limiting

- [x] 1.1 Add Zod schema for all WS incoming event types in `ws/handler.ts`, reject invalid payloads with error event
- [x] 1.2 Add max message size check (32KB) before JSON parsing in WS handler
- [x] 1.3 Replace in-memory WS rate limiting with Redis INCR + EXPIRE (key: `ws:rate:{userId}:{minute}`)
- [x] 1.4 Add fallback to in-memory rate limiting when Redis is unavailable

## 2. Security — Upload & Content

- [x] 2.1 Install `file-type` package and add magic number validation in `routes/uploads.ts`
- [x] 2.2 Add server-side message content sanitization before DB storage (strip dangerous HTML)

## 3. Performance — Database

- [x] 3.1 Create Drizzle migration adding indexes: `messages(conversationId)`, `messages(seq)`, `conversations(userId)`, `conversationReads(userId, conversationId)`
- [x] 3.2 Rewrite `loadConversations()` in `routes/conversations.ts` to use LEFT JOIN instead of N+1 queries
- [x] 3.3 Configure explicit PostgreSQL connection pool size and idle timeout in `db/index.ts`
- [x] 3.4 Change `enrichStreaming()` in `routes/messages.ts` to use Redis `mget()` for batch lookups

## 4. Error Handling & Resilience

- [x] 4.1 Create `ErrorBoundary` React component with fallback UI and retry button
- [x] 4.2 Wrap `ChatLayout` with `ErrorBoundary`
- [x] 4.3 Add visible connection status banner when WS disconnects/reconnects (verify `connection-banner.tsx` integration)
- [x] 4.4 Add error message display to login and register forms (inline validation + server error toast)

## 5. Infrastructure — Monitoring

- [x] 5.1 Upgrade health check endpoint to verify DB and Redis connectivity, return detailed status with 503 on failure
- [x] 5.2 Install and configure `@sentry/node` Fastify plugin on server with DSN from env
- [x] 5.3 Install and configure `@sentry/nextjs` on frontend with DSN from env
- [x] 5.4 Enable Pino structured JSON logging in Fastify with request correlation IDs
- [x] 5.5 Sanitize error responses — return generic messages to client, full details only in server logs

## 6. UX — Agent Status & Loading States

- [x] 6.1 Add agent online/offline status badge to chat header based on `agentHealth` data
- [x] 6.2 Add loading/disabled states to conversation actions (create, delete, pin, mute)
- [x] 6.3 Create empty state component with onboarding guide when user has no agents or conversations

## 7. UX — Search & API Consistency

- [x] 7.1 Add cursor-based pagination to search results API endpoint
- [x] 7.2 Add "Load more" / infinite scroll to search results UI
- [x] 7.3 Standardize all API error responses to `{ error, code?, details? }` format across all route files

## 8. Features — System Prompt & Typing Indicator

- [x] 8.1 Add system prompt textarea to agent settings/edit page in frontend
- [x] 8.2 Include system prompt in A2A request when sending messages to agent
- [x] 8.3 Add typing indicator WS event (`agent_typing`) sent when server begins A2A request
- [x] 8.4 Create typing indicator UI component (animated dots) displayed before streaming starts

## 9. Features — Conversation Export

- [x] 9.1 Add `GET /api/conversations/:id/export?format=md|json` endpoint on server
- [x] 9.2 Add "Export" option to conversation menu in frontend with format selection
- [x] 9.3 Implement client-side file download trigger for exported data

## 10. Features — Read Receipts

- [x] 10.1 Add read receipt tracking — update `conversationReads` on message view, expose via API/WS
- [x] 10.2 Display read status indicator (checkmarks) on sent user messages in chat UI

## 11. Features — Message Reactions

- [x] 11.1 Create `message_reactions` table in DB schema: `(id, messageId, userId, emoji, createdAt)`
- [x] 11.2 Add reaction API endpoints: `POST /api/messages/:id/reactions`, `DELETE /api/messages/:id/reactions/:emoji`
- [x] 11.3 Add WS events for reaction sync (`reaction_added`, `reaction_removed`)
- [x] 11.4 Create reaction picker UI component on message hover
- [x] 11.5 Display reaction badges below messages with counts

## 12. Performance — WS Delta Streaming

- [x] 12.1 Change Agent SDK `agent_chunk` to send only delta text (new characters) instead of full accumulated text
- [x] 12.2 Server accumulates full text in Redis, forwards only delta to client via `stream_chunk`
- [x] 12.3 Frontend changes `content = chunk` to `content += chunk` (append delta)
- [x] 12.4 On WS reconnect, send full accumulated text from Redis as initial sync before resuming deltas

## 13. Performance — Bundle Optimization

- [x] 13.1 Lazy-load `MarkdownContent` (with highlight.js) using `next/dynamic` so it's not in initial bundle
- [x] 13.2 Add `@next/bundle-analyzer` for bundle size monitoring
