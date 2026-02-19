## Why

Frontend slash commands (`platform-commands.ts`) duplicate functionality already available via UI buttons (New Chat, Stop, Settings, Search, etc.). Meanwhile, agent skill declaration relies on A2A card HTTP endpoints, forcing SDK agents to run a separate HTTP server just to serve a static JSON. This creates unnecessary complexity for agent developers and a confusing dual-source for skills.

## What Changes

- **BREAKING**: Remove `platform-commands.ts` and all frontend-only slash commands (`/new`, `/clear`, `/stop`, `/settings`, `/search`, `/help`, `/status`, `/tts`, `/reset`, `/whoami`)
- **BREAKING**: Remove A2A card HTTP fetching for skill discovery (`GET /api/agents/:id/skills` no longer fetches from `a2aEndpoint`)
- Add `skills` field to WebSocket `agent_auth` message — agents declare their skills at connection time
- Server stores agent skills in memory/Redis on WS auth, clears on disconnect
- `GET /api/agents/:id/skills` reads from server memory/Redis instead of fetching A2A card
- Slash popup (`/` in chat input) only shows agent-declared skills, all forwarded to agent
- SDK (`@arinova-ai/agent-sdk`) adds `skills` option to `ArinovaAgentOptions`
- `a2aEndpoint` DB field retained but no longer used for skill discovery (legacy, optional)

## Capabilities

### New Capabilities
- `ws-skill-declaration`: Agents declare skills via WebSocket auth handshake; server stores and serves them to frontend

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **Frontend**: `platform-commands.ts` deleted; `chat-input.tsx` simplified (slash popup only shows agent skills); `executePlatformCommand` removed
- **Backend**: `agent-handler.ts` updated to parse skills from `agent_auth`; `routes/agents.ts` skill endpoint reads from memory/Redis; WS schema updated
- **SDK**: `@arinova-ai/agent-sdk` types and client updated with `skills` option
- **Shared**: WS event schemas updated (`agent_auth` gains `skills` field)
- **No DB migration needed** — `a2aEndpoint` stays, just unused for skill discovery
