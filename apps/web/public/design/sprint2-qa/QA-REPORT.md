# Sprint 2 — Full Frontend QA Report

**Branch:** `jiumi`
**Commits:** f9ebacf → 134a38a (13 commits, 22 files changed, +2224 / -45)
**Date:** 2026-02-27
**Tester:** Claude Code (Opus 4.6)
**Environment:**
- Web: `http://192.168.68.83:21000` (Docker, Next.js)
- API: `http://192.168.68.83:21001` (Docker, Rust)
- Test user: `cozy@test.com` / `TestCozy123`
- Browser: Playwright Chromium 1280×800 (mobile tests at 390×844)

---

## Summary

| # | Test Area | Result | Sub-items |
|---|-----------|--------|-----------|
| 0 | TSC Type Check | **PASS** | 0 errors |
| 1 | Chat Thinking Indicator Bug Fix | **PASS** | 3/3 |
| 2 | Theme Store List (search, filters, tags) | **PASS** | 6/6 |
| 3 | Theme Store Detail Page | **PASS** | 7/7 |
| 4 | Theme Quality Mode | **PASS** | 4/4 |
| 5 | Office CharacterModal Enhancements | **PASS** | 4/4 |
| 6 | Theme Upload API | **FAIL** | Build fail (zip crate yanked); code review 3/3 PASS |
| 7 | Regression Testing | **PASS** | 8/8 |

**Overall: 7 PASS / 1 FAIL (build-dependency issue)**

---

## Test 0 — TSC Type Check

```
npx tsc --noEmit   (from apps/web/)
```

**Result: PASS** — zero type errors.

---

## Test 1 — Chat Thinking Indicator Bug Fix

Commits: `f9ebacf`, `22e22da`

| Sub-test | Description | Result |
|----------|-------------|--------|
| 1.1 | `sync_response` handler resets `thinkingAgents: {}` on WS reconnect | PASS |
| 1.2 | `leaveGroup` handler removes conversation key from `thinkingAgents` | PASS |
| 1.3 | `deleteConversation` and `kicked_from_group` handlers clean up `thinkingAgents` | PASS |

**Method:** Code review of `chat-store.ts` diffs.

All three handlers now follow the same cleanup pattern:
```ts
const newThinking = { ...thinkingAgents };
delete newThinking[conversationId];
set({ ..., thinkingAgents: newThinking });
```

The `sync_response` handler uses a full reset (`thinkingAgents: {}`) which is correct for reconnection scenarios where all prior thinking state is stale.

**Result: PASS (3/3)**

---

## Test 2 — Theme Store List

Page: `/office/themes`

| Sub-test | Description | Result | Screenshot |
|----------|-------------|--------|------------|
| 2.1 | Grid renders 5 theme cards | PASS | `01-theme-store-list.png` |
| 2.2 | Search "neon" filters to 1 card (Neon Lab) | PASS | — |
| 2.3 | Price filter "Free" shows 3 themes, hides 2 premium | PASS | — |
| 2.4 | Tag "#cyberpunk" filters to Neon Lab only | PASS | — |
| 2.5 | Empty state: Free + #cyberpunk = "No themes match your filters." | PASS | `02-theme-store-empty.png` |
| 2.6 | Aria attributes: search label, price group role, aria-pressed on chips | PASS | — |

**Details:**
- Search uses case-insensitive haystack matching across name + description + tags
- Price filter chips: All / Free / Premium with visual active state
- Tag chips rendered from `allTags` Set with `aria-pressed` toggle
- Empty state message displays correctly when no themes match combined filters

**Result: PASS (6/6)**

---

## Test 3 — Theme Store Detail Page

Page: `/office/themes/cozy-studio`

| Sub-test | Description | Result | Screenshot |
|----------|-------------|--------|------------|
| 3.1 | Navigation from list → detail page | PASS | — |
| 3.2 | Preview image with thumbnail gallery | PASS | `03-theme-detail-cozy.png` |
| 3.3 | Info panel: badges (3D Theme, Free), author, rating (4.8★), specs | PASS | — |
| 3.4 | Specifications: Renderer, Animations, Room Size, Version, Quality Modes | PASS | — |
| 3.5 | Favorite toggle: aria-label switches between Add/Remove | PASS | — |
| 3.6 | "Back to themes" link navigates to `/office/themes` | PASS | — |
| 3.7 | Mobile responsive (390×844): single column, reviews below | PASS | `04-theme-detail-mobile.png` |

**Details:**
- Two-column layout at `lg:` breakpoint (flex-row), single column on mobile
- Quality Modes shows "Standard" for cozy-studio (no quality overrides in manifest)
- Specifications grid correctly derives values from loaded theme manifest via `loadTheme()`
- Reviews section uses dual-render pattern: `hidden lg:block` (desktop) and `lg:hidden` (mobile)
- StarRating component renders filled/empty stars based on rating value

**Result: PASS (7/7)**

---

## Test 4 — Theme Quality Mode

Pages: `/settings` (Appearance tab), renderer code

| Sub-test | Description | Result | Screenshot |
|----------|-------------|--------|------------|
| 4.1 | Settings UI shows "Theme Quality" with High Resolution / Performance buttons | PASS | `05-settings-quality.png` |
| 4.2 | Clicking "Performance" sets `localStorage.arinova_theme_quality = "performance"` | PASS | — |
| 4.3 | Clicking "High Resolution" sets `localStorage.arinova_theme_quality = "high"` | PASS | — |
| 4.4 | Renderer code reads same key and applies quality settings | PASS (code review) | — |

**Quality Mode Renderer Impact (code review of `threejs-renderer.ts`):**

| Setting | High | Performance |
|---------|------|-------------|
| Antialias | `true` | `false` |
| Pixel ratio | `min(devicePixelRatio, 2)` | `1` |
| Directional light | Enabled | Skipped |
| Texture anisotropy | Enabled | Skipped |
| Asset paths | `quality.high.*` overrides | `quality.performance.*` overrides |

`resolveQualityPath()` checks `manifest.quality[this.quality][category]` for asset path overrides, falling back to default paths.

**Result: PASS (4/4)**

---

## Test 5 — Office CharacterModal Enhancements

Page: `/office`

| Sub-test | Description | Result | Screenshot |
|----------|-------------|--------|------------|
| 5.1 | Click character opens modal with agent info (Linda) | PASS | `07-office-working.png` |
| 5.2 | Modal shows: status badge, model, token usage, session duration, current task | PASS | — |
| 5.3 | Close button dismisses modal cleanly | PASS | — |
| 5.4 | Offline fallback: CharacterDetailOffline shows "No agent connected", disabled Chat | PASS (code review) | — |

**Details:**
- `CharacterDetail` component renders when agent is connected: emoji, name, colored status badge, info grid
- `CharacterDetailOffline` renders robot emoji, "No agent connected" slate badge, disabled Chat button
- Modal uses responsive Dialog (desktop) / Sheet (mobile, bottom, max-h-[70vh]) pattern
- `STATUS_BADGE` map covers: working (green), idle (yellow), blocked (red), collaborating (blue), sleeping (gray)
- Helper functions: `formatDuration(ms)` and `formatTokens(n)` for display formatting
- Office room screenshot: `06-office-room.png`

**Result: PASS (4/4)**

---

## Test 6 — Theme Upload API

File: `apps/rust-server/src/routes/themes.rs` (445 lines)

### Build Status: FAIL

The Rust server cannot be compiled with current dependencies:

```
Cargo.toml specifies: zip = "2.5"
Versions 2.5.0, 2.6.0, 2.6.1 are ALL yanked on crates.io
Cargo.lock does not contain a zip entry (never resolved)
```

**Action Required:** Update `zip` dependency to a non-yanked version (e.g., `zip = "2.4"` or wait for `2.7.x`).

### Code Review: PASS (3/3)

| Sub-test | Description | Result |
|----------|-------------|--------|
| 6.1 | `POST /api/themes/upload` — multipart upload, manifest validation, zip extraction | PASS |
| 6.2 | `GET /api/themes` — list themes with id/name/version/description/renderer | PASS |
| 6.3 | `DELETE /api/themes/{themeId}` — kebab-case validation, directory removal | PASS |

**Security Review:**
- Path traversal protection: zip entries checked for `..` and absolute paths
- File extension whitelist: `ALLOWED_EXTENSIONS` set for safe file types
- Size limits: `MAX_BUNDLE_SIZE = 200MB`, manifest limited to 256KB
- Kebab-case ID validation prevents directory injection
- Manifest validated against Zod-equivalent Rust checks (semver, v2/v3 branching)

**Result: FAIL (build dependency) / Code Review PASS (3/3)**

---

## Test 7 — Regression Testing

| Sub-test | Page | Viewport | Result | Screenshot |
|----------|------|----------|--------|------------|
| 7.1 | Login | Desktop | PASS | — |
| 7.2 | Chat | Desktop | PASS (conversation list, empty state) | — |
| 7.3 | Office | Desktop | PASS (3D room, status bar) | `06-office-room.png` |
| 7.4 | Settings | Desktop | PASS (Profile form, Appearance panel) | `05-settings-quality.png` |
| 7.5 | Wallet | Desktop | PASS (balance, top-up, transactions) | — |
| 7.6 | Chat | Mobile (390×844) | PASS (bottom nav, FAB button) | `08-mobile-chat.png` |
| 7.7 | Office | Mobile (390×844) | PASS (3D room, status bar, bottom nav) | `09-mobile-office.png` |
| 7.8 | Spaces | Desktop | PASS ("Coming Soon" placeholder) | — |

**Console Errors:**
- `SSE 503` on `/api/office/stream` — Expected (office stream service not running in test env)
- `THREE.Clock` deprecation warning — Non-blocking, upstream Three.js issue
- No unexpected JavaScript errors observed

**Result: PASS (8/8)**

---

## Screenshots Index

| File | Description |
|------|-------------|
| `01-theme-store-list.png` | Theme Store grid with 5 theme cards |
| `02-theme-store-empty.png` | Empty state with combined filters |
| `03-theme-detail-cozy.png` | Cozy Studio detail page (desktop) |
| `04-theme-detail-mobile.png` | Theme detail responsive mobile view |
| `05-settings-quality.png` | Settings Appearance — Theme Quality toggle |
| `06-office-room.png` | Office 3D room (desktop) |
| `07-office-working.png` | CharacterModal with agent "Linda" |
| `08-mobile-chat.png` | Chat page mobile view (390×844) |
| `09-mobile-office.png` | Office page mobile view (390×844) |

---

## Bugs Found

### BUG-S2-001: Rust server build fails — `zip` crate yanked (BLOCKING)

- **Severity:** Critical (blocks server deployment)
- **Location:** `Cargo.toml` — `zip = "2.5"`
- **Issue:** All versions matching `^2.5` (2.5.0, 2.6.0, 2.6.1) are yanked on crates.io. `cargo build` fails with dependency resolution error.
- **Impact:** Theme Upload API (`POST /api/themes/upload`) cannot be deployed. Existing endpoints unaffected (old server image still runs).
- **Fix:** Change to `zip = "2.4"` (latest non-yanked 2.x) or pin to a specific non-yanked version, or use the `zip` crate's `2.3.x` line.

---

## Commit Coverage

| Commit | Description | Tested By |
|--------|-------------|-----------|
| `f9ebacf` | chat-store: clear thinkingAgents on sync_response | Test 1.1 |
| `22e22da` | chat-store: clean thinkingAgents on leave/delete/kicked | Test 1.2, 1.3 |
| Theme Store list commits | themes/page.tsx — search, price filter, tag chips | Test 2 |
| Theme Detail commits | themes/[themeId]/page.tsx — detail page layout | Test 3 |
| Quality mode commits | settings/page.tsx, threejs-renderer.ts | Test 4 |
| CharacterModal commits | character-modal.tsx, types.ts | Test 5 |
| Theme Upload API commits | themes.rs, theme.ts schema, mod.rs | Test 6 |
| Office plugin commits | state.ts, hooks.ts | Test 5 (indirect) |

---

## Recommendations

1. **Fix zip crate dependency immediately** — This blocks all server builds. Recommend `zip = "0.6"` or `zip = "2.4"` (check which API is used in `themes.rs`).
2. **Add E2E test for theme upload** — Once server builds, test the full upload flow with a sample `.zip` bundle.
3. **Consider preloading theme manifests** — The detail page calls `loadTheme()` client-side to derive quality modes. For SEO/performance, consider moving this to server-side or static generation.
4. **THREE.Clock deprecation** — The Three.js warning (`THREE.THREE.Clock`) suggests a double-namespace import. Non-blocking but worth cleaning up.
