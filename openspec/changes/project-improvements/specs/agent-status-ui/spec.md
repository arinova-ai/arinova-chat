## ADDED Requirements

### Requirement: Agent online status badge
The chat header SHALL display an online/offline status badge for the agent based on health check results.

#### Scenario: Agent online
- **WHEN** user opens a conversation and the agent's A2A endpoint responds to health check
- **THEN** a green dot badge appears next to the agent name in the chat header

#### Scenario: Agent offline
- **WHEN** user opens a conversation and the agent's A2A endpoint is unreachable
- **THEN** a gray dot badge appears next to the agent name with "Offline" tooltip

#### Scenario: Status updates in real-time
- **WHEN** agent status changes while user has the conversation open
- **THEN** the badge updates within 30 seconds without page refresh
