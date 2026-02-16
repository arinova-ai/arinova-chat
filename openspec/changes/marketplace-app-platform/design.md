## Context

Arinova Chat is a messaging platform for human-to-AI-agent communication. The current system supports 1v1 conversations, group chats, and communities with A2A-protocol agents. The marketplace feature extends this by allowing third-party developers to publish interactive apps (games, e-commerce, tools) that AI agents can interact with on behalf of users.

Key constraints:
- Must work across web, iOS (App Store), and Android (Play Store)
- Apps must be sandboxed for security — no arbitrary network access or code execution
- Must comply with Apple/Google IAP rules for virtual goods
- Agent interaction must be efficient (structured data, not vision-based)
- Human users must be able to observe, take over, or co-pilot with their agent

## Goals / Non-Goals

**Goals:**
- Define a manifest schema that covers simple (tic-tac-toe) to complex (MMORPG) apps
- Provide a developer-friendly SDK (`@arinova/app-sdk`) for building apps
- Enable secure sandboxed execution of third-party code
- Support human ↔ agent control mode switching in real-time
- Implement a single virtual currency (Arinova Coins) for all in-app purchases

**Non-Goals:**
- Native app packages (only web-based packages: HTML/JS/CSS)
- 3D/WebXR runtime (developers bring their own rendering via standard web APIs)
- Agent-to-agent gameplay (Phase 1 is one agent per app instance; multi-agent comes later)
- Building apps ourselves (we build the platform; developers build apps)
- Cryptocurrency or blockchain integration

## Decisions

### 1. Web-based packages in sandboxed iframe/WebView

**Decision**: Apps are HTML/JS/CSS packages rendered in sandboxed iframes (web) or WKWebView/Android WebView (mobile).

**Alternatives considered**:
- WASM-only: More secure but high developer friction, limited ecosystem
- Declarative state machines: Ultra-safe but too restrictive for complex apps
- Native packages per platform: Maximum performance but 3x development cost for developers

**Rationale**: Web packages have the largest developer ecosystem. Sandboxing via `<iframe sandbox="allow-scripts">` plus strict CSP provides strong isolation. Same package runs on all platforms.

### 2. Static + Dynamic agent interface modes

**Decision**: Manifest supports `mode: "static"` (state/actions in manifest) and `mode: "dynamic"` (state/actions pushed at runtime via SDK).

**Rationale**: Simple apps benefit from fully declarative interfaces (platform can validate, auto-generate prompts). Complex apps (MMORPGs) need context-dependent state and actions that change every frame. Dual mode serves both without forcing one model.

### 3. Per-role state schemas

**Decision**: Each role in the manifest defines its own state schema, prompt, and available actions. Platform guarantees role isolation.

**Alternatives considered**:
- Single shared state + app-side filtering: Simpler manifest but error-prone (app developer might leak state)
- Platform-side state filtering with annotations: Complex platform logic

**Rationale**: Declarative per-role schemas make partial observability a platform guarantee, not an app responsibility. For poker, player A's role schema simply doesn't include opponent's hand.

### 4. Arinova Coins as sole virtual currency

**Decision**: All virtual good purchases use Arinova Coins. Users top up via IAP (iOS/Android) or credit card (web). E-commerce apps may use external payments for physical goods only.

**Rationale**: Single currency simplifies IAP compliance (Apple/Google only see top-up transactions). Platform takes a revenue share on virtual goods. Physical goods are exempt per App Store rules.

### 5. Communication via postMessage bridge

**Decision**: App ↔ Platform communication uses `postMessage` on web, `WKScriptMessageHandler` on iOS, `WebView.addJavascriptInterface` on Android. The `@arinova/app-sdk` abstracts this.

**Rationale**: postMessage is the standard cross-origin communication for iframes. Native WebView bridges are the standard equivalent on mobile. SDK abstraction means app developers write platform-agnostic code.

### 6. Permission-tiered review process

**Decision**: Three tiers:
- **Tier 0** (no special permissions): Automated static analysis → auto-publish
- **Tier 1** (storage): Automated scan → auto-publish
- **Tier 2** (network): Automated scan + manual review of domain whitelist + periodic re-review

**Rationale**: Most apps don't need network access and can be auto-approved after scanning. Network access is the primary security risk and warrants human review.

## Risks / Trade-offs

- **[iframe sandbox escape]** → Mitigation: strict CSP, no `allow-same-origin`, automated static analysis banning `eval`/`Function`/`import()`. Regular security audits.
- **[Apple rejects "app store within app store"]** → Mitigation: Frame as "interactive skills" not "apps". Follow WeChat Mini Program precedents. All virtual purchases via IAP.
- **[Dynamic mode abuse]** → Mitigation: `maxStateSize` and `maxActions` limits in manifest. Rate-limit `setContext()` calls. Platform enforces.
- **[Large package sizes for games]** → Mitigation: Set package upload limit (e.g., 50MB). MMORPG clients use `network` permission to stream assets from their own CDN.
- **[Developer adoption]** → Mitigation: Provide starter templates, playground for testing, clear documentation. Keep SDK API surface small.

## Open Questions

- Exact revenue share percentage for virtual goods (30% like App Store? Lower to attract developers?)
- Whether to support app subscriptions (monthly VIP) in Phase 1 or defer
- Storage quota limits for apps with `storage` permission
- Whether co-pilot mode action partitioning (humanOnly/agentOnly) belongs in manifest or is purely runtime SDK
