## ADDED Requirements

### Requirement: Agent system prompt editor
The agent settings page SHALL include a text area for editing the agent's system prompt, with save functionality.

#### Scenario: Edit system prompt
- **WHEN** user navigates to agent settings and modifies the system prompt text
- **THEN** the changes are saved to the database when user clicks "Save"

#### Scenario: System prompt applied
- **WHEN** user sends a message to an agent with a custom system prompt configured
- **THEN** the system prompt is included in the A2A request to the agent

#### Scenario: Empty system prompt
- **WHEN** user clears the system prompt field and saves
- **THEN** no system prompt is sent with subsequent A2A requests
