## Why

The Node.js/Fastify server works well at current scale, but with anticipated growth to 10K+ concurrent users the memory and CPU cost on Railway becomes significant. Rust provides 5-10x better resource efficiency per WebSocket connection (~5KB vs ~50KB RAM), dramatically reducing hosting costs while improving tail latency for streaming workloads. The server is ~6,600 lines of TypeScript — small enough for a clean rewrite rather than incremental migration.

## What Changes

- **BREAKING**: Replace entire `apps/server/` with a Rust application using Axum + SQLx + tokio
- Reimplement all REST API endpoints with identical request/response contracts
- Reimplement WebSocket handlers (client + agent) with identical message protocol
- Replace Better Auth with custom auth: argon2 password hashing, manual session management, Google/GitHub OAuth flows
- Replace Drizzle ORM with SQLx (compile-time checked queries, same PostgreSQL)
- Replace ioredis with `redis` crate (same Redis protocol)
- Reimplement R2 uploads using `aws-sdk-s3` Rust crate
- Reimplement Web Push using `web-push` Rust crate or manual VAPID signing
- Keep existing database schema, migrations, and all client-facing contracts unchanged
- Frontend (`apps/web/`) unchanged — same API surface, same WS protocol

## Capabilities

### New Capabilities

- `rust-server-core`: Axum server setup, routing, middleware, CORS, rate limiting, error handling, health check
- `rust-auth`: Custom authentication — password hashing (argon2), session management, Google/GitHub OAuth, auth middleware
- `rust-database`: SQLx connection pool, query layer for all tables, Redis client
- `rust-websocket`: Client WebSocket handler (streaming, sync, heartbeat) and Agent WebSocket handler (auth, task dispatch, chunk forwarding)
- `rust-api-routes`: All REST endpoints — agents, conversations, messages, groups, reactions, uploads, push, notifications, sandbox
- `rust-streaming`: Agent response streaming pipeline — task queuing, chunk forwarding, Redis accumulation, reconnection recovery
- `rust-file-uploads`: Multipart upload handling, file validation, R2/local storage
- `rust-push-notifications`: Web Push delivery, subscription management, preference checking, quiet hours

### Modified Capabilities

(none — all client-facing behavior stays identical, only the implementation language changes)

## Impact

- `apps/server/` — complete rewrite from TypeScript to Rust
- `Cargo.toml` + Rust workspace configuration needed at `apps/server/`
- `Dockerfile` for server changes from Node.js to Rust binary
- Railway build configuration changes (Rust build)
- Existing database schema and migrations stay as-is (SQLx uses raw SQL, compatible with Drizzle migrations)
- All client SDKs (`@arinova-ai/agent-sdk`, `arinova-agent-sdk` Python) unchanged — same WS protocol
- Frontend unchanged — same REST + WS API surface
