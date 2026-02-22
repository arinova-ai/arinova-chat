## ADDED Requirements

### Requirement: Tetris board management
The system SHALL maintain a 10x20 grid board where tetrominoes fall and stack.

#### Scenario: New game starts
- **WHEN** a new game is initialized
- **THEN** the board SHALL be a 10-wide, 20-tall empty grid with no filled cells

#### Scenario: Piece locks on landing
- **WHEN** a falling piece can no longer move down
- **THEN** the piece's cells SHALL be written to the board and a new piece SHALL spawn at the top

### Requirement: Tetromino pieces
The system SHALL support all 7 standard tetrominoes (I, O, T, S, Z, J, L) with rotation.

#### Scenario: Piece generation
- **WHEN** a new piece is needed
- **THEN** the system SHALL use a bag-of-7 randomizer (shuffle all 7, deal sequentially, reshuffle when empty)

#### Scenario: Piece rotation
- **WHEN** player rotates a piece
- **THEN** the piece SHALL rotate 90 degrees clockwise, with wall-kick if the rotated position overlaps walls or filled cells

### Requirement: Collision detection
The system SHALL prevent pieces from moving into occupied cells or outside the board boundaries.

#### Scenario: Move blocked by wall
- **WHEN** player moves a piece left/right and the target position is outside the board
- **THEN** the move SHALL be ignored

#### Scenario: Move blocked by filled cell
- **WHEN** player moves a piece and the target position overlaps a filled cell
- **THEN** the move SHALL be ignored

### Requirement: Line clearing
The system SHALL clear completed rows and shift above rows down.

#### Scenario: Single line clear
- **WHEN** a row is completely filled after a piece locks
- **THEN** that row SHALL be removed and all rows above shift down by one

#### Scenario: Multi-line clear
- **WHEN** multiple rows are completed simultaneously
- **THEN** all completed rows SHALL be removed and rows above shift down accordingly

### Requirement: Scoring
The system SHALL track score based on lines cleared and level.

#### Scenario: Score calculation
- **WHEN** lines are cleared
- **THEN** score SHALL increase: 1 line = 100×level, 2 lines = 300×level, 3 lines = 500×level, 4 lines = 800×level

#### Scenario: Level progression
- **WHEN** total lines cleared reaches level×10
- **THEN** level SHALL increase by 1 and drop speed SHALL increase

### Requirement: Battle attack system
The system SHALL send garbage lines to the opponent when clearing 2+ lines.

#### Scenario: Garbage lines sent
- **WHEN** player clears 2 lines → send 1, 3 lines → send 2, 4 lines → send 4 garbage lines to opponent
- **THEN** opponent's board SHALL receive garbage lines inserted from the bottom with one random gap per line

#### Scenario: Garbage lines received
- **WHEN** garbage lines are received
- **THEN** existing rows SHALL shift up and garbage rows (filled except one random column) SHALL be inserted at the bottom

### Requirement: Game over detection
The system SHALL detect when a player can no longer place new pieces.

#### Scenario: Board topped out
- **WHEN** a new piece spawns and overlaps filled cells
- **THEN** the game SHALL end for that player and the opponent wins

### Requirement: Hard drop and soft drop
The system SHALL support instant hard drop and accelerated soft drop.

#### Scenario: Hard drop
- **WHEN** player presses hard drop
- **THEN** the piece SHALL instantly move to the lowest valid position and lock

#### Scenario: Soft drop
- **WHEN** player holds soft drop
- **THEN** the piece SHALL fall at an accelerated speed (20× normal)
