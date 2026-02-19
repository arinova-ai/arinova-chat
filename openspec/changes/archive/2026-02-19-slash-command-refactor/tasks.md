## 1. Shared / Protocol

- [x] 1.1 Update WS event schemas in `packages/shared` — add optional `skills` array to `agent_auth` client event type
- [x] 1.2 Add `AgentSkill` type to `packages/shared/src/types` (id, name, description)

## 2. SDK

- [x] 2.1 Add optional `skills` field to `ArinovaAgentOptions` in `packages/agent-sdk/src/types.ts`
- [x] 2.2 Update `ArinovaAgent.doConnect()` in `packages/agent-sdk/src/client.ts` to include `skills` in `agent_auth` message

## 3. Backend

- [x] 3.1 Add in-memory `agentSkills` Map in `apps/server/src/ws/agent-handler.ts` — store skills on auth, clear on disconnect
- [x] 3.2 Export `getAgentSkills(agentId)` function from `agent-handler.ts`
- [x] 3.3 Update `GET /api/agents/:id/skills` in `apps/server/src/routes/agents.ts` to read from `getAgentSkills()` instead of fetching A2A card

## 4. Frontend

- [x] 4.1 Delete `apps/web/src/lib/platform-commands.ts`
- [x] 4.2 Refactor `apps/web/src/components/chat/chat-input.tsx` — remove all platform command imports, `executePlatformCommand`, and `tryExecuteSlashCommand`; slash popup only shows agent skills; all selections forward via `sendMessage()`
