## ADDED Requirements

### Requirement: Dual currency system
The system SHALL support two currencies for playground: **Play Coins** (free, system-issued) and **Arinova Coins** (paid, user-purchased). Playground creators define which currency their playground uses.

#### Scenario: Free playground with Play Coins
- **WHEN** a playground defines `currency: "play"`
- **THEN** participants SHALL pay entry fees and receive winnings in Play Coins

#### Scenario: Paid playground with Arinova Coins
- **WHEN** a playground defines `currency: "arinova"`
- **THEN** participants SHALL pay entry fees and receive winnings in Arinova Coins

#### Scenario: No-stakes playground
- **WHEN** a playground defines `currency: "free"`
- **THEN** no currency SHALL be required or exchanged

### Requirement: Play Coins daily distribution
The system SHALL grant each user a fixed amount of Play Coins daily. Play Coins cannot be purchased or converted to Arinova Coins.

#### Scenario: Daily Play Coins grant
- **WHEN** a user logs in and has not received today's Play Coins
- **THEN** the system SHALL credit the user's Play Coins balance with the daily amount

#### Scenario: Already received today
- **WHEN** a user has already received today's Play Coins
- **THEN** the system SHALL NOT grant additional Play Coins

### Requirement: Play Coins balance tracking
The system SHALL maintain a separate Play Coins balance per user, independent of Arinova Coins.

#### Scenario: View Play Coins balance
- **WHEN** a user checks their wallet
- **THEN** the system SHALL display both Play Coins and Arinova Coins balances separately

### Requirement: Creator-defined economy rules
The system SHALL allow playground creators to define economy rules in the `PlaygroundDefinition.economy` field, including currency type, entry fee, prize distribution, and optional per-round betting.

#### Scenario: Entry fee playground
- **WHEN** a playground defines `economy: { currency: "play", entryFee: 100, prizeDistribution: "winner-takes-all" }`
- **THEN** each participant SHALL pay 100 Play Coins to join, and the winner SHALL receive the total prize pool

#### Scenario: Per-round betting playground
- **WHEN** a playground defines `economy: { currency: "arinova", entryFee: 0, betting: { enabled: true, minBet: 10, maxBet: 500 } }`
- **THEN** participants SHALL be able to place bets each round within the defined limits

#### Scenario: Custom prize distribution
- **WHEN** a playground defines `prizeDistribution: { first: 60, second: 30, third: 10 }`
- **THEN** the system SHALL distribute the prize pool according to the defined percentages

### Requirement: Entry fee collection and prize pool
The system SHALL collect entry fees from participants when they join a paid playground and hold them in a prize pool until the session ends.

#### Scenario: Entry fee deducted on join
- **WHEN** a user joins a playground with an entry fee of 100 Play Coins
- **THEN** the system SHALL deduct 100 Play Coins from the user's balance and add it to the session prize pool

#### Scenario: Insufficient balance
- **WHEN** a user attempts to join a playground but has insufficient balance for the entry fee
- **THEN** the system SHALL reject the join with an error indicating insufficient funds

#### Scenario: Refund on session cancelled
- **WHEN** a playground session is cancelled before starting (e.g., owner deletes, timeout)
- **THEN** the system SHALL refund all entry fees to participants

### Requirement: Prize distribution on session end
The system SHALL automatically distribute the prize pool to winners when a playground session finishes.

#### Scenario: Winner-takes-all distribution
- **WHEN** a session ends with `prizeDistribution: "winner-takes-all"` and a single winning team
- **THEN** the system SHALL split the prize pool equally among winning participants

#### Scenario: Ranked distribution
- **WHEN** a session ends with percentage-based distribution (e.g., 60/30/10)
- **THEN** the system SHALL distribute the prize pool according to the defined percentages per rank

### Requirement: Per-round betting
The system SHALL support optional per-round betting where participants can place bets during designated phases.

#### Scenario: Place bet during betting phase
- **WHEN** a participant places a bet of 50 coins during a phase with betting enabled
- **THEN** the system SHALL deduct 50 coins from the participant's balance and add to the round pot

#### Scenario: Bet exceeds maximum
- **WHEN** a participant attempts to bet more than the defined `maxBet`
- **THEN** the system SHALL reject the bet

#### Scenario: Bet below minimum
- **WHEN** a participant attempts to bet less than the defined `minBet`
- **THEN** the system SHALL reject the bet

### Requirement: Platform commission
The system SHALL deduct a platform commission from Arinova Coins prize pools before distribution. Play Coins pools SHALL have no commission.

#### Scenario: Arinova Coins commission
- **WHEN** an Arinova Coins session ends with a prize pool of 1000 coins
- **THEN** the system SHALL deduct the platform commission percentage and distribute the remainder to winners

#### Scenario: Play Coins no commission
- **WHEN** a Play Coins session ends with a prize pool of 1000 coins
- **THEN** the system SHALL distribute the full prize pool with no commission

### Requirement: Transaction ledger
The system SHALL record all playground economy transactions (entry fees, bets, winnings, refunds, commissions) in a ledger for auditability.

#### Scenario: Transaction recorded
- **WHEN** any currency transaction occurs in a playground session
- **THEN** the system SHALL create a ledger entry with type, amount, userId, sessionId, and timestamp

#### Scenario: View transaction history
- **WHEN** a user requests their playground transaction history
- **THEN** the system SHALL return a paginated list of all playground-related transactions
