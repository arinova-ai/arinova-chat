## ADDED Requirements

### Requirement: Health route tests
The system SHALL have integration tests for `GET /health` verifying it returns status OK.

#### Scenario: Health check succeeds
- **WHEN** sending GET /health
- **THEN** response is 200 with `{ status: "ok" }`

### Requirement: Agent CRUD route tests
The system SHALL have integration tests for all agent routes covering create, read, update, delete, token regeneration, stats, and history operations.

#### Scenario: Create agent
- **WHEN** POSTing to /api/agents with name and description
- **THEN** response is 200 with the created agent including a secretToken

#### Scenario: List user agents
- **WHEN** GETting /api/agents as an authenticated user
- **THEN** response contains only agents owned by that user

#### Scenario: Delete agent cascades
- **WHEN** DELETEing an agent that has conversations
- **THEN** the agent and all its conversations and messages are removed

#### Scenario: Unauthorized agent access
- **WHEN** GETting /api/agents/:id for an agent owned by another user
- **THEN** response is 404

### Requirement: Conversation route tests
The system SHALL have integration tests for conversation CRUD, search, pin, mute, read tracking, and message clearing.

#### Scenario: Create direct conversation
- **WHEN** POSTing to /api/conversations with an agent ID
- **THEN** a conversation is created linking the user and agent

#### Scenario: Search conversations
- **WHEN** GETting /api/conversations?q=searchterm
- **THEN** results include only conversations matching the search term

#### Scenario: Pin and unpin
- **WHEN** PUTting to /api/conversations/:id with `pinnedAt` set/unset
- **THEN** the conversation's pinned status is toggled

#### Scenario: Mark as read
- **WHEN** PUTting to /api/conversations/:id/read
- **THEN** the conversation_reads record is updated with the latest sequence

### Requirement: Message route tests
The system SHALL have integration tests for message listing (cursor-based pagination), search, and deletion.

#### Scenario: Cursor-based pagination
- **WHEN** GETting messages with `?before=<messageId>`
- **THEN** only messages before that ID are returned in descending order

#### Scenario: Around-based pagination
- **WHEN** GETting messages with `?around=<messageId>`
- **THEN** messages centered around that ID are returned

#### Scenario: Global message search
- **WHEN** GETting /api/messages/search?q=keyword
- **THEN** results include messages from all user conversations containing the keyword

### Requirement: Group conversation route tests
The system SHALL have integration tests for group creation, member management, and group-specific constraints.

#### Scenario: Create group
- **WHEN** POSTing to /api/conversations/group with multiple agent IDs
- **THEN** a group conversation is created with all agents as members

#### Scenario: Duplicate member rejected
- **WHEN** POSTing an agent that is already a group member
- **THEN** response is 409

### Requirement: Community route tests
The system SHALL have integration tests for community CRUD, membership, role management, channel operations, and ownership transfer.

#### Scenario: Create community with default channel
- **WHEN** POSTing to /api/communities with a name
- **THEN** a community is created with the user as owner and a "general" channel

#### Scenario: Owner cannot leave
- **WHEN** the owner attempts to leave the community
- **THEN** response is 400

#### Scenario: Role hierarchy enforcement
- **WHEN** an admin attempts to kick another admin
- **THEN** response is 403

### Requirement: Marketplace route tests
The system SHALL have integration tests for the agent marketplace (browse, add/clone, publish, unpublish) and app marketplace (list, detail).

#### Scenario: Browse public agents
- **WHEN** GETting /api/marketplace
- **THEN** only public agents are returned with pagination

#### Scenario: Clone public agent
- **WHEN** POSTing /api/marketplace/:id/add for a public agent
- **THEN** a copy is created in the user's agents and usageCount is incremented

### Requirement: Wallet route tests
The system SHALL have integration tests for balance, topup, purchase, and refund operations.

#### Scenario: Topup increases balance
- **WHEN** POSTing /api/wallet/topup with amount 100
- **THEN** the user's balance increases by 100

#### Scenario: Purchase with insufficient balance
- **WHEN** attempting a purchase with balance less than price
- **THEN** response is 400 with insufficient balance error

#### Scenario: Refund within 24 hours
- **WHEN** requesting a refund within 24 hours of purchase
- **THEN** balance is restored and purchase is marked as refunded

### Requirement: WebSocket client handler tests
The system SHALL have integration tests for the client WebSocket handler covering connection, authentication, message sending, streaming, sync, and rate limiting.

#### Scenario: Authenticated connection
- **WHEN** a client connects to /ws with a valid session cookie
- **THEN** the connection is accepted and kept alive

#### Scenario: Send message triggers agent response
- **WHEN** a client sends a `send_message` event
- **THEN** the server creates a user message and initiates agent response

#### Scenario: Rate limiting
- **WHEN** a client sends more than 10 messages per minute
- **THEN** subsequent messages are rejected with a rate limit error

### Requirement: WebSocket agent handler tests
The system SHALL have integration tests for the agent WebSocket handler covering agent authentication, task processing, and disconnection cleanup.

#### Scenario: Agent authenticates with secret token
- **WHEN** an agent connects and sends `agent_auth` with a valid token
- **THEN** the connection is authenticated and the agent is registered

#### Scenario: Auth timeout
- **WHEN** an agent connects but does not send `agent_auth` within 10 seconds
- **THEN** the connection is closed

#### Scenario: Agent disconnect cleans up tasks
- **WHEN** an authenticated agent disconnects with pending tasks
- **THEN** all pending tasks receive error callbacks
