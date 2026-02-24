## ADDED Requirements

### Requirement: Agent CRUD endpoints
All agent endpoints SHALL match the existing REST API surface exactly.

#### Scenario: Create agent
- **WHEN** POST `/api/agents` is called with name and a2aEndpoint
- **THEN** the server SHALL create the agent and return it with a generated secret token

#### Scenario: List agents
- **WHEN** GET `/api/agents` is called by an authenticated user
- **THEN** the server SHALL return all agents owned by that user

#### Scenario: Delete agent
- **WHEN** DELETE `/api/agents/:id` is called
- **THEN** the server SHALL delete the agent and all associated conversations/messages

### Requirement: Conversation endpoints
All conversation endpoints SHALL match the existing REST API surface.

#### Scenario: Create conversation
- **WHEN** POST `/api/conversations` is called with an agentId
- **THEN** the server SHALL create a direct conversation and return it

#### Scenario: List conversations with search
- **WHEN** GET `/api/conversations?q=search` is called
- **THEN** the server SHALL return conversations matching the search term with last message preview

#### Scenario: Pin/unpin conversation
- **WHEN** PUT `/api/conversations/:id` is called with pinnedAt
- **THEN** the server SHALL update the pin status

### Requirement: Message endpoints
All message endpoints SHALL match the existing REST API surface including cursor-based pagination.

#### Scenario: Cursor-based pagination
- **WHEN** GET `/api/conversations/:id/messages?before=id&limit=50` is called
- **THEN** the server SHALL return messages before the cursor, enriched with attachment data and Redis streaming content

#### Scenario: Message search
- **WHEN** GET `/api/messages/search?q=term` is called
- **THEN** the server SHALL search across all user's conversations

### Requirement: Group conversation endpoints
Group CRUD and member management SHALL match existing API surface.

#### Scenario: Create group
- **WHEN** POST `/api/conversations/group` is called with agent IDs
- **THEN** the server SHALL create a group conversation with specified agents

### Requirement: Reaction endpoints
Emoji reaction CRUD SHALL match existing API surface.

#### Scenario: Add reaction
- **WHEN** POST `/api/messages/:id/reactions` is called with an emoji
- **THEN** the server SHALL add the reaction (upsert, no duplicates)

### Requirement: Upload endpoints
File upload and attachment endpoints SHALL match existing API surface.

#### Scenario: Upload file
- **WHEN** POST `/api/conversations/:id/upload` is called with a multipart file
- **THEN** the server SHALL validate, store (R2 or local), create message with attachment, and trigger agent response

### Requirement: Push and notification endpoints
Push subscription and notification preference endpoints SHALL match existing API surface.

#### Scenario: Subscribe to push
- **WHEN** POST `/api/push/subscribe` is called with push subscription data
- **THEN** the server SHALL upsert the subscription

#### Scenario: Update notification preferences
- **WHEN** PUT `/api/notifications/preferences` is called
- **THEN** the server SHALL update per-type toggles and quiet hours
