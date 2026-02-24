## Context

Arinova Chat currently models all conversations as single-user: `conversations.user_id` is a single string, and `conversation_members` only tracks agents. Messages have `role: user | agent` with `sender_agent_id` but no `sender_user_id`. The WebSocket layer delivers messages only to one user per conversation.

To support multi-user social features, the data model, WebSocket delivery, API layer, and frontend all need changes. This is the largest architectural change since the initial build.

### Current Schema (relevant parts)

- `conversations`: `id, title, type (direct|group), user_id, agent_id, mention_only, ...`
- `conversation_members`: `id, conversation_id, agent_id, added_at` (agents only)
- `messages`: `id, conversation_id, seq, role (user|agent), content, status, sender_agent_id, reply_to_id, ...`
- `conversation_reads`: `id, user_id, conversation_id, last_read_seq, muted`
- `users`: `id, name, email, image, ...` (managed by Better Auth — `user` table)

## Goals / Non-Goals

**Goals:**
- Add username system (immutable, mandatory at registration)
- Add friend system (mutual consent, search by username)
- Support human-to-human direct conversations
- Support multi-user multi-agent group conversations
- Implement agent permission model (owner, listen modes, server-side filtering)
- Implement group admin system
- Implement blocking (bidirectional, includes agents)

**Non-Goals:**
- Agent-to-agent conversations without humans
- Cross-gateway agent federation
- Voice/video, E2E encryption
- Public group discovery
- Migrating existing direct conversations to new schema (keep backward compatible)

## Decisions

### D1: Username storage — add column to existing `user` table

Add `username` column to the Better Auth `user` table. Better Auth allows extra columns.

**Why not a separate table?** Every query that displays user info would need a join. Username is a core identity field — it belongs on the user row.

**Migration:** Add column as nullable first, backfill existing users with a generated username (e.g., `user_<short_id>`), then make NOT NULL + UNIQUE.

### D2: Friend system — `friendships` table with status enum

```
friendships:
  id          UUID PK
  requester_id  TEXT (user id)
  addressee_id  TEXT (user id)
  status        ENUM('pending', 'accepted', 'blocked')
  created_at    TIMESTAMP
  updated_at    TIMESTAMP

  UNIQUE(requester_id, addressee_id)
```

**Why single table with status?** A friend request, active friendship, and block are all states of the same relationship. One table with status enum avoids multiple tables and keeps queries simple.

**Block semantics:** When User A blocks User B, set status to `blocked` with `requester_id = A`. Both `A blocks B` and `B blocks A` can coexist as separate rows if needed, but a single block row is sufficient — the server checks both directions.

### D3: Multi-user conversations — `conversation_user_members` table

```
conversation_user_members:
  id                UUID PK
  conversation_id   UUID FK
  user_id           TEXT FK
  role              ENUM('admin', 'vice_admin', 'member')
  joined_at         TIMESTAMP
```

**Keep `conversations.user_id`** as the creator/owner for backward compatibility with existing direct conversations. New multi-user conversations also set `user_id` to the creator, but use `conversation_user_members` for the full member list.

**Why not merge with `conversation_members` (agents)?** Users and agents have different fields (role vs listen_mode, owner). Separate tables keep each clean.

### D4: Agent ownership and listen modes — extend `conversation_members`

```
conversation_members (extended):
  id                UUID PK
  conversation_id   UUID FK
  agent_id          UUID FK
  owner_user_id     TEXT FK        -- who brought this agent
  listen_mode       ENUM('owner_only', 'allowed_users', 'all_mentions')
  added_at          TIMESTAMP
```

Add `agent_listen_allowed_users` table for whitelist:
```
agent_listen_allowed_users:
  agent_id          UUID FK (conversation_members)
  conversation_id   UUID FK
  user_id           TEXT FK
```

### D5: Messages — add `sender_user_id`

```
messages (extended):
  sender_user_id  TEXT NULL  -- which user sent this (NULL for old messages)
```

In multi-user conversations, `role = 'user'` messages need to identify which user sent them. Existing single-user conversations leave this NULL (inferred from `conversations.user_id`).

### D6: Group settings — `group_settings` table

```
group_settings:
  conversation_id   UUID PK FK
  history_visible   BOOLEAN DEFAULT false
  max_users         INT DEFAULT 50
  max_agents        INT DEFAULT 10
  invite_link       TEXT UNIQUE NULL
  invite_enabled    BOOLEAN DEFAULT true
```

### D7: WebSocket delivery — broadcast to all user members

Currently `send_to_user_or_queue` sends to a single `user_id`. For multi-user conversations:
1. Query `conversation_user_members` for the conversation
2. Send to each user member (excluding blocked pairs)
3. Cache member lists in-memory (invalidate on member changes)

**Blocking filter:** Before sending a message to a user, check if the sender is blocked by that user. If blocked, skip delivery. This is a server-side filter — blocked messages are still stored in DB but not delivered.

### D8: Agent task dispatch — two-layer filtering (`mention_only` × `listen_mode`)

Agent message delivery uses two independent layers:

**Layer 1: `mention_only` (conversation-level, existing field)**
- `mention_only = false` → ALL messages are sent to ALL agents. `listen_mode` is ignored. This is the current 1v1 behavior and suitable for single-user multi-agent groups.
- `mention_only = true` → Only @mentions trigger agents. Proceed to Layer 2.

**Layer 2: `listen_mode` (per-agent, only evaluated when `mention_only = true`)**
1. Is the sender the agent's owner? → Always deliver
2. Is `listen_mode = allowed_users` and sender in whitelist? → Deliver
3. Is `listen_mode = all_mentions`? → Deliver
4. Otherwise → Don't send task to agent

**Defaults:**
- Existing 1v1 conversations: `mention_only = false` (unchanged)
- New multi-user groups: `mention_only = true` (safe default)
- Users can toggle `mention_only` in group settings (e.g., a personal multi-agent group can turn it off)

This avoids adding a per-agent `listen_all` mode. The "listen to everything" behavior is a group-level choice, not an agent-level one.

The task payload gains `senderUserId` and `senderUsername` fields so agents know who triggered them.

### D9: Invite links — random token, no expiry initially

Generate a random URL-safe token (e.g., `aB3kX9mP`). No expiry for v1. Admin can regenerate (invalidates old link) or disable invites.

### D10: Registration flow — username selection

After email/password registration, redirect to a username selection page. User cannot access the app until username is set. Validate format (3-32 chars, a-z 0-9 _, starts with letter) and uniqueness in real-time.

## Risks / Trade-offs

**[Risk] Blocking filter performance in large groups** → Cache block lists per user in Redis. Invalidate on block/unblock. For v1 with 50-user limit, querying DB per message is acceptable.

**[Risk] Backward compatibility with existing conversations** → Keep `conversations.user_id` and `conversations.agent_id` for existing direct chats. New code checks `conversation_user_members` first, falls back to `user_id`. Gradual migration.

**[Risk] Message delivery ordering in multi-user groups** → Each user has their own WebSocket connection. Messages are delivered asynchronously to each user. Seq numbers ensure ordering on the client side. No change needed.

**[Risk] Agent owner leaves group** → When an owner is kicked, their agents are kicked too (per proposal). When an owner voluntarily leaves, same rule applies — agents go with them.

**[Risk] Better Auth `user` table modification** → Better Auth allows additional columns. Adding `username` is safe. But we should not modify Better Auth's core columns.

## Migration Plan

1. Add new tables (`friendships`, `conversation_user_members`, `group_settings`, `agent_listen_allowed_users`) — non-breaking
2. Add columns (`user.username`, `conversation_members.owner_user_id`, `conversation_members.listen_mode`, `messages.sender_user_id`) — nullable first
3. Backfill existing users with generated usernames
4. Make `username` NOT NULL + UNIQUE
5. Backfill `conversation_members.owner_user_id` from `conversations.user_id`
6. Deploy new API endpoints alongside existing ones
7. Frontend: add username setup flow, friend system, multi-user group UI

## Open Questions

- Should existing single-user groups be auto-migrated to have the creator in `conversation_user_members`, or handled with fallback logic?
- Exact UI for agent listen mode visibility — badge on agent avatar? Tooltip? Settings panel?
- Push notification behavior for multi-user groups — notify all members? Respect mute per-user?
