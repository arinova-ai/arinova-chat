## Why

Agents currently have no standalone SDK to connect to Arinova. The WebSocket client logic is buried inside the OpenClaw plugin (`packages/openclaw-plugin/src/ws-client.ts`), making it impossible for non-OpenClaw users to integrate. The auth flow also requires an unnecessary two-step process (pair endpoint → agentId → WS connect) when a single botToken should suffice.

## What Changes

- **Extract `@arinova-ai/agent-sdk` (TypeScript)**: Standalone npm package with `ArinovaAgent` class — connect, receive tasks, stream responses. One botToken, zero setup steps.
- **Create `arinova-agent` (Python)**: Python SDK with identical DX — `pip install arinova-agent`, same botToken-only auth.
- **Simplify agent auth to botToken-only**: **BREAKING** — WS `agent_auth` now accepts `botToken` instead of `agentId`. Server does DB lookup internally.
- **Remove `POST /api/agents/pair` endpoint**: **BREAKING** — No longer needed; botToken is the only credential.
- **Refactor OpenClaw plugin**: Replace embedded `ws-client.ts` and `auth.ts` with `@arinova-ai/agent-sdk` dependency.

## Capabilities

### New Capabilities
- `agent-sdk-ts`: TypeScript SDK package (`@arinova-ai/agent-sdk`) — WS client, botToken auth, task streaming, auto-reconnect
- `agent-sdk-python`: Python SDK package (`arinova-agent`) — asyncio WS client, botToken auth, task streaming, auto-reconnect
- `agent-auth-bottoken`: Simplified agent authentication — botToken as sole credential for WS auth, remove pair endpoint

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **Server**: `apps/server/src/ws/agent-handler.ts` — auth flow changes from agentId to botToken lookup
- **Server**: `apps/server/src/routes/agents.ts` — remove `/api/agents/pair` endpoint
- **Shared types**: `packages/shared/src/types/index.ts` + schemas — update `AgentWSClientEvent` auth event
- **OpenClaw plugin**: `packages/openclaw-plugin/` — replace ws-client.ts + auth.ts with SDK import
- **New packages**: `packages/agent-sdk/` (TS), `python/arinova-agent-sdk/` (Python)
- **npm publish**: `@arinova-ai/agent-sdk` (new package — need to confirm with user before publish)
- **PyPI publish**: `arinova-agent` (new package — need to confirm with user before publish)
