# QA Report: Community Feature (Lounge + Hub)

**Date:** 2026-02-26
**Branch:** jiumi (commits e9774f0 → 7ac79aa)
**Tester:** Claude QA
**Environment:** Docker (web=192.168.68.83:21000, server=:3501, postgres=:21003)

---

## Summary: PASS 22 / SKIP 1 / FAIL 0 — 23 total checks

---

## 1. Community Browse Page (/community)

| # | Test | Result |
|---|------|--------|
| 1.1 | Page loads, shows community list | **PASS** — empty state "No communities found" on first load; cards appear after creation |
| 1.2 | Filter tabs: Browse / My Communities / Joined | **PASS** — all 3 tabs switch correctly; "My" shows "You haven't created any communities yet"; "Joined" shows "You haven't joined any communities yet" |
| 1.3 | Search (debounced) | **PASS** — typing "Paid" filters to only "QA Paid Hub"; clearing shows all |
| 1.4 | Type filter: All / Lounge / Hub | **PASS** — "Hub" shows only Hub communities; "Lounge" shows only Lounges |
| 1.5 | Card displays correct info (name, desc, type badge, pricing, member count, creator) | **PASS** — Hub=purple badge, Lounge=green badge; shows "5/mo" or "Free"; member count; "by RAG Tester" |
| 1.6 | Click card → navigates to detail | **PASS** — clicking "QA Paid Hub" card navigates to /community/{id} |

**Screenshots:** `01-browse-empty.png`, `05-browse-with-cards.png`

---

## 2. Create Community (/community/create)

| # | Test | Result |
|---|------|--------|
| 2.1 | Unauthenticated → redirect to login | **PASS** — /community/create with no session redirects to /login |
| 2.2 | Form shows: Name*, Description, Type (Lounge/Hub), Pricing (3 fields) | **PASS** — all fields present; char counter "0/100"; type toggle with descriptions; fee inputs with min=0 |
| 2.3 | Create button disabled until name filled | **PASS** — disabled when name empty; enabled after typing |
| 2.4 | Create Lounge (free) → success + redirect | **PASS** — created "QA Free Lounge", redirected to /community/{id} |
| 2.5 | Create Hub (paid) → success + redirect | **PASS** — "QA Paid Hub" with join=10, monthly=5, agent call=2; redirected to detail |
| 2.6 | Negative fee clamped to 0 on create | **PASS** — API accepted -5 join fee but stored as 0 (`.max(0)` clamping) |
| 2.7 | Empty name → validation error | **PASS** — API returns "Name must be 1-100 characters" |
| 2.8 | Invalid type → validation error | **PASS** — API returns "Type must be 'lounge' or 'hub'" |

**Screenshot:** `02-create-form.png`

---

## 3. Community Detail + Chat (/community/[id])

| # | Test | Result |
|---|------|--------|
| 3.1 | Detail shows community info (name, type badge, member count, fees) | **PASS** — "QA Free Lounge" with Lounge badge, 1 member; "QA Paid Hub" with Hub badge, "2/call" |
| 3.2 | Join gate (non-member): shows fee + Join button | **PASS** — free: "Free to join"; paid: "Join fee: 10 coins · 5 coins/month" |
| 3.3 | After join: chat interface with messages | **PASS** — messages from previous users visible; input enabled |
| 3.4 | Send text message | **PASS** — messages appear right-aligned in brand color (own messages) |
| 3.5 | Member sidebar: shows members + roles | **PASS** — sidebar shows "Members (1)" with "RAG Tester" as "creator" |
| 3.6 | SSE streaming with agent | **SKIP** — no OPENROUTER_API_KEY configured; no agents attached to community |

**Screenshots:** `03-detail-chat-empty.png`, `04-detail-chat-messages.png`, `08-join-gate-free.png`, `09-join-gate-paid.png`

---

## 4. Navigation Integration

| # | Test | Result |
|---|------|--------|
| 4.1 | Desktop: icon rail shows "Community" | **PASS** — visible in icon rail with globe icon, highlighted when on /community |
| 4.2 | Desktop: click navigates to /community | **PASS** — clicking "Community" in icon rail navigates correctly |
| 4.3 | Mobile: fan menu shows "Community" | **PASS** — radial fan menu from center button shows Community, Theme, Market, Spaces |
| 4.4 | Mobile: responsive layout | **PASS** — cards stack vertically; bottom nav replaces icon rail |

**Screenshots:** `06-mobile-browse.png`, `07-mobile-fan-menu.png`

---

## 5. Billing Verification

| # | Test | Result |
|---|------|--------|
| 5.1 | Join free community → no deduction | **PASS** — balance stayed at 100 after joining "QA Free Lounge" |
| 5.2 | Join paid community → correct deduction | **PASS** — balance 100→85; transactions: community_join (-10) + community_subscription (-5) |
| 5.3 | Creator receives 70% earning | **PASS** — creator got +7 coins (70% of 10 join fee) as "earning" transaction |
| 5.4 | Insufficient balance → join blocked | **PASS** — API returns 402 "Insufficient balance"; user not added as member |

---

## 6. Error Cases

| # | Test | Result |
|---|------|--------|
| 6.1 | Unauthenticated create → "Unauthorized" | **PASS** |
| 6.2 | Non-member GET messages → "You must be a member to view messages" | **PASS** |
| 6.3 | Non-member send message → "You must be a member to send messages" | **PASS** |

---

## Setup Notes

### DB Schema Fixes Required
The migration script (`migration.sql`) fails on re-run when marketplace columns (`model_id`, `model_provider`) have already been dropped. The community section of the migration needed manual execution.

Additionally, two column type mismatches were found and fixed:
1. `communities.created_at` / `updated_at`: TIMESTAMP → TIMESTAMPTZ (Rust code expects `DateTime<Utc>`)
2. `community_members.role`: `community_role` enum → TEXT (Rust code uses String, and enum values `{owner, admin, member}` don't match code expectations `{creator, moderator, member}`)

These should be fixed in the migration script for clean deployments.

### Environment Setup
- `NEXT_PUBLIC_API_URL=http://192.168.68.83:3501` required at web build time (baked into Next.js bundle)
- `CORS_ORIGIN=*` set for cross-origin testing between web (:21000) and API (:3501)
- `community_role` enum needed `creator` and `moderator` values added

---

## Screenshots

| File | Description |
|------|-------------|
| `01-browse-empty.png` | Browse page — empty state |
| `02-create-form.png` | Create community form |
| `03-detail-chat-empty.png` | Detail page — empty chat |
| `04-detail-chat-messages.png` | Detail page — with messages |
| `05-browse-with-cards.png` | Browse page — 3 community cards |
| `06-mobile-browse.png` | Mobile viewport — browse page |
| `07-mobile-fan-menu.png` | Mobile viewport — fan menu with Community |
| `08-join-gate-free.png` | Join gate — free community |
| `09-join-gate-paid.png` | Join gate — paid community with fees |
