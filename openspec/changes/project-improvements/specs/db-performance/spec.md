## ADDED Requirements

### Requirement: Database indexes on frequently queried columns
The database SHALL have indexes on: `messages.conversationId`, `messages.seq`, `conversations.userId`, and `conversationReads(userId, conversationId)` composite index.

#### Scenario: Message query uses index
- **WHEN** querying messages by conversationId with ordering by seq
- **THEN** query uses index scan instead of sequential scan

### Requirement: Conversation listing uses JOIN instead of N+1
The `loadConversations` query SHALL use LEFT JOIN to fetch agent info, last message, and member count in a single query instead of separate queries per conversation.

#### Scenario: Loading 50 conversations
- **WHEN** user has 50 conversations and loads the conversation list
- **THEN** server executes at most 3 queries total (not 150+)

### Requirement: Connection pool configuration
The PostgreSQL connection pool SHALL be explicitly configured with appropriate pool size and timeout settings.

#### Scenario: Pool size configured
- **WHEN** server starts
- **THEN** connection pool is created with explicit max connections (e.g., 20) and idle timeout
