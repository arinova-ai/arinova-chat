## Why

Group conversations currently broadcast every user message to all agents, causing all agents to respond simultaneously. In a 5-agent group, every message triggers 5 responses — chaotic and unusable. Users need targeted control: @mention who you want, only they respond.

## What Changes

- Add `mention_only` boolean column to `conversations` table (default `true`)
- When `mention_only` is ON: server parses `@AgentName` from message content, matches against group members, dispatches only to mentioned agents
- When no `@mention` is found and `mention_only` is ON: nobody responds (silent)
- Support `@all` keyword to broadcast to all group members (equivalent to turning off mention_only for one message)
- When `mention_only` is OFF: broadcast to all agents (current behavior)
- Frontend: toggle in group conversation settings, dynamic chat input placeholder, `@all` option in MentionPopup
- Setting only applies to `type = 'group'` conversations; direct (1v1) always dispatches

## Capabilities

### New Capabilities
- `mention-only-routing`: Server-side mention parsing and selective agent dispatch for group conversations, including @all broadcast keyword

### Modified Capabilities
_(none — this extends group broadcast behavior without changing existing specs)_

## Impact

- **Database**: One new column on `conversations` table
- **Rust server**: `trigger_agent_response` in `ws/handler.rs` — add mention parsing + dispatch filtering logic
- **Frontend**: `chat-store.ts` (conversation settings), `chat-input.tsx` (placeholder), `mention-popup.tsx` (@all item), group settings UI
- **Agent SDK**: No changes — agents only receive tasks when dispatched to, transparent to them
