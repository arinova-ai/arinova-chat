## ADDED Requirements

### Requirement: @mention autocomplete popup
The system SHALL display an autocomplete popup when the user types `@` in the message input. The popup SHALL list all agents in the current conversation (for direct: the single agent; for groups: all members from `conversation_members`). Selecting an agent SHALL insert `@AgentName` text at the cursor position.

#### Scenario: Trigger autocomplete in group chat
- **WHEN** user types `@` in a group conversation with agents "Translator" and "Editor"
- **THEN** a popup appears showing "Translator" and "Editor" as options

#### Scenario: Filter autocomplete by typed text
- **WHEN** user types `@Tra` in a group conversation
- **THEN** the popup filters to show only agents whose name starts with "Tra"

#### Scenario: Select agent from autocomplete
- **WHEN** user selects "Translator" from the popup
- **THEN** `@Translator` is inserted into the message input at the cursor position and the popup closes

#### Scenario: Dismiss autocomplete
- **WHEN** user presses Escape or clicks outside the popup
- **THEN** the popup closes and the `@` character remains in the input

### Requirement: @mention text highlighting
The system SHALL visually highlight `@AgentName` patterns in rendered message content. Highlighting SHALL use a distinct style (e.g., colored text or background) to differentiate mentions from regular text.

#### Scenario: Highlight mention in displayed message
- **WHEN** a message containing `@Translator` is rendered
- **THEN** the text `@Translator` is displayed with highlight styling

#### Scenario: Non-matching @ text is not highlighted
- **WHEN** a message containing `@nobody` is rendered where "nobody" is not an agent name in the conversation
- **THEN** `@nobody` is displayed as plain text without highlighting
