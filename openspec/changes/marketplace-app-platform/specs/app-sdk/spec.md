## ADDED Requirements

### Requirement: SDK initialization
The `@arinova/app-sdk` SHALL export an `ArinovaApp` class. Calling `new ArinovaApp()` SHALL establish communication with the platform via the appropriate transport (postMessage for web iframe, native bridge for iOS/Android WebView).

#### Scenario: Web initialization
- **WHEN** an app calls `new ArinovaApp()` inside a sandboxed iframe
- **THEN** the SDK establishes a postMessage channel with the parent frame

#### Scenario: Mobile initialization
- **WHEN** an app calls `new ArinovaApp()` inside a mobile WebView
- **THEN** the SDK uses the native bridge (WKScriptMessageHandler on iOS, JavascriptInterface on Android)

### Requirement: State updates via setContext
The SDK SHALL provide `app.setContext(ctx)` where `ctx` includes: `state` (object), `actions` (array of action definitions), optional `humanLabel` (string for human-readable summary). For multi-role apps, `app.setStateForRole(role, ctx)` SHALL send state to a specific role only.

#### Scenario: Dynamic mode state push
- **WHEN** an app calls `app.setContext({ state: {...}, actions: [...] })`
- **THEN** the platform receives the updated state and available actions for the agent

#### Scenario: Per-role state delivery
- **WHEN** an app calls `app.setStateForRole("playerA", { state: {...} })`
- **THEN** only the agent assigned to role "playerA" receives the state update

#### Scenario: State size limit
- **WHEN** an app pushes state exceeding the manifest's `maxStateSize`
- **THEN** the SDK rejects with error "State exceeds maxStateSize limit"

### Requirement: Action handling
The SDK SHALL provide `app.onAction(name, callback)` to register handlers for agent actions. The callback receives the action's params object. The SDK SHALL also provide `app.onAnyAction(callback)` for a catch-all handler.

#### Scenario: Agent sends action
- **WHEN** the agent invokes action "place" with params `{ row: 1, col: 2 }`
- **THEN** the app's registered `onAction("place", cb)` handler is called with `{ row: 1, col: 2 }`

#### Scenario: Unknown action
- **WHEN** the agent sends an action with no registered handler
- **THEN** the SDK calls the `onAnyAction` handler if registered, otherwise ignores

### Requirement: Event emission
The SDK SHALL provide `app.emit(eventName, payload)` to send events to the agent. Events SHALL be defined in the manifest's `shared.events` or role-level events.

#### Scenario: Game end event
- **WHEN** an app calls `app.emit("gameEnded", { winner: "X" })`
- **THEN** the platform delivers the event to all connected agents

### Requirement: Control mode handling
The SDK SHALL provide `app.onControlModeChanged(callback)` where callback receives the new mode ("agent" | "human" | "copilot"). Apps SHALL use this to enable/disable human UI input.

#### Scenario: Switch to human mode
- **WHEN** the user clicks "Take Control" and platform sends mode "human"
- **THEN** the app's `onControlModeChanged` callback fires with "human"

#### Scenario: Switch back to agent
- **WHEN** the user clicks "Hand Back" and platform sends mode "agent"
- **THEN** the app's callback fires with "agent" and the app pushes current state via `setContext()`

### Requirement: Human action reporting
The SDK SHALL provide `app.reportHumanAction(name, params)` for apps to report actions taken by the human directly on the game UI. The platform SHALL display these in the chat log.

#### Scenario: Human makes a move
- **WHEN** the human clicks on the game board and the app calls `app.reportHumanAction("place", { row: 0, col: 1 })`
- **THEN** the platform shows "👤 You: place (row: 0, col: 1)" in the chat panel

### Requirement: Product registration
The SDK SHALL provide `app.registerProducts(products)` where each product has: `id` (string), `name` (string), `price` (integer, in Arinova Coins), `icon` (optional string, emoji or asset path).

#### Scenario: Register purchasable items
- **WHEN** an app calls `app.registerProducts([{ id: "sword", name: "Magic Sword", price: 100 }])`
- **THEN** the platform records available products for this app session

### Requirement: Purchase flow
The SDK SHALL provide `app.requestPurchase(productId)` returning a Promise. The platform SHALL show a confirmation dialog to the user, check balance, deduct Arinova Coins, and resolve the promise with a receipt object `{ receiptId, productId, timestamp }`. On failure (insufficient balance, user cancel), the promise SHALL reject.

#### Scenario: Successful purchase
- **WHEN** app calls `app.requestPurchase("sword")` and user has sufficient balance and confirms
- **THEN** the promise resolves with a receipt and the user's Arinova Coins balance is deducted

#### Scenario: Insufficient balance
- **WHEN** app calls `app.requestPurchase("sword")` and user's balance is below the price
- **THEN** the promise rejects with error "Insufficient balance" and the platform offers to top up

#### Scenario: User cancels
- **WHEN** the user dismisses the purchase confirmation dialog
- **THEN** the promise rejects with error "User cancelled"

### Requirement: App lifecycle events
The SDK SHALL provide `app.onReady(callback)` (platform finished loading the app), `app.onPause(callback)` (app goes to background), `app.onResume(callback)` (app returns to foreground), `app.onDestroy(callback)` (app session ending).

#### Scenario: App initialization complete
- **WHEN** the platform finishes loading the app iframe and establishes communication
- **THEN** the `onReady` callback fires and the app can start sending state
