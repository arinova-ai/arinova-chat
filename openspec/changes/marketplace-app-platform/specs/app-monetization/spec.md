## ADDED Requirements

### Requirement: Arinova Coins virtual currency
The platform SHALL provide a virtual currency called "Arinova Coins". Users SHALL top up their balance via In-App Purchase (iOS/Android) or credit card/payment processor (web).

#### Scenario: Top up via IAP
- **WHEN** a user purchases an Arinova Coins pack via Apple IAP
- **THEN** the user's coin balance increases by the purchased amount after receipt verification

#### Scenario: Top up via web
- **WHEN** a user purchases coins via credit card on the web platform
- **THEN** the user's coin balance increases after payment confirmation

### Requirement: Coin balance management
Each user SHALL have a single Arinova Coins balance. The platform SHALL maintain a ledger of all transactions (top-ups, purchases, refunds). Balance SHALL never go negative.

#### Scenario: Balance check
- **WHEN** a user views their wallet
- **THEN** the current balance and recent transaction history are displayed

### Requirement: In-app purchase processing
The platform SHALL process purchase requests from apps via the SDK's `requestPurchase()`. The flow: app requests → platform shows confirmation dialog to user → user confirms → platform deducts coins → platform returns receipt to app → app delivers the virtual good.

#### Scenario: Successful purchase flow
- **WHEN** an app requests purchase of "magic_sword" (100 coins) and user has 500 coins and confirms
- **THEN** balance becomes 400, app receives receipt, transaction is logged

#### Scenario: Insufficient balance with top-up prompt
- **WHEN** an app requests purchase and user's balance is insufficient
- **THEN** the platform shows "Insufficient balance" with a "Top Up" button

### Requirement: Revenue share
The platform SHALL retain a configurable percentage (default 30%) of each virtual goods transaction. The remainder SHALL be credited to the developer's earnings balance.

#### Scenario: Revenue split
- **WHEN** a user spends 100 coins on an in-app purchase
- **THEN** 30 coins go to platform revenue, 70 coins go to developer earnings

### Requirement: Developer payouts
Developers SHALL be able to view their earnings balance and request payouts. Payout minimum thresholds and schedules SHALL be configured by the platform.

#### Scenario: Developer views earnings
- **WHEN** a developer opens their dashboard
- **THEN** total earnings, pending balance, and payout history are shown

### Requirement: Paid app purchases
Apps with `monetization.model: "paid"` SHALL require a one-time purchase (in Arinova Coins) before the user can access the app. The price SHALL be set by the developer.

#### Scenario: Paid app access
- **WHEN** a user tries to open a paid app they haven't purchased
- **THEN** the platform shows the price and a purchase button

#### Scenario: Already purchased
- **WHEN** a user opens a paid app they previously purchased
- **THEN** the app loads immediately without re-purchase

### Requirement: External payments for physical goods
Apps with `monetization.externalPayments: true` MAY implement their own payment flow for physical goods and real-world services. The platform SHALL NOT mediate or take commission on external payments. The app's review process SHALL verify that external payments are only used for physical goods.

#### Scenario: E-commerce checkout
- **WHEN** a shopping app processes a purchase for a physical product
- **THEN** the app handles payment through its own checkout flow (via network permission)

### Requirement: Refund policy
Users MAY request refunds for virtual good purchases within 24 hours if the virtual good was not consumed/used. The platform SHALL handle refund processing and reverse the transaction.

#### Scenario: Refund request
- **WHEN** a user requests a refund for an unused virtual good within 24 hours
- **THEN** coins are returned to user balance, developer earnings are adjusted, transaction is marked refunded
