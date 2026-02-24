## Context

The current server is 42 TypeScript files (~6,600 lines) on Fastify v5, using Better Auth for authentication, Drizzle ORM for PostgreSQL, ioredis for Redis, and @fastify/websocket for real-time communication. It runs on Railway (container-based, pay-per-use). The frontend is on Vercel and communicates via REST + WebSocket. Agent SDKs (TS + Python) connect via a separate WS endpoint.

The rewrite must preserve all client-facing contracts: same REST API paths/payloads, same WebSocket message types, same database schema. The frontend and agent SDKs must work without changes.

## Goals / Non-Goals

**Goals:**
- 1:1 feature parity with existing Node.js server
- Same database schema — no migrations needed
- Same REST API surface (paths, methods, request/response shapes)
- Same WebSocket protocol (client + agent message types)
- 5-10x reduction in memory usage per connection
- Lower Railway hosting costs at scale
- Single static binary deployment

**Non-Goals:**
- Adding new features during rewrite
- Changing the database schema
- Changing the frontend
- Changing agent SDK protocol
- Rewriting migrations (keep Drizzle migrations, run separately)

## Decisions

### 1. Web Framework: Axum

**Choice**: Axum (tower-based, tokio runtime)

**Why over Actix-Web**: Axum is the ecosystem standard, better tower middleware compatibility, simpler API. Actix uses its own actor model which adds complexity without benefit here.

**Why over Warp**: Warp's filter-based API is harder to read for a codebase this size. Axum's router is more conventional.

### 2. Database: SQLx (raw queries)

**Choice**: SQLx with compile-time checked queries, no ORM.

**Why not SeaORM/Diesel**: The existing queries are straightforward (CRUD + a few JOINs). SQLx's `query_as!` macro gives compile-time safety with raw SQL — simpler than learning an ORM's query builder. Also avoids ORM abstraction mismatch since we need exact compatibility with existing Drizzle-generated schema.

**Migration strategy**: Keep existing Drizzle migration files. Run them with the existing Node.js `migrate.ts` or via `psql` directly. SQLx doesn't need to own migrations.

### 3. Auth: Custom implementation

**Choice**: Hand-rolled auth with established crates.

**Components**:
- `argon2` crate for password hashing (compatible with Better Auth's argon2 hashes)
- Manual session table management (read/write `session` table directly)
- Manual OAuth2 flows for Google and GitHub using `reqwest` + manual token exchange
- Cookie-based session tokens (same format as Better Auth)

**Why**: No Rust equivalent of Better Auth exists. The auth surface is small: email+password register/login, Google OAuth, GitHub OAuth, session validation. ~300-400 lines of Rust.

**Compatibility**: Better Auth uses argon2id for password hashing. The `argon2` Rust crate supports verifying argon2id hashes, so existing user passwords work without reset.

### 4. WebSocket: axum built-in + tokio-tungstenite

**Choice**: Axum's native WebSocket upgrade (based on tokio-tungstenite).

**Why**: No extra dependency needed. Axum has first-class WebSocket support. The handler pattern maps 1:1 from Fastify's ws handler.

**Connection management**: Use `DashMap<UserId, Vec<WsSender>>` for client connections and `DashMap<AgentId, WsSender>` for agent connections. Lock-free concurrent hash map for high throughput.

### 5. Redis: `redis` crate with connection pool

**Choice**: `redis` crate (async, tokio-compatible) with `deadpool-redis` for connection pooling.

**Why**: Standard Rust Redis client. Supports all commands used: GET/SET/DEL/EXPIRE, LPUSH/LRANGE/LTRIM (pending events), pub/sub if needed later.

### 6. File Uploads: `axum-multipart` + `aws-sdk-s3`

**Choice**: `axum::extract::Multipart` for parsing, `aws-sdk-s3` (official AWS SDK for Rust) for R2 uploads.

**Why**: Axum has built-in multipart support. AWS SDK for Rust works with R2 (S3-compatible). Local disk fallback is trivial with `tokio::fs`.

### 7. Push Notifications: manual VAPID

**Choice**: `web-push` Rust crate or manual VAPID JWT signing with `jsonwebtoken` + `p256` crates.

**Why**: The `web-push` crate exists but is less maintained. Manual VAPID is ~50 lines with the `p256` and `jsonwebtoken` crates, and gives full control.

### 8. Rate Limiting: tower middleware

**Choice**: `tower::limit` or custom middleware using `DashMap<IP, (count, timestamp)>`.

**Why**: Tower rate limiting is built into the Axum ecosystem. For the per-user WS rate limiting, a simple in-memory counter with sliding window (same as current implementation).

### 9. Error Tracking: Sentry

**Choice**: `sentry` Rust crate (official).

**Why**: Direct 1:1 replacement. Same DSN, same dashboard.

### 10. Project Structure

```
apps/server/
├── Cargo.toml
├── src/
│   ├── main.rs              # Server startup, router, middleware
│   ├── config.rs             # Environment variables (env → struct)
│   ├── auth/
│   │   ├── mod.rs            # Auth module
│   │   ├── password.rs       # Argon2 hash/verify
│   │   ├── session.rs        # Session CRUD
│   │   ├── oauth.rs          # Google + GitHub OAuth flows
│   │   └── middleware.rs     # requireAuth extractor
│   ├── db/
│   │   ├── mod.rs            # Pool setup
│   │   ├── models.rs         # Struct definitions matching tables
│   │   └── redis.rs          # Redis pool
│   ├── routes/
│   │   ├── mod.rs            # Router assembly
│   │   ├── health.rs
│   │   ├── agents.rs
│   │   ├── conversations.rs
│   │   ├── messages.rs
│   │   ├── groups.rs
│   │   ├── reactions.rs
│   │   ├── uploads.rs
│   │   ├── push.rs
│   │   ├── notifications.rs
│   │   └── sandbox.rs
│   ├── ws/
│   │   ├── mod.rs
│   │   ├── handler.rs        # Client WS
│   │   ├── agent_handler.rs  # Agent WS
│   │   └── state.rs          # Connection maps, stream state
│   ├── lib/
│   │   ├── message_seq.rs
│   │   ├── push.rs
│   │   ├── push_trigger.rs
│   │   ├── pending_events.rs
│   │   └── r2.rs
│   └── utils/
│       ├── pairing_code.rs
│       └── agent_app_bridge.rs
├── Dockerfile
└── .env.example
```

## Risks / Trade-offs

- **[Risk] Better Auth session compatibility** → Verify argon2id hash format matches between Better Auth (JS) and argon2 (Rust). Test with existing user credentials before deploying. Mitigation: write a compatibility test first.
- **[Risk] OAuth flow differences** → Better Auth abstracts OAuth. Manual implementation must handle same callback URLs, token exchange, and account table format. Mitigation: trace current Better Auth OAuth flow to document exact DB writes.
- **[Risk] Build time on Railway** → Rust compilation is slow. First build ~5-10 min, cached ~1-2 min. Mitigation: use Docker layer caching (`cargo chef` pattern) to cache dependencies.
- **[Risk] Sandbox execution** → Current sandbox uses Node.js VM. No direct Rust equivalent. Mitigation: Either embed Deno/V8 via `deno_core` crate, use Wasmtime for WASM sandbox, or keep a tiny Node.js sidecar just for sandbox. Simplest: skip sandbox in Rust MVP, add later.
- **[Risk] `rehype-sanitize` for HTML** → Used for content sanitization. Rust has `ammonia` crate as equivalent. Verify same sanitization rules.
- **[Risk] Compile-time query checking** → SQLx compile-time checks require a live database connection during build. Mitigation: use `sqlx prepare` to generate offline query metadata, commit to repo.

## Migration Plan

1. Build Rust server with full feature parity on `rust-server` branch
2. Test against same database (dev environment)
3. Verify all REST endpoints match (same paths, same request/response shapes)
4. Verify WebSocket protocol compatibility with existing frontend + agent SDKs
5. Update Dockerfile from Node.js to Rust multi-stage build
6. Deploy to Railway staging, run integration tests
7. Cut over production — since DB schema is unchanged, it's a simple container swap
8. Rollback: revert to Node.js container image (no DB changes needed)

## Open Questions

- **Sandbox**: Keep Node.js sidecar for JS sandbox execution, or embed V8 in Rust, or defer sandbox feature? (Recommend: defer, low usage)
- **Drizzle migrations**: Continue using Node.js migration runner, or switch to SQLx migrations? (Recommend: keep Drizzle runner as separate utility)
