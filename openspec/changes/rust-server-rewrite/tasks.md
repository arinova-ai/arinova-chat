## 1. Project Scaffolding

- [x] 1.1 Initialize Cargo project at `apps/rust-server/` with `Cargo.toml` — dependencies: axum, tokio, sqlx, serde, serde_json, redis, uuid, chrono, argon2, tower-http (cors, limit), reqwest, jsonwebtoken, p256, aws-sdk-s3, rand, dotenvy, tracing, tracing-subscriber
- [x] 1.2 Create `src/main.rs` with Axum server startup, tracing init, and graceful shutdown — listen on PORT env var (default 3501)
- [x] 1.3 Create `src/config.rs` — parse all environment variables with defaults (mirror current `env.ts`)

## 2. Database Layer

- [x] 2.1 Create `src/db/mod.rs` — SQLx PgPool setup (max 20 connections, 30s idle, 10s connect timeout)
- [x] 2.2 Create `src/db/models.rs` — Rust structs for all tables (User, Session, Account, Agent, Conversation, Message, ConversationRead, MessageReaction, Attachment, PushSubscription, NotificationPreference, Community, Channel, CommunityMember, ChannelMessage, DeveloperAccount, App, AppVersion, CoinBalance, CoinTransaction, AppPurchase, ConversationMember)
- [x] 2.3 Create `src/db/redis.rs` — Redis connection pool using `deadpool-redis`

## 3. Authentication

- [x] 3.1 Create `src/auth/password.rs` — argon2id hash and verify functions (compatible with Better Auth's format)
- [x] 3.2 Create `src/auth/session.rs` — session CRUD: create session (insert to `session` table + set cookie), validate session (lookup by token), delete session, auto-expire check (30 days)
- [x] 3.3 Create `src/auth/middleware.rs` — Axum extractor `AuthUser { id, email, name }` that reads session cookie and validates
- [x] 3.4 Create `src/auth/oauth.rs` — Google OAuth2 flow: authorization URL, callback handler, token exchange, user info fetch, account upsert
- [x] 3.5 Add GitHub OAuth2 flow to `src/auth/oauth.rs` — same pattern as Google
- [x] 3.6 Create `src/routes/auth.rs` — mount all auth endpoints under `/api/auth/*`: sign-up/email, sign-in/email, sign-out, get-session, Google/GitHub OAuth redirect+callback

## 4. Core REST API

- [x] 4.1 Create `src/routes/health.rs` — GET `/health` with DB + Redis health check
- [x] 4.2 Create `src/routes/agents.rs` — full agent CRUD: POST/GET/PUT/DELETE `/api/agents`, plus skills, regenerate-token, stats, history, export
- [x] 4.3 Create `src/routes/conversations.rs` — conversation CRUD: POST/GET/PUT/DELETE `/api/conversations`, plus read marking, mute toggle, status endpoint
- [x] 4.4 Create `src/routes/messages.rs` — GET messages with cursor-based pagination (before/after/around), DELETE single message, GET `/api/messages/search`
- [x] 4.5 Create `src/routes/groups.rs` — group conversation: create, list members, add/remove member
- [x] 4.6 Create `src/routes/reactions.rs` — POST/DELETE/GET reactions on messages

## 5. File Uploads

- [x] 5.1 Create `src/services/r2.rs` — R2 upload function using aws-sdk-s3 crate, with `is_r2_configured` check
- [x] 5.2 Create `src/routes/uploads.rs` — multipart upload handler with file type validation (magic numbers), size limit, R2/local storage, attachment record creation

## 6. WebSocket — Client Handler

- [x] 6.1 Create `src/ws/state.rs` — shared state: `DashMap<UserId, Vec<WsSender>>` for client connections, `DashMap<AgentId, WsSender>` for agent connections, stream state tracking, `isUserOnline`/`isUserForeground`/`sendToUser` functions
- [x] 6.2 Create `src/ws/handler.rs` — client WS handler at `/ws`: session auth on upgrade, `ping`/`pong` heartbeat, 45s idle timeout, message size limit (32KB)
- [x] 6.3 Implement `send_message` handling — save user message to DB with next seq, create pending agent message, send `stream_start`, dispatch task to agent
- [x] 6.4 Implement `sync` handling — return unread conversation states and pending events from Redis
- [x] 6.5 Implement `cancel_stream`, `mark_read`, `focus` handlers

## 7. WebSocket — Agent Handler

- [x] 7.1 Create `src/ws/agent_handler.rs` — agent WS at `/ws/agent`: auth with secret token (10s timeout), `auth_ok`/`auth_error` responses, skill declaration storage
- [x] 7.2 Implement `sendTaskToAgent` — dispatch task to connected agent with callbacks for chunk/complete/error
- [x] 7.3 Implement `agent_chunk` handling with accumulated-vs-delta auto-detection, `agent_complete`, `agent_error`

## 8. Streaming Pipeline

- [x] 8.1 Create `src/services/message_seq.rs` — `get_next_seq(conversation_id)` using MAX(seq)+1
- [x] 8.2 Implement Redis stream accumulation — store at `stream:{messageId}` with 600s TTL, used for reconnection recovery
- [x] 8.3 Implement per-conversation task queuing — only one active stream per conversation, queue subsequent messages
- [x] 8.4 Create `src/services/pending_events.rs` — Redis-backed offline event queue (24h TTL, max 1000 per user)

## 9. A2A Fallback

- [x] 9.1 Create `src/a2a/client.rs` — A2A SSE client for agents without WebSocket: send `tasks/sendSubscribe` JSON-RPC, parse SSE stream for working/completed states

## 10. Push Notifications

- [x] 10.1 Create `src/services/push.rs` — Web Push sending with VAPID authentication, expired subscription cleanup
- [x] 10.2 Create `src/services/push_trigger.rs` — notification eligibility: preference check, quiet hours, 30s dedup, conversation mute check
- [x] 10.3 Create `src/routes/push.rs` — GET vapid key, POST/DELETE subscribe
- [x] 10.4 Create `src/routes/notifications.rs` — GET/PUT notification preferences

## 11. Utilities

- [x] 11.1 Create `src/utils/pairing_code.rs` — `generate_secret_token()`: `ari_` + 48 hex chars
- [x] 11.2 Create `src/utils/agent_app_bridge.rs` — port AppSession, ControlMode, action-to-tool conversion, event formatting

## 12. Sandbox (Deferred)

- [x] 12.1 Create `src/routes/sandbox.rs` — return 501 Not Implemented with message indicating sandbox is temporarily unavailable (defer JS sandbox to later)

## 13. Router Assembly & Middleware

- [x] 13.1 Create `src/routes/mod.rs` — assemble all route groups into Axum router with CORS (tower-http), rate limiting, auth middleware layers
- [x] 13.2 Wire everything in `main.rs` — initialize DB pool, Redis pool, shared WS state, mount router, start server

## 14. Build & Deploy

- [x] 14.1 Create `Dockerfile` — multi-stage Rust build, minimal runtime image (debian-slim)
- [x] 14.2 Create `.env.example` with all environment variables documented
- [x] 14.3 Verify SQLx offline mode — N/A: using runtime queries (`sqlx::query`), not compile-time (`sqlx::query!`). No offline metadata needed.

## 15. Integration Verification

- [x] 15.1 Unit tests pass — auth, config, pairing code, WS state, sanitization (13 tests including scrypt)
- [x] 15.2 Test auth compatibility — verified: user created by TS Better Auth (scrypt) can log in via Rust server
- [ ] 15.3 Test WebSocket protocol — verify frontend connects and can send/receive messages with streaming
- [ ] 15.4 Test agent SDK compatibility — verify TS agent SDK connects, authenticates, receives tasks, and streams responses
