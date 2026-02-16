## ADDED Requirements

### Requirement: App submission flow
Developers SHALL submit app packages via an upload API or developer dashboard. Each submission SHALL include the package file (zip) and SHALL be validated against the manifest schema before entering review.

#### Scenario: Valid submission
- **WHEN** a developer uploads a valid package with correct manifest
- **THEN** the submission enters the review pipeline

#### Scenario: Invalid manifest
- **WHEN** a developer uploads a package with invalid manifest
- **THEN** the submission is immediately rejected with validation errors

### Requirement: Static analysis pipeline
All submitted packages SHALL undergo automated static analysis. The scanner SHALL check for: forbidden JavaScript APIs (`eval`, `new Function`, `import()` dynamic imports, `document.cookie`, `top.location`, `parent.location`, `window.open`), manifest schema validity, entry point file existence, asset file type validation (only allow html, js, css, png, jpg, svg, webp, gif, mp3, ogg, wav, woff, woff2, json).

#### Scenario: Forbidden API detected
- **WHEN** the scanner finds `eval()` in app code
- **THEN** the submission is rejected with "Forbidden API: eval() at file.js:42"

#### Scenario: Minified code with forbidden patterns
- **WHEN** the scanner detects patterns like `Function("` or `setTimeout("string"` in minified code
- **THEN** the submission is flagged for review

### Requirement: Permission-tiered review
Submissions SHALL be reviewed based on declared permissions:
- **Tier 0** (no permissions or only "audio"): Automated scan only → auto-publish on pass
- **Tier 1** ("storage"): Automated scan only → auto-publish on pass
- **Tier 2** ("network"): Automated scan + manual review of domain whitelist and network usage → publish after manual approval

#### Scenario: Tier 0 auto-publish
- **WHEN** a sandboxed app with no special permissions passes static analysis
- **THEN** the app is automatically published to the marketplace

#### Scenario: Tier 2 manual review
- **WHEN** an app requesting network permission passes static analysis
- **THEN** the app enters a manual review queue for domain whitelist verification

### Requirement: Domain whitelist verification
For apps with "network" permission, manual reviewers SHALL verify: each domain in `network.allowed` is owned/controlled by the developer, the domains serve legitimate app functionality (game server, CDN, API), no tracking/analytics domains that could compromise user privacy.

#### Scenario: Legitimate game server
- **WHEN** a reviewer sees `network.allowed: ["game.example.com"]` and the developer owns example.com
- **THEN** the reviewer approves the domain whitelist

#### Scenario: Suspicious domain
- **WHEN** a reviewer sees an analytics/tracking domain in the whitelist
- **THEN** the reviewer rejects with "Domain not allowed: tracking services prohibited"

### Requirement: Age rating enforcement
Apps SHALL declare an age rating in the manifest. The platform SHALL enforce age-appropriate content visibility based on user age settings. Apps with `rating.age: "17+"` SHALL undergo content review.

#### Scenario: Mature content review
- **WHEN** an app declares `rating.age: "17+"`
- **THEN** the app enters manual review regardless of permission tier

### Requirement: App update review
When a developer submits an updated version of an existing app, the review process SHALL apply based on what changed. If permissions increased (e.g., added "network"), the new tier's review applies. If permissions stayed the same or decreased, the previous tier's review applies.

#### Scenario: Permission escalation
- **WHEN** an app update adds "network" permission that the previous version didn't have
- **THEN** the update enters Tier 2 manual review

#### Scenario: Code-only update
- **WHEN** an app update only changes code with no permission changes
- **THEN** the update goes through the same tier review as the current version

### Requirement: App suspension
The platform SHALL be able to suspend a published app immediately if: a security vulnerability is discovered, policy violations are reported and confirmed, the developer's account is suspended. Suspended apps SHALL be hidden from the marketplace and existing instances SHALL display a "This app has been suspended" message.

#### Scenario: Security vulnerability
- **WHEN** a security issue is discovered in a published app
- **THEN** the platform suspends the app and notifies the developer with remediation requirements

### Requirement: Developer account
Developers SHALL register a developer account to submit apps. Developer accounts SHALL include: display name, contact email, payment information (for payouts), agreement to developer terms.

#### Scenario: New developer registration
- **WHEN** an Arinova Chat user applies for a developer account
- **THEN** they provide required information and agree to terms before being able to submit apps
