## Why

Arinova Chat connects humans with AI agents via messaging. The next step is letting users deploy their agents into interactive applications — games, e-commerce, tools — published by third-party developers. This requires an app marketplace where developers upload sandboxed app packages, and users send their AI agents to interact with those apps while watching (or taking over) in real-time.

## What Changes

- Introduce a **Marketplace App Manifest** schema (`manifest.json`) that defines app metadata, UI entry point, agent interface, control modes, monetization, and permissions.
- Define two **agent interface modes**: `static` (state/actions declared in manifest) for simple apps, and `dynamic` (state/actions pushed at runtime via SDK) for complex apps like MMORPGs.
- Design the **`@arinova/app-sdk`** — a client-side SDK that apps use to communicate with the Arinova platform (state updates, action handling, payment requests, control mode transitions) via a transport-agnostic bridge (postMessage on web, native bridge on mobile).
- Define **per-role state schemas** with partial observability — each player role has its own state/actions/prompt, platform guarantees isolation.
- Support **human takeover**: users can switch between agent, human, and co-pilot control modes at runtime.
- Introduce **Arinova Coins** as the single virtual currency for all in-app purchases; e-commerce apps may use external payments for physical goods.
- Define a **sandboxed runtime** model: apps run in restricted iframes/WebViews with no network access by default; apps requiring network must whitelist domains and undergo additional review.
- Establish **app review and permission tiers**: automatic scanning for sandboxed apps, manual review for apps requesting network access.

## Capabilities

### New Capabilities

- `app-manifest`: Manifest schema definition — metadata, UI config, viewport, platforms, players, roles, agentInterface (static/dynamic), interaction modes, monetization, rating, permissions, network whitelist.
- `app-sdk`: Client-side SDK (`@arinova/app-sdk`) — transport layer abstraction, `setContext()`, `onAction()`, `emit()`, `reportHumanAction()`, `onControlModeChanged()`, `registerProducts()`, `requestPurchase()`, state-for-role delivery.
- `app-runtime`: Sandboxed execution environment — iframe/WebView sandbox configuration, CSP policies, permission enforcement, static analysis scanning rules, asset size limits.
- `agent-app-bridge`: Protocol between platform and agent for app interaction — converting app state/actions into tool-use format, routing agent actions to apps, handling dynamic tool discovery for dynamic-mode apps.
- `app-monetization`: Virtual currency system (Arinova Coins) — top-up via IAP/credit card, in-app purchase flow, revenue split, external payment policy for physical goods, receipt verification.
- `app-review`: App submission, scanning, and review pipeline — permission-tier based review process, static analysis rules (forbidden APIs), domain whitelist verification, age rating and content descriptors.

### Modified Capabilities

_(none — no existing specs)_

## Impact

- **New packages**: `@arinova/app-sdk` (published to npm for app developers)
- **Backend**: New routes for app submission, review, marketplace listing, purchase processing, Arinova Coins ledger
- **Frontend**: Marketplace browse/search UI, app runner (sandboxed iframe/WebView), control mode switcher, purchase confirmation dialogs, Arinova Coins wallet UI
- **Database**: New tables for apps, app versions, reviews, virtual currency balances, purchase history, developer accounts
- **Infrastructure**: App package storage (S3/R2), static analysis pipeline, sandbox CSP configuration
- **External**: IAP integration (Apple/Google), payment processor for web top-ups
