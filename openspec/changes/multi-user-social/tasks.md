## 1. Database Schema & Migrations

- [x] 1.1 Add `username` column (nullable) to `user` table via SQLx migration
- [x] 1.2 Create `friendships` table (id, requester_id, addressee_id, status, created_at, updated_at) with UNIQUE(requester_id, addressee_id)
- [x] 1.3 Create `conversation_user_members` table (id, conversation_id, user_id, role, joined_at)
- [x] 1.4 Add `owner_user_id` and `listen_mode` columns to `conversation_members` table
- [x] 1.5 Create `agent_listen_allowed_users` table (agent_id, conversation_id, user_id)
- [x] 1.6 Add `sender_user_id` column (nullable) to `messages` table
- [x] 1.7 Create `group_settings` table (conversation_id PK, history_visible, max_users, max_agents, invite_link, invite_enabled)
- [x] 1.8 Backfill existing users with generated usernames (`user_<short_id>`)
- [x] 1.9 Make `username` NOT NULL + UNIQUE index (case-insensitive)
- [x] 1.10 Backfill `conversation_members.owner_user_id` from `conversations.user_id`

## 2. Username System (API)

- [x] 2.1 Add username format validation utility (3-32 chars, lowercase a-z 0-9 underscore, starts with letter, no consecutive underscores)
- [x] 2.2 Create `POST /api/users/username` endpoint — set username (one-time, during registration)
- [x] 2.3 Create `GET /api/users/search?q=prefix` endpoint — search users by username prefix
- [x] 2.4 Add username to user session/auth response so frontend always has it
- [x] 2.5 Add middleware guard: reject all API calls (except username setup + auth) if user has no username set

### Tests

- [x] 2.6 Unit tests for username validation: valid formats, too short, invalid chars, starts with number, consecutive underscores
- [x] 2.7 Integration test: set username successfully, reject duplicate, reject change attempt (403)
- [x] 2.8 Integration test: search by prefix returns matches, empty for no matches

## 3. Friend System (API)

- [x] 3.1 Create `POST /api/friends/request` endpoint — send friend request by username
- [x] 3.2 Create `POST /api/friends/accept/:friendshipId` endpoint — accept friend request
- [x] 3.3 Create `POST /api/friends/reject/:friendshipId` endpoint — reject (delete) friend request
- [x] 3.4 Create `DELETE /api/friends/:userId` endpoint — remove friend
- [x] 3.5 Create `GET /api/friends` endpoint — list accepted friends (username, display name, avatar)
- [x] 3.6 Create `GET /api/friends/requests` endpoint — list pending incoming/outgoing requests

### Tests

- [x] 3.7 Integration test: full friend request flow — send, accept, verify both in friend list
- [x] 3.8 Integration test: reject friend request, verify deleted, can re-request
- [x] 3.9 Integration test: duplicate request rejected, self-request rejected
- [x] 3.10 Integration test: remove friend, verify removed from both users' lists
- [x] 3.11 Integration test: cannot send friend request to blocked user

## 4. Blocking (API)

- [x] 4.1 Create `POST /api/users/:userId/block` endpoint — block a user (replace any existing friendship)
- [x] 4.2 Create `DELETE /api/users/:userId/block` endpoint — unblock a user
- [x] 4.3 Create `GET /api/users/blocked` endpoint — list blocked users
- [x] 4.4 Add block check to friend request flow (cannot send request to/from blocked user)

### Tests

- [x] 4.5 Integration test: block user replaces existing friendship with blocked status
- [x] 4.6 Integration test: unblock removes block record, does not restore friendship
- [x] 4.7 Integration test: blocked user cannot send friend request
- [x] 4.8 Integration test: block prevents creating direct conversation

## 5. Multi-User Conversations (API)

- [x] 5.1 Update create conversation endpoint to support human-to-human direct (requires friendship check)
- [x] 5.2 Update create conversation to add creator to `conversation_user_members` as admin for groups
- [x] 5.3 Add `sender_user_id` to message creation for multi-user conversations
- [x] 5.4 Add duplicate direct conversation check (return existing if already exists)
- [x] 5.5 Create `GET /api/conversations/:id/members` endpoint — list user members and agent members

### Tests

- [x] 5.6 Integration test: create direct conversation with friend succeeds
- [x] 5.7 Integration test: create direct conversation with non-friend rejected
- [x] 5.8 Integration test: duplicate direct conversation returns existing
- [x] 5.9 Integration test: create group, verify creator is admin in conversation_user_members
- [x] 5.10 Integration test: user/agent limits enforced (50 users, 10 agents)
- [x] 5.11 Integration test: messages in multi-user conversation include sender_user_id

## 6. Group Admin System (API)

- [x] 6.1 Create `POST /api/groups/:id/invite-link` endpoint — generate/regenerate invite link
- [x] 6.2 Create `POST /api/groups/join/:inviteToken` endpoint — join group via invite link
- [x] 6.3 Create `POST /api/groups/:id/kick/:userId` endpoint — kick user (+ their agents)
- [x] 6.4 Create `PATCH /api/groups/:id/settings` endpoint — update group settings (admin only)
- [x] 6.5 Create `POST /api/groups/:id/promote/:userId` endpoint — promote to vice-admin
- [x] 6.6 Create `POST /api/groups/:id/demote/:userId` endpoint — demote vice-admin to member
- [x] 6.7 Create `POST /api/groups/:id/transfer-admin/:userId` endpoint — transfer admin role
- [x] 6.8 Add leave group logic (block admin from leaving without transfer)

### Tests

- [x] 6.9 Integration test: generate invite link, join via link (no friendship required)
- [x] 6.10 Integration test: regenerate invite link invalidates old link
- [x] 6.11 Integration test: kick user removes user + their agents from group
- [x] 6.12 Integration test: vice-admin can kick member, cannot kick admin or change settings
- [x] 6.13 Integration test: admin cannot leave without transferring admin role
- [x] 6.14 Integration test: transfer admin, then leave — new admin has full powers
- [x] 6.15 Integration test: disabled invites rejects join attempts

## 7. Agent Permissions (API)

- [x] 7.1 Update add-agent-to-conversation to set `owner_user_id` and default `listen_mode = 'owner_only'`
- [x] 7.2 Create `PATCH /api/conversations/:id/agents/:agentId/listen-mode` endpoint — owner can change listen mode
- [x] 7.3 Create `PUT /api/conversations/:id/agents/:agentId/allowed-users` endpoint — set allowed users list
- [x] 7.4 Update agent task dispatch to implement two-layer filtering (mention_only × listen_mode)
- [x] 7.5 Add `senderUserId` and `senderUsername` to agent task payload
- [x] 7.6 Add agent withdrawal endpoint — owner removes their own agent from a group

### Tests

- [x] 7.7 Unit test: two-layer filtering logic — mention_only=false delivers to all agents regardless of listen_mode
- [x] 7.8 Unit test: mention_only=true + owner_only — only owner's @mention triggers agent
- [x] 7.9 Unit test: mention_only=true + allowed_users — whitelisted user triggers, unlisted user doesn't
- [x] 7.10 Unit test: mention_only=true + all_mentions — any @mention triggers agent
- [x] 7.11 Integration test: only agent owner can change listen mode (non-owner gets 403)
- [x] 7.12 Integration test: agent withdrawal by owner succeeds, by non-owner rejected
- [x] 7.13 Integration test: task payload includes senderUserId and senderUsername

## 8. WebSocket Delivery

- [x] 8.1 Update `send_to_user_or_queue` to broadcast to all `conversation_user_members` for multi-user conversations
- [x] 8.2 Add server-side block filter: skip delivery to users who blocked the sender
- [x] 8.3 Add server-side block filter: skip delivery of blocked user's agent messages
- [x] 8.4 Cache conversation member lists in-memory (invalidate on member changes)

### Tests

- [x] 8.5 Integration test: message in multi-user group delivered to all online members
- [x] 8.6 Integration test: blocked user's messages not delivered to blocker
- [x] 8.7 Integration test: blocked user's agent messages not delivered to blocker
- [x] 8.8 Integration test: member list cache invalidated when member joins/leaves/kicked

## 9. Frontend — Username Setup

- [x] 9.1 Create username setup page (`/setup-username`)
- [x] 9.2 Add real-time validation (format + uniqueness check via API)
- [x] 9.3 Update AuthGuard to redirect to username setup if user has no username
- [x] 9.4 Display username in user profile/avatar areas

### Tests

- [x] 9.5 Component test: username setup page renders form, shows validation errors for invalid input
- [x] 9.6 Component test: AuthGuard redirects to `/setup-username` when user has no username

## 10. Frontend — Friend System

- [x] 10.1 Create user search component (search by username prefix)
- [x] 10.2 Create friend request dialog (send request from search results)
- [x] 10.3 Create friend list panel (sidebar or dedicated page)
- [x] 10.4 Create pending requests view (incoming with accept/reject, outgoing)
- [x] 10.5 Add "Start conversation" action from friend list
- [x] 10.6 Add friend request notifications (real-time via WebSocket)

### Tests

- [x] 10.7 Component test: user search displays results, handles empty state
- [x] 10.8 Component test: friend list renders friends with username, avatar, and actions
- [x] 10.9 Component test: pending requests view shows accept/reject buttons for incoming, cancel for outgoing

## 11. Frontend — Multi-User Groups

- [x] 11.1 Update create conversation dialog to support group creation (title, initial members)
- [x] 11.2 Create group member list panel (show users with roles, agents with owners)
- [x] 11.3 Display `sender_user_id` username/avatar on messages in multi-user conversations
- [x] 11.4 Create invite link UI (generate, copy, share)
- [x] 11.5 Create join-via-invite page
- [x] 11.6 Add group settings panel (admin only: name, history visibility, invite toggle)
- [x] 11.7 Add kick/promote/demote actions in member list
- [x] 11.8 Add agent listen mode display and controls (owner only can change)

### Tests

- [x] 11.9 Component test: group member list shows users with roles, agents with owner labels
- [x] 11.10 Component test: messages in multi-user conversation display sender username/avatar
- [x] 11.11 Component test: group settings panel only visible to admin, vice-admin sees limited view
- [x] 11.12 Component test: agent listen mode controls only shown to agent owner

## 12. Frontend — Blocking

- [x] 12.1 Add block/unblock action in user profile or conversation context
- [x] 12.2 Create blocked users list in settings
- [x] 12.3 Handle blocked message filtering on client side (hide from UI if any slip through)

### Tests

- [x] 12.4 Component test: block/unblock action toggles correctly
- [x] 12.5 Component test: blocked users list renders with unblock action
