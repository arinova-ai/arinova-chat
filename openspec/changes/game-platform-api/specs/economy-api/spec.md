## ADDED Requirements

### Requirement: Charge user coins
The system SHALL allow external apps to charge Arinova Coins from a user's balance (server-to-server, signed with app_secret).

#### Scenario: Successful charge
- **WHEN** app server sends `POST /api/v1/economy/charge` with `{ userId, amount, description }` and valid `X-App-Secret` header
- **THEN** system deducts `amount` from user's balance, records transaction, and returns `{ transactionId, newBalance }`

#### Scenario: Insufficient balance
- **WHEN** charge amount exceeds user's balance
- **THEN** system returns 400 with `{ error: "insufficient_balance" }`

#### Scenario: Invalid app secret
- **WHEN** request has missing or invalid `X-App-Secret` header
- **THEN** system returns 401 with `{ error: "invalid_app_secret" }`

### Requirement: Award user coins
The system SHALL allow external apps to award coins to a user (e.g., prize winnings).

#### Scenario: Successful award
- **WHEN** app server sends `POST /api/v1/economy/award` with `{ userId, amount, description }` and valid `X-App-Secret`
- **THEN** system adds `amount` to user's balance (after platform fee deduction), records transaction, and returns `{ transactionId, newBalance, platformFee }`

### Requirement: Check user balance
The system SHALL allow external apps to check a user's coin balance.

#### Scenario: Successful balance check
- **WHEN** app sends `GET /api/v1/economy/balance` with valid access_token
- **THEN** system returns `{ balance }` for the authenticated user

### Requirement: Platform fee on transactions
The system SHALL deduct a platform fee (percentage) on economy transactions flowing through external apps.

#### Scenario: Platform fee applied
- **WHEN** an app awards 100 coins to a user with 30% platform fee
- **THEN** user receives 70 coins, platform retains 30 coins, transaction records both amounts
