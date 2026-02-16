## ADDED Requirements

### Requirement: Manifest file format
Every app package SHALL contain a `manifest.json` at the package root. The manifest SHALL be valid JSON conforming to `manifest_version: 1`.

#### Scenario: Valid manifest
- **WHEN** a developer creates a package with a valid `manifest.json`
- **THEN** the platform accepts the package for review

#### Scenario: Missing manifest
- **WHEN** a package is uploaded without `manifest.json`
- **THEN** the platform rejects the upload with error "Missing manifest.json"

#### Scenario: Invalid manifest
- **WHEN** a package contains `manifest.json` with missing required fields
- **THEN** the platform rejects the upload listing each missing field

### Requirement: App identity fields
The manifest SHALL include: `manifest_version` (integer), `id` (string, kebab-case, globally unique), `name` (string, display name), `version` (string, semver), `description` (string), `author` (object with `name` string and optional `url` string).

#### Scenario: Unique app ID
- **WHEN** a developer submits an app with `id` already taken by another developer
- **THEN** the platform rejects with error "App ID already registered"

#### Scenario: Version bump required
- **WHEN** a developer submits an update with the same `version` as an existing published version
- **THEN** the platform rejects with error "Version already exists"

### Requirement: Category and discoverability
The manifest SHALL include `category` (one of: `game`, `shopping`, `tool`, `social`, `other`), `tags` (array of strings, max 10), `icon` (path to image in package, 512x512 PNG), and optional `screenshots` (array of image paths, max 5).

#### Scenario: Browse by category
- **WHEN** a user browses the marketplace filtered by category "game"
- **THEN** only apps with `category: "game"` are shown

### Requirement: UI configuration
The manifest SHALL include a `ui` object with: `entry` (string, path to HTML entry point), `viewport` (object with `minWidth`, `maxWidth` as integers, `aspectRatio` as string e.g. "1:1" or "flexible", `orientation` as "portrait" | "landscape" | "any").

#### Scenario: Responsive viewport
- **WHEN** the platform renders an app with `viewport.minWidth: 320, maxWidth: 600`
- **THEN** the app container is sized within those bounds based on available space

### Requirement: Platform compatibility
The manifest SHALL include `platforms` object with boolean fields: `web`, `ios`, `android`. At least one SHALL be `true`.

#### Scenario: Platform filtering
- **WHEN** a user on iOS browses the marketplace
- **THEN** only apps with `platforms.ios: true` are shown

### Requirement: Player configuration
The manifest SHALL include `players` object with `min` (integer >= 1) and `max` (integer >= min) fields.

#### Scenario: Single-player app
- **WHEN** an app declares `players: { min: 1, max: 1 }`
- **THEN** the platform creates one agent slot per app instance

### Requirement: Role-based agent interface
The manifest SHALL include a `roles` object. Each key is a role name. A `shared` key MAY define `events` inherited by all roles. Each non-shared role SHALL include `prompt` (string, supports `{role}` and `{playerName}` template variables), `state` (JSON Schema object describing observable state), and `actions` (array of action definitions).

#### Scenario: Per-role state isolation
- **WHEN** an app defines roles "playerA" and "playerB" with different state schemas
- **THEN** the platform sends only the corresponding role's state to each agent

#### Scenario: Template variable substitution
- **WHEN** a role prompt contains `{role}`
- **THEN** the platform replaces it with the agent's assigned role name at runtime

### Requirement: Action definition format
Each action in a role's `actions` array SHALL include `name` (string), `description` (string), and optional `params` (JSON Schema object). Actions MAY include `humanOnly: true` or `agentOnly: true` for co-pilot mode partitioning.

#### Scenario: Action with parameters
- **WHEN** an agent invokes action `place` with params `{ row: 1, col: 2 }`
- **THEN** the platform validates params against the action's JSON Schema before forwarding to the app

#### Scenario: Invalid action params
- **WHEN** an agent sends params that fail schema validation
- **THEN** the platform rejects the action and notifies the agent of the validation error

### Requirement: Agent interface mode
The manifest SHALL include `agentInterface` object with `mode` ("static" or "dynamic") and `description` (string). For dynamic mode, `maxStateSize` (integer, bytes) and `maxActions` (integer) SHALL be specified.

#### Scenario: Static mode
- **WHEN** `agentInterface.mode` is "static"
- **THEN** the platform uses state/actions from the role definitions in the manifest

#### Scenario: Dynamic mode
- **WHEN** `agentInterface.mode` is "dynamic"
- **THEN** the platform accepts state/actions pushed at runtime via SDK `setContext()`

### Requirement: Interaction configuration
The manifest SHALL include `interaction` object with: `controlModes` (array, subset of ["agent", "human", "copilot"]), `defaultMode` (string, one of the declared modes), `humanInput` ("direct" | "chat" | "both").

#### Scenario: Human takeover
- **WHEN** an app declares `controlModes: ["agent", "human"]`
- **THEN** the platform shows a "Take Control" button to the user

### Requirement: Monetization declaration
The manifest SHALL include `monetization` object with: `model` ("free" | "paid" | "freemium" | "subscription"), `virtualGoods` (boolean), `externalPayments` (boolean).

#### Scenario: Freemium with virtual goods
- **WHEN** an app declares `monetization: { model: "freemium", virtualGoods: true }`
- **THEN** the platform enables the in-app purchase SDK APIs for this app

#### Scenario: External payments require review
- **WHEN** an app declares `externalPayments: true`
- **THEN** the app is flagged for manual review of payment flow compliance

### Requirement: Age rating
The manifest SHALL include `rating` object with: `age` ("4+" | "9+" | "12+" | "17+"), `descriptors` (array of strings: "in-app-purchases", "mild-violence", "gambling", "mature-content", etc.).

#### Scenario: Age-restricted app
- **WHEN** a user's age setting is under 12
- **THEN** apps with `rating.age: "12+"` or higher are hidden from the marketplace

### Requirement: Permission declaration
The manifest SHALL include `permissions` (array of strings). Valid values: "storage", "network", "audio". Default is empty (no permissions). If "network" is declared, a `network` object with `allowed` (array of domain strings) SHALL be present.

#### Scenario: Network whitelist enforcement
- **WHEN** an app declares `permissions: ["network"]` with `network.allowed: ["game.example.com"]`
- **THEN** the sandbox CSP only allows connections to `game.example.com`

#### Scenario: Undeclared network access
- **WHEN** app code attempts `fetch()` without "network" permission
- **THEN** the request is blocked by the sandbox CSP
