## ADDED Requirements

### Requirement: Message emoji reactions
Users SHALL be able to add emoji reactions to any message. Each user can add one reaction per emoji per message.

#### Scenario: Add reaction
- **WHEN** user clicks the reaction button on a message and selects an emoji
- **THEN** the emoji reaction appears below the message with a count of 1

#### Scenario: Toggle reaction off
- **WHEN** user clicks their own existing reaction on a message
- **THEN** the reaction is removed; if no other users reacted with that emoji, the emoji disappears

#### Scenario: Multiple reactions
- **WHEN** multiple users react with different emojis on the same message
- **THEN** all unique emoji reactions are displayed below the message with respective counts

#### Scenario: Reaction persistence
- **WHEN** user refreshes the page
- **THEN** all reactions are preserved and displayed correctly
