## 1. Manifest Schema & Validation

- [x] 1.1 Define TypeScript types for `manifest.json` schema in `packages/shared/src/types/`
- [x] 1.2 Implement manifest JSON Schema validator (validate required fields, enums, JSON Schema for state/actions)
- [ ] 1.3 Write unit tests for manifest validation (valid manifest, missing fields, invalid enums, static vs dynamic mode)

## 2. Database Schema

- [x] 2.1 Create `apps` table (id, developerId, manifestId, name, category, status, createdAt, updatedAt)
- [x] 2.2 Create `app_versions` table (id, appId, version, manifestJson, packagePath, status, reviewNotes, createdAt)
- [x] 2.3 Create `developer_accounts` table (id, userId, displayName, contactEmail, payoutInfo, termsAcceptedAt)
- [x] 2.4 Create `coin_balances` table (userId, balance) and `coin_transactions` table (id, userId, type, amount, relatedAppId, relatedProductId, receiptId, createdAt)
- [x] 2.5 Create `app_purchases` table (id, userId, appVersionId, productId, amount, status, createdAt)
- [x] 2.6 Run Drizzle migrations for all new tables

## 3. App Package Upload & Storage

- [x] 3.1 Create `POST /api/apps/submit` endpoint — accepts zip upload, extracts manifest, validates schema, stores package
- [x] 3.2 Implement package storage (local `uploads/apps/` for dev, S3/R2 for production)
- [x] 3.3 Implement 50MB upload size limit enforcement
- [x] 3.4 Validate entry point file existence and allowed asset file types

## 4. Static Analysis Scanner

- [x] 4.1 Implement JS static scanner — detect `eval()`, `new Function()`, `import()`, `document.cookie`, `top.location`, `parent.location`, `window.open`, `setTimeout("string"`
- [x] 4.2 Integrate scanner into submission pipeline (auto-reject on forbidden API detection)
- [ ] 4.3 Write tests for scanner (clean code passes, each forbidden pattern detected)

## 5. App Review Pipeline

- [x] 5.1 Implement permission-tier classification (Tier 0/1/2 based on manifest permissions)
- [x] 5.2 Auto-publish flow for Tier 0/1 apps after passing scan
- [ ] 5.3 Create admin review queue UI for Tier 2 apps (network whitelist review)
- [x] 5.4 Implement app status lifecycle: submitted → scanning → in_review → published / rejected
- [x] 5.5 Implement app suspension endpoint and "app suspended" display

## 6. Marketplace API & Frontend

- [x] 6.1 Create `GET /api/marketplace/apps` — list published apps with filtering (category, tags, search, platform)
- [x] 6.2 Create `GET /api/marketplace/apps/:id` — app detail page data (manifest, screenshots, rating, reviews)
- [x] 6.3 Build marketplace browse/search page in frontend
- [x] 6.4 Build app detail page with screenshots, description, install/launch button
- [x] 6.5 Implement platform-aware filtering (hide iOS-only apps on web, etc.)

## 7. App SDK (`@arinova/app-sdk`)

- [x] 7.1 Create `packages/app-sdk/` package with TypeScript setup
- [x] 7.2 Implement `ArinovaApp` class with postMessage transport layer
- [x] 7.3 Implement `setContext()` and `setStateForRole()` with maxStateSize enforcement
- [x] 7.4 Implement `onAction()` and `onAnyAction()` action handlers
- [x] 7.5 Implement `emit()` for event emission
- [x] 7.6 Implement `onControlModeChanged()` callback
- [x] 7.7 Implement `reportHumanAction()` for human action reporting
- [x] 7.8 Implement `registerProducts()` and `requestPurchase()` for monetization
- [x] 7.9 Implement lifecycle events: `onReady()`, `onPause()`, `onResume()`, `onDestroy()`
- [x] 7.10 Build and publish SDK (npm package or bundled in app template)

## 8. App Runtime (Sandboxed Iframe)

- [x] 8.1 Create `AppRunner` React component — sandboxed iframe with CSP injection
- [x] 8.2 Implement platform-side postMessage bridge (receive setContext, send actions, control mode)
- [x] 8.3 Implement CSP generation based on manifest permissions and network whitelist
- [x] 8.4 Implement per-app-per-user storage scoping and 10MB quota
- [x] 8.5 Build the app player page layout: game view + chat/agent panel side by side

## 9. Agent-App Bridge

- [x] 9.1 Implement state-to-tool-use converter (app state/actions → LLM tool definitions)
- [x] 9.2 Implement agent action routing (tool call → validate → forward to app via postMessage)
- [x] 9.3 Implement dynamic tool update handling (when app calls setContext with new actions)
- [x] 9.4 Implement event delivery to agent (app events → agent system messages)
- [x] 9.5 Implement per-role state isolation (only deliver role-matched state to agent)
- [x] 9.6 Implement agent session context management (prompt + state + action history)

## 10. Control Mode System

- [x] 10.1 Implement control mode state machine (agent ↔ human ↔ copilot transitions)
- [x] 10.2 Build "Take Control" / "Hand Back" UI buttons
- [x] 10.3 Implement action routing enforcement per control mode
- [x] 10.4 Implement copilot action partitioning (humanOnly / agentOnly flags)
- [x] 10.5 Display control mode transitions in chat log ("👤 You took control", "🤖 Agent resumed")

## 11. Monetization — Arinova Coins

- [x] 11.1 Implement coin balance API (`GET /api/wallet/balance`, `GET /api/wallet/transactions`)
- [x] 11.2 Implement coin top-up flow for web (Stripe or similar payment processor)
- [x] 11.3 Implement in-app purchase processing (`POST /api/apps/:id/purchase` — validate, deduct, receipt)
- [x] 11.4 Implement revenue share calculation and developer earnings ledger
- [x] 11.5 Build wallet UI in frontend (balance display, top-up, transaction history)
- [x] 11.6 Build purchase confirmation dialog component
- [x] 11.7 Implement refund API (within 24h, unused goods only)

## 12. Developer Dashboard

- [x] 12.1 Create developer registration flow (apply from settings, provide info, accept terms)
- [x] 12.2 Build app submission UI (upload zip, preview manifest, submit)
- [x] 12.3 Build developer app management page (list apps, view status, submit updates)
- [x] 12.4 Build earnings dashboard (revenue, payouts, per-app breakdown)
