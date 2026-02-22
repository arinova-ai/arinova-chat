## ADDED Requirements

### Requirement: Conversation export
Users SHALL be able to export a conversation's message history in Markdown and JSON formats.

#### Scenario: Export as Markdown
- **WHEN** user selects "Export" from the conversation menu and chooses Markdown format
- **THEN** a `.md` file is downloaded containing all messages with timestamps and sender labels

#### Scenario: Export as JSON
- **WHEN** user selects "Export" and chooses JSON format
- **THEN** a `.json` file is downloaded containing the full message array with all metadata

#### Scenario: Large conversation export
- **WHEN** user exports a conversation with 1000+ messages
- **THEN** the export completes without timeout, fetching all messages server-side
