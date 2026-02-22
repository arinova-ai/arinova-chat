## ADDED Requirements

### Requirement: Loading states for async operations
UI actions that trigger async operations (create/delete conversation, pin, mute) SHALL show a loading state and disable the action until complete.

#### Scenario: Delete conversation loading
- **WHEN** user clicks delete on a conversation
- **THEN** the delete button shows a spinner and is disabled until the operation completes

#### Scenario: Create conversation loading
- **WHEN** user starts a new conversation with an agent
- **THEN** a loading indicator appears until the conversation is created and ready

### Requirement: Empty state guidance for new users
When a user has no conversations or agents, the UI SHALL display an onboarding guide explaining how to get started.

#### Scenario: No agents added
- **WHEN** new user logs in with no agents configured
- **THEN** the main area shows a guide explaining how to add an agent with a CTA button

#### Scenario: No conversations
- **WHEN** user has agents but no conversations
- **THEN** the main area suggests starting a conversation with an available agent

### Requirement: Search results pagination
Search results SHALL support cursor-based pagination, loading more results as the user scrolls.

#### Scenario: Initial search
- **WHEN** user searches for a term matching 100+ messages
- **THEN** first 20 results are shown with a "Load more" option

#### Scenario: Load more results
- **WHEN** user scrolls to the bottom of search results or clicks "Load more"
- **THEN** next 20 results are appended
