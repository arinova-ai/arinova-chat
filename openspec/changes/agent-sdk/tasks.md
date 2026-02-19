## 1. Server: botToken auth

- [x] 1.1 Update `AgentWSClientEvent` type in `packages/shared/src/types/index.ts`: change `agent_auth` from `{ agentId }` to `{ botToken }`
- [x] 1.2 Update `agentWSClientEventSchema` in `packages/shared/src/schemas/index.ts` to validate `botToken` field
- [x] 1.3 Update `agent-handler.ts` auth flow: look up agent by `secret_token` instead of `id`
- [x] 1.4 Remove `POST /api/agents/pair` endpoint from `apps/server/src/routes/agents.ts`
- [x] 1.5 Remove `pairingExchangeSchema` from shared schemas

## 2. TypeScript SDK package

- [x] 2.1 Create `packages/agent-sdk/` directory with `package.json` (`@arinova-ai/agent-sdk`), `tsconfig.json`
- [x] 2.2 Implement `ArinovaAgent` class in `src/client.ts` — extract and refactor from `openclaw-plugin/ws-client.ts`
- [x] 2.3 Create `src/types.ts` with public types (`ArinovaAgentOptions`, `TaskContext`, event types)
- [x] 2.4 Create `src/index.ts` re-exporting public API
- [x] 2.5 Add build script and verify `pnpm build` produces working dist

## 3. Python SDK package

- [x] 3.1 Create `python/arinova-agent-sdk/` with `pyproject.toml` (`arinova-agent`), `arinova_agent/__init__.py`
- [x] 3.2 Implement `ArinovaAgent` class in `arinova_agent/client.py` — asyncio + websockets
- [x] 3.3 Create `arinova_agent/types.py` with Task dataclass
- [x] 3.4 Verify with a simple test script that connects and receives tasks

## 4. Refactor OpenClaw plugin

- [x] 4.1 Add `@arinova-ai/agent-sdk` as dependency in `packages/openclaw-plugin/package.json`
- [x] 4.2 Replace `ws-client.ts` usage in `channel.ts` with `ArinovaAgent` from SDK
- [x] 4.3 Delete `packages/openclaw-plugin/src/ws-client.ts`
- [x] 4.4 Remove `exchangeBotToken()` from `auth.ts`, update channel.ts to use botToken directly (no pair step)
- [x] 4.5 Build and verify OpenClaw plugin works with the SDK

## 5. Integration test

- [x] 5.1 Start backend, connect agent via TS SDK with botToken, send a message from frontend, verify streaming works end-to-end
- [x] 5.2 Start OpenClaw gateway, verify plugin connects and responds via SDK
