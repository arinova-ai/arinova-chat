## Context

Agents connect to Arinova via WebSocket using a pull model (agent connects out to backend). The WS client logic currently lives inside `packages/openclaw-plugin/src/ws-client.ts` with auth handled in `auth.ts`. The auth requires a two-step process: exchange botToken for agentId via REST, then use agentId for WS auth. This makes direct integration impossible without OpenClaw.

## Goals / Non-Goals

**Goals:**
- Standalone TypeScript SDK (`@arinova-ai/agent-sdk`) that any Node.js/Bun/Deno agent can use
- Standalone Python SDK (`arinova-agent`) with identical DX for the Python AI ecosystem
- Single-credential auth: botToken is the only thing needed to connect
- OpenClaw plugin refactored to depend on the TS SDK (no code duplication)

**Non-Goals:**
- LLM integration helpers (user handles their own model calls)
- Conversation history retrieval (SDK is for real-time task handling only)
- Agent CRUD management (that's the dashboard's job)
- SDKs for other languages (Rust, Go, etc.) — can be added later

## Decisions

### 1. Auth: botToken directly on WS, remove pair endpoint

**Decision**: `agent_auth` event sends `{ type: "agent_auth", botToken: "ari_xxx" }` instead of `{ agentId }`. Server does `SELECT ... WHERE secret_token = ?` during WS auth.

**Why**: Eliminates the pair REST call entirely. One credential, zero setup steps. The pair endpoint existed only to translate botToken → agentId, which the server can do internally.

**What changes**:
- `AgentWSClientEvent` auth event: `agentId` → `botToken`
- `agent-handler.ts`: look up agent by `secret_token` instead of `id`
- Remove `POST /api/agents/pair` route
- Remove `exchangeBotToken()` from openclaw plugin
- Remove `pairingExchangeSchema` from shared schemas

### 2. SDK package structure

**Decision**: `packages/agent-sdk/` as a new workspace package, published as `@arinova-ai/agent-sdk`.

```
packages/agent-sdk/
├── src/
│   ├── index.ts          # Re-exports public API
│   ├── client.ts         # ArinovaAgent class
│   └── types.ts          # Public types (Task, AgentOptions, etc.)
├── package.json
├── tsconfig.json
└── README.md
```

**Why**: Monorepo workspace package keeps build tooling consistent. Extracted from `ws-client.ts` with a cleaner class-based API.

### 3. TypeScript SDK API: class-based with event emitter

**Decision**: `ArinovaAgent` class with `onTask()` handler and event emitter for lifecycle.

```typescript
const agent = new ArinovaAgent({
  serverUrl: "wss://chat.arinova.ai",
  botToken: "ari_xxxx",
});
agent.onTask(async ({ content, sendChunk, sendComplete }) => { ... });
await agent.connect();
```

**Why over functional `createWSClient()`**: Class-based API is more intuitive for SDK consumers. `onTask` as a method (not constructor option) is cleaner and allows re-assignment. `connect()` returns a Promise that resolves on first successful auth (so you know it's working).

### 4. Python SDK: asyncio with decorator pattern

**Decision**: Python SDK uses `asyncio` + `websockets` library.

```python
agent = ArinovaAgent(server_url="wss://chat.arinova.ai", bot_token="ari_xxxx")

@agent.on_task
async def handle(task):
    task.send_chunk("...")
    task.send_complete("full response")

agent.run()  # blocking, runs event loop
```

**Why**: asyncio is standard for Python WS. Decorator pattern is idiomatic Python. `agent.run()` as blocking call is simpler for most use cases; advanced users can `await agent.connect()` inside their own event loop.

### 5. Python SDK location: separate directory

**Decision**: `python/arinova-agent-sdk/` at repo root (not inside `packages/`).

**Why**: Python has its own tooling (pyproject.toml, pip, etc.) that doesn't fit in the Node.js monorepo workspace. Separate directory avoids turborepo confusion.

### 6. OpenClaw plugin refactor

**Decision**: Replace `ws-client.ts` with `import { ArinovaAgent } from "@arinova-ai/agent-sdk"`. Remove `exchangeBotToken()` from `auth.ts`.

**What changes in OpenClaw plugin**:
- `channel.ts`: use `ArinovaAgent` instead of `createWSClient()`
- `ws-client.ts`: delete entirely
- `auth.ts`: remove `exchangeBotToken()`, keep `authenticateWithArinova()` and `validateSession()` (those are for user auth, unrelated to agent SDK)

## Risks / Trade-offs

- **[Breaking change to agent WS protocol]** → No migration needed since not yet launched. OpenClaw plugin + SDK ship together.
- **[Python SDK maintenance burden]** → Keep it minimal (single file, ~150 lines). Match TS SDK behavior exactly so changes stay in sync.
- **[botToken in WS message is sent in plaintext]** → WS should always be `wss://` in production. botToken is equivalent to an API key — standard practice. Token can be regenerated if compromised.
