## ADDED Requirements

### Requirement: mention_only conversation setting
The system SHALL store a `mention_only` boolean flag per conversation, defaulting to `true`. This flag SHALL only affect conversations with `type = 'group'`. Direct conversations SHALL always dispatch to the single agent regardless of this flag.

#### Scenario: New group conversation defaults to mention_only ON
- **WHEN** a new group conversation is created
- **THEN** the `mention_only` field SHALL be `true`

#### Scenario: User toggles mention_only OFF
- **WHEN** the user sets `mention_only` to `false` for a group conversation
- **THEN** all subsequent messages SHALL broadcast to all member agents

#### Scenario: Direct conversation ignores mention_only
- **WHEN** a user sends a message in a direct (1v1) conversation
- **THEN** the agent SHALL receive the task regardless of any `mention_only` value

### Requirement: Server-side @mention parsing for dispatch filtering
When `mention_only` is `true` for a group conversation, the server SHALL parse the message content for `@AgentName` patterns, match them case-insensitively against conversation member names, and dispatch tasks only to matched agents.

#### Scenario: Message mentions one agent
- **WHEN** user sends "Hey @Claude explain this" in a mention_only group containing agents Claude, GPT, Gemini
- **THEN** the server SHALL dispatch the task only to Claude

#### Scenario: Message mentions multiple agents
- **WHEN** user sends "@Claude @GPT what do you think?" in a mention_only group
- **THEN** the server SHALL dispatch tasks to both Claude and GPT, but not Gemini

#### Scenario: Message mentions no agent
- **WHEN** user sends "Hello everyone" in a mention_only group (no @mention)
- **THEN** the server SHALL dispatch to nobody; no agent receives a task

#### Scenario: Case-insensitive matching
- **WHEN** user sends "@claude help" and the agent's display name is "Claude"
- **THEN** the server SHALL match and dispatch to Claude

#### Scenario: mention_only is OFF — broadcast to all
- **WHEN** user sends any message in a group with `mention_only = false`
- **THEN** the server SHALL broadcast to all member agents (existing behavior)

### Requirement: @all keyword broadcasts to all members
The system SHALL recognize `@all` (case-insensitive) as a reserved keyword that triggers dispatch to all member agents, even when `mention_only` is `true`.

#### Scenario: @all dispatches to everyone
- **WHEN** user sends "@all what do you think?" in a mention_only group with 3 agents
- **THEN** the server SHALL dispatch the task to all 3 agents

#### Scenario: @all is case-insensitive
- **WHEN** user sends "@All or @ALL in a message"
- **THEN** the server SHALL treat it the same as `@all` and dispatch to all agents

### Requirement: Frontend mention_only toggle in group settings
The frontend SHALL provide a toggle in the group conversation settings to enable or disable `mention_only`. The toggle SHALL persist via the conversation update API.

#### Scenario: User toggles mention_only in settings
- **WHEN** user opens group settings and toggles mention_only OFF
- **THEN** the system SHALL update the conversation's `mention_only` field to `false` via API

### Requirement: Dynamic chat input placeholder
The chat input placeholder SHALL change based on the active conversation's `mention_only` setting to guide user behavior.

#### Scenario: mention_only group shows mention hint
- **WHEN** user is in a group conversation with `mention_only = true`
- **THEN** the chat input placeholder SHALL display "@mention an agent..."

#### Scenario: Non-mention_only shows default placeholder
- **WHEN** user is in a group with `mention_only = false` or a direct conversation
- **THEN** the chat input placeholder SHALL display "Type a message..."

### Requirement: @all in MentionPopup
The MentionPopup component SHALL include `@all` as the first item when the conversation has `mention_only = true`, allowing users to easily broadcast to all agents.

#### Scenario: MentionPopup shows @all first
- **WHEN** user types "@" in a mention_only group conversation
- **THEN** the MentionPopup SHALL show "@all" as the first item, followed by individual agent members

#### Scenario: MentionPopup omits @all when mention_only is OFF
- **WHEN** user types "@" in a group with `mention_only = false`
- **THEN** the MentionPopup SHALL NOT show "@all" (all agents already receive every message)
