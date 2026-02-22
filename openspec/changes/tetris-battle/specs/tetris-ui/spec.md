## ADDED Requirements

### Requirement: Dual board display
The system SHALL render two Tetris boards side by side — player on the left, AI opponent on the right.

#### Scenario: Board layout
- **WHEN** a game is in progress
- **THEN** the player's board SHALL be displayed at full size on the left, and the AI's board SHALL be displayed at 70% size on the right

### Requirement: Player board rendering
The system SHALL render the player's board using HTML5 Canvas with smooth animations.

#### Scenario: Piece falling animation
- **WHEN** a piece is actively falling
- **THEN** the piece SHALL render at 60fps with smooth downward movement and ghost piece preview showing the drop position

#### Scenario: Line clear animation
- **WHEN** lines are cleared
- **THEN** the cleared rows SHALL flash briefly before being removed

### Requirement: Keyboard controls
The system SHALL accept keyboard input for piece control.

#### Scenario: Control mapping
- **WHEN** the game is active
- **THEN** controls SHALL be: Arrow Left = move left, Arrow Right = move right, Arrow Up = rotate, Arrow Down = soft drop, Space = hard drop

### Requirement: Game info display
The system SHALL display score, level, lines cleared, and next piece preview.

#### Scenario: Info panel shown
- **WHEN** game is in progress
- **THEN** the system SHALL display: current score, level, total lines cleared, next piece preview, and garbage lines pending

### Requirement: Game over screen
The system SHALL display the game result when the match ends.

#### Scenario: Player wins
- **WHEN** the AI's board tops out
- **THEN** the system SHALL display "You Win!" with final scores for both players and an option to play again or return home

#### Scenario: Player loses
- **WHEN** the player's board tops out
- **THEN** the system SHALL display "You Lose!" with final scores and the same options

### Requirement: Game countdown
The system SHALL show a countdown before the game starts.

#### Scenario: Countdown display
- **WHEN** both boards are ready and the game is about to start
- **THEN** the system SHALL display a 3-2-1-GO countdown overlay before gameplay begins
