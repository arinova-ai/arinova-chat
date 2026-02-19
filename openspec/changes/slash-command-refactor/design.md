## Context

Currently, slash commands have two sources:
1. **Platform commands** (`platform-commands.ts`) — hardcoded frontend operations (`/new`, `/stop`, `/clear`, etc.) that duplicate existing UI buttons
2. **Agent skills** — fetched via HTTP GET from agent's `a2aEndpoint` (A2A card), requiring agents to run a separate HTTP server

The agent SDK (`@arinova-ai/agent-sdk`) connects via WebSocket but has no mechanism to declare skills. Only A2A-card agents can advertise skills.

## Goals / Non-Goals

**Goals:**
- Single source for slash commands: agent-declared skills only
- Skills declared via WS `agent_auth` message — no HTTP server needed
- Remove all frontend-only platform commands
- Keep SDK simple: `skills` array in options

**Non-Goals:**
- Structured parameter definitions for skills (future enhancement)
- Removing `a2aEndpoint` DB column (keep for potential future use)
- Agent-to-agent communication (A2A protocol proper)

## Decisions

### 1. Skills storage: in-memory Map + Redis fallback

**Choice**: Store skills in an in-memory `Map<agentId, Skill[]>` within `agent-handler.ts`, same as `agentConnections`. Clear on disconnect.

**Why not Redis-only**: Skills are tightly coupled to WS connection state. Agent disconnects → skills gone. In-memory is simpler and avoids stale data. Redis could be added later for multi-instance deployments.

**Alternative considered**: Store in DB — rejected because skills are ephemeral (change per connection), not persistent data.

### 2. WS protocol change: extend `agent_auth`

**Choice**: Add optional `skills` array to the existing `agent_auth` event rather than a separate `declare_skills` event.

**Why**: Simpler protocol. Skills are static per session — declared once at connect. No need for dynamic updates mid-session.

**Alternative considered**: Separate `agent_skills` event after auth — rejected as unnecessary complexity. If we need dynamic skill updates later, we can add `update_skills` then.

### 3. Frontend: delete `platform-commands.ts` entirely

**Choice**: Remove the file and simplify `chat-input.tsx` to only show agent skills in the slash popup.

**Why**: Every operation in platform-commands has a UI button equivalent. The slash namespace belongs to agents.

### 4. SDK: `skills` in constructor options

**Choice**: Add `skills` to `ArinovaAgentOptions`, sent as part of `agent_auth`.

```typescript
new ArinovaAgent({
  serverUrl: "wss://...",
  botToken: "xxx",
  skills: [{ id: "draw", name: "Draw", description: "..." }],
});
```

**Why not `agent.skill("draw", handler)`**: That would couple skill declaration with routing, adding complexity. Keep it simple — agent devs handle routing in `onTask` based on `content`. SDK just declares metadata.

### 5. Skill endpoint: same API, different source

**Choice**: `GET /api/agents/:id/skills` stays but reads from server memory instead of fetching A2A card.

**Why**: Frontend code doesn't change its API call. Only the backend data source changes.

## Risks / Trade-offs

- **[Breaking change for A2A-only agents]** → Agents relying solely on A2A card for skill discovery will lose visibility. Mitigation: these agents are rare/nonexistent in our current ecosystem; `a2aEndpoint` field remains for future use.
- **[In-memory skills lost on server restart]** → Agents reconnect automatically (SDK has reconnect logic), re-declaring skills on reconnect. Acceptable for MVP.
- **[No parameter metadata]** → Slash popup can't show argument hints. Acceptable — agent can explain usage in the skill description string.
