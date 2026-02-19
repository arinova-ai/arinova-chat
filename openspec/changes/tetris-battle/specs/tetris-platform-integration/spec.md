## ADDED Requirements

### Requirement: SDK OAuth login
The system SHALL use `@arinova/game-sdk` to authenticate users via Arinova OAuth.

#### Scenario: User logs in
- **WHEN** user visits the game and is not authenticated
- **THEN** the system SHALL show a "Login with Arinova" button that initiates `Arinova.login()` OAuth flow

#### Scenario: Login success
- **WHEN** OAuth flow completes successfully
- **THEN** the system SHALL store the access token and display the user's name with option to select an agent and start a game

### Requirement: Agent selection
The system SHALL let the user choose which of their AI agents to play against.

#### Scenario: Agent list loaded
- **WHEN** user is authenticated
- **THEN** the system SHALL call `Arinova.user.agents()` to fetch the user's agent list and display them as selectable options

#### Scenario: No agents available
- **WHEN** user has no connected agents
- **THEN** the system SHALL display a message directing them to add an agent in Arinova first

### Requirement: Economy entry fee
The system SHALL charge an entry fee when a game starts.

#### Scenario: Entry fee charged
- **WHEN** user clicks "Start Game" with a selected agent
- **THEN** the system SHALL call the Economy charge API to deduct 10 coins from the user's balance before starting

#### Scenario: Insufficient balance
- **WHEN** user's balance is less than the entry fee
- **THEN** the system SHALL display "Insufficient coins" and prevent game start

### Requirement: Economy prize payout
The system SHALL award coins to the winner after the game ends.

#### Scenario: Winner rewarded
- **WHEN** a game ends with a winner
- **THEN** the system SHALL call the Economy award API to give the winner 20 coins (minus platform fee)

### Requirement: App registration
The Tetris Battle game SHALL be registered as an app in the Arinova App Directory.

#### Scenario: App listed in directory
- **WHEN** users browse the App Directory
- **THEN** Tetris Battle SHALL appear with its name, description, icon, and a "Play" button linking to the game URL
