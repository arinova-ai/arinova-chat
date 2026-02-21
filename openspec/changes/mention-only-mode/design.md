## Context

Group conversations broadcast every user message to all member agents via `trigger_agent_response` in `ws/handler.rs`. This was just implemented in the `mentions-reply-group-broadcast` change. The current flow: user sends message → server queries `conversation_members` → dispatches task to every agent → all agents respond simultaneously. This is noisy for groups with multiple agents.

The user wants a `mention_only` mode (default ON) where only @mentioned agents receive tasks. The `@all` keyword broadcasts to everyone.

## Goals / Non-Goals

**Goals:**
- Add per-conversation `mention_only` toggle for group conversations
- Server-side @mention parsing to filter agent dispatch targets
- `@all` keyword support for one-message broadcast
- Frontend toggle in group settings + dynamic input placeholder

**Non-Goals:**
- Per-agent mention_only settings (per-conversation is sufficient)
- Role-based @mentions (e.g., @moderators) — future scope
- Mention notifications / badges — @mentions are routing only, not notification triggers

## Decisions

### 1. mention_only column — on `conversations` table with default `true`

Add `mention_only BOOLEAN NOT NULL DEFAULT true` to `conversations`. Only checked for `type = 'group'`. Direct conversations ignore this flag.

**Why not a separate settings table?** Single boolean doesn't justify a new table. If we add more per-conversation settings later, we can extract then.

### 2. Mention parsing — server-side in `trigger_agent_response`

When `mention_only` is true for a group conversation:

1. Query conversation members (already done for broadcast)
2. Check for `@all` keyword in message content (case-insensitive)
3. If `@all` found → dispatch to all members (same as broadcast)
4. Otherwise, match `@AgentName` patterns against member names (case-insensitive)
5. If matches found → dispatch only to matched agents
6. If no matches → dispatch to nobody (silent, no error)

**Matching strategy:** Case-insensitive exact match against agent display names. For agent name "Claude", `@Claude` and `@claude` both match. For multi-word names like "My Agent", `@My Agent` matches. The frontend's MentionPopup already inserts the exact name, so exact matching is reliable.

**Why server-side, not agent-side?** The whole point of mention_only is to avoid dispatching to agents that weren't mentioned. If we dispatch to all and let agents decide, we still waste resources and agents need to implement filtering logic.

### 3. @all keyword — treated as a special mention

`@all` is a reserved keyword that expands to "all members". It's handled before individual @mention parsing. It appears in the MentionPopup as the first item.

Not stored as a conversation member — purely a parsing convention.

### 4. Frontend — minimal touchpoints

- **Group settings**: Toggle switch for mention_only with label explanation
- **Chat input placeholder**: When mention_only is ON → `@提及 agent 來對話...` / `@mention an agent...`; when OFF → `輸入訊息...` / `Type a message...`
- **MentionPopup**: Add `@all` as first item (only when mention_only is ON)
- **Conversation API**: Include `mention_only` in conversation response

### 5. Drizzle schema — add column, keep TypeScript schema in sync

Even though the Rust server is the active backend, the Drizzle schema in `apps/server/src/db/schema.ts` should stay in sync for type generation.

## Risks / Trade-offs

- **Agent name collisions** → Two agents with similar names could cause wrong dispatch. Mitigation: Exact match, not fuzzy. Frontend ensures exact names via autocomplete.
- **Changing agent names** → If an agent is renamed, past @mentions in message history won't match the new name. Mitigation: Acceptable for MVP. @mentions in old messages are historical text, not active routing.
- **No @mention = silence** → Users might be confused when nobody responds. Mitigation: Change input placeholder to guide behavior. Could add a subtle system hint in future.
