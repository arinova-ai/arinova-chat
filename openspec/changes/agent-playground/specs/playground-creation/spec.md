## ADDED Requirements

### Requirement: Conversation-driven playground creation
The system SHALL provide a creation flow where the user describes a playground concept in natural language, and a system agent generates a valid `PlaygroundDefinition`.

#### Scenario: User describes a playground
- **WHEN** user enters "我想要一個狼人殺遊戲，5-8 人玩" in the creation interface
- **THEN** the system agent SHALL generate a complete `PlaygroundDefinition` with werewolf rules, roles, phases, and win conditions

#### Scenario: Agent asks clarifying questions
- **WHEN** the user's description is ambiguous (e.g., "做一個遊戲")
- **THEN** the system agent SHALL ask follow-up questions to clarify rules, player count, and gameplay

### Requirement: Playground definition validation
The system SHALL validate the agent-generated `PlaygroundDefinition` against the JSON schema before saving.

#### Scenario: Valid definition passes
- **WHEN** the generated definition passes schema validation
- **THEN** the system SHALL show the user a preview and allow them to confirm or request changes

#### Scenario: Invalid definition rejected
- **WHEN** the generated definition fails schema validation
- **THEN** the system SHALL ask the agent to regenerate with specific error feedback

### Requirement: Playground creation specification document
The system SHALL provide a markdown specification document that defines the standard format and guidelines for AI agents to create playgrounds.

#### Scenario: Agent references creation spec
- **WHEN** a system agent is tasked with creating a playground
- **THEN** the agent's system prompt SHALL include the creation specification document to guide structured output

### Requirement: Playground preview before publish
The system SHALL allow the creator to preview the playground definition (roles, phases, rules) before publishing.

#### Scenario: User previews and confirms
- **WHEN** user reviews the generated playground definition and clicks "Publish"
- **THEN** the playground SHALL be saved and appear in the public playground list

#### Scenario: User requests changes
- **WHEN** user reviews the preview and says "把人數上限改成 10 人"
- **THEN** the system agent SHALL update the definition accordingly and show a new preview

### Requirement: Built-in playground templates
The system SHALL provide built-in playground templates (starting with Werewolf/狼人殺) that users can directly deploy without going through the creation flow.

#### Scenario: User deploys template
- **WHEN** user selects the "狼人殺" template from the template list
- **THEN** the system SHALL create a playground instance with the pre-defined werewolf definition

### Requirement: Playground ownership
The system SHALL assign ownership of a playground to the user who created it. Only the owner SHALL be able to delete the playground.

#### Scenario: Owner deletes playground
- **WHEN** the playground owner clicks "Delete"
- **THEN** the system SHALL remove the playground and all associated data

#### Scenario: Non-owner cannot delete
- **WHEN** a non-owner attempts to delete a playground
- **THEN** the system SHALL deny the request with a 403 error
