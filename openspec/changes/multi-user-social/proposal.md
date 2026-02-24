# Multi-User Social: Human-to-Human + Multi-Agent Groups

## Problem

Arinova Chat is currently a single-user tool — each user talks to their own agents in isolation. Without human-to-human communication, there is no network effect and no natural user growth. The product risks becoming a replaceable single-player AI interface.

## Solution

Add multi-user support with a friend system, username-based discovery, and multi-user multi-agent group conversations. This transforms Arinova Chat from a solo AI tool into a social platform where humans and AI agents are equal participants.

## Scope

### Conversation Types

- **direct**: 1 user + 1 other (agent or human). Human-to-human direct requires friendship.
- **group**: N users (up to 50) + M agents (up to 10). Full management system with admins, invite links, and agent permission controls.

### Username System

- 3-32 characters, lowercase a-z 0-9 underscore, must start with letter
- Globally unique, set at registration, **cannot be changed**
- Mandatory — part of the registration flow
- Agents do not need usernames

### Friend System

- Mutual consent required (friend request → accept)
- Username search → view profile → send friend request
- Human-to-human direct conversations require friendship
- Delete friend: preserves conversation history but blocks new messages
- Block: deletes friendship + full bidirectional message hiding (including their agents' messages)

### Group Conversations

- **Invite link**: does not require friendship — anyone with the link can join
- **Non-friends in group**: can see each other's messages, can @mention, but cannot open direct conversations
- **History visibility**: group setting (on/off) — controls whether new members see messages from before they joined
- **User limit**: 50
- **Agent limit**: 10 per group

### Admin System

- Group creator = admin
- Admin can promote co-admins (vice-admins)
- Admin cannot leave group without first delegating admin to another member
- **Admin powers**: kick user/agent, change group settings (name, history visibility, invite permissions), promote/demote vice-admins
- **Vice-admin powers**: kick users, invite users (cannot change group settings)

### Agent Permission Model

- **Owner**: the user who created the agent. Permanent, non-transferable.
- **Cost**: all API calls are billed to the owner
- **Display**: shown as "Alice · ripple's agent" so everyone knows whose agent it is
- **Listen modes** (controlled by owner, visible to all group members):
  - `owner_only` (default) — only responds to owner's @mention
  - `allowed_users` — responds to owner + whitelisted users' @mentions
  - `all_mentions` — responds to any group member's @mention
  - `listen_all` — **not available** (current LLMs cannot handle high message volume)
- **Server-side filtering**: messages that don't match the listen mode are never sent to the agent. The agent doesn't know filtered messages exist.
- **Agent replies are always public** in groups
- **Frequency alert**: if an agent is @mentioned excessively, the owner receives a prompt suggesting `/agent mode owner_only`

### Kick/Removal Rules

- Kick a user → automatically removes all their agents from the group
- Admin can kick individual agents
- Agent owner can withdraw their own agent from any group

### Blocking

- Bidirectional full block
- In groups: blocked user's messages (and their agents' messages) are hidden
- Own agents won't receive blocked user's @mentions
- Blocked user's agents won't receive own @mentions

## Out of Scope (Future)

- Agent-to-agent direct conversations
- Cross-gateway agent federation
- Voice/video calls
- End-to-end encryption
- Public groups / group discovery
- Agent marketplace integration with groups
