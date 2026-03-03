# QA Report — Unified Character Modal + Mock Data

**Branch:** `jiumi`
**Commit:** `c5bdb59` (fix(office): unify character modal and enrich mock data for demo mode)
**Date:** 2026-02-28
**Tester:** Claude Code (Opus 4.6)
**Environment:**
- Web: `http://192.168.68.83:21000` (Docker, Next.js)
- API: `http://192.168.68.83:21001` (Docker, Rust)
- Browser: Playwright Chromium 1280×800 (mobile tests at 375×812)

---

## Summary

| # | Test Case | Result | Method |
|---|-----------|--------|--------|
| 1 | Single modal on hitbox click (not two) | **PASS** | Browser |
| 2 | Close → re-click → still only one modal | **PASS** | Browser |
| 3 | Modal header: emoji + name + role + status badge | **PASS** | Browser |
| 4 | Plugin stats: model, tokens, session, tool | **PASS** | Browser |
| 5 | Task: title, priority, due date, progress bar, subtasks | **PASS** | Browser |
| 6 | Recent activity timeline | **PASS** | Browser |
| 7 | Chat button at bottom | **PASS** | Browser |
| 8 | Non-sprite (PixiJS) theme: AgentModal still works | **PASS** | Code review |
| 9 | Mobile (375px): responsive bottom sheet | **PASS** | Browser |

**Overall: 9/9 PASS — no bugs found**

---

## Test 1 — Double Modal Fix

**Before (bug):** Sprite renderer's `handleHitboxClick` called both `onCharacterClick()` and `onAgentClick()`, opening two separate modals stacked on top of each other.

**After (fix):**
- `sprite-renderer.ts:517-519` — `handleHitboxClick` now only calls `this.onCharacterClick?()`
- `office-view.tsx:106` — `AgentModal` is conditionally rendered: `{manifest?.renderer !== "sprite" && <AgentModal ... />}`

**Verification:** Clicked hitbox → `document.querySelectorAll('[role="dialog"]').length === 1` (only ONE dialog).

### Test 2 — Re-click After Close

Closed modal via Close button → clicked hitbox again → `dialogCount === 1`. Consistent behavior across multiple open/close cycles.

---

## Tests 3–7 — Unified Modal Content (Demo Mode)

All sections verified in a single unified `CharacterModal`:

### Test 3 — Header

| Element | Value | Status |
|---------|-------|--------|
| Emoji with colored bg | 📋 on `#E8D5F5` circle | PASS |
| Agent name | Linda | PASS |
| Role badge | PM | PASS |
| Status badge | Idle (yellow dot + label) | PASS |

### Test 4 — Plugin Stats

| Stat | Value | Status |
|------|-------|--------|
| Model | `claude-sonnet-4-6` (monospace) | PASS |
| Tokens | `42.3K in / 18.7K out` | PASS |
| Session | `1h 2m` | PASS |
| Tool | `list_tasks (120ms)` (monospace) | PASS |

All values match `mock-data.ts` Linda entry: `tokenUsage: { input: 42_300, output: 18_700 }`, `sessionDurationMs: 3_720_000` (= 1h 2m), `currentToolDetail: "list_tasks (120ms)"`.

### Test 5 — Task Section

| Element | Value | Status |
|---------|-------|--------|
| Priority tag | P1 (yellow monospace badge) | PASS |
| Title | Sprint 2 進度管理 | PASS |
| Due date | 2026-03-07 | PASS |
| Assigned by | Ripple | PASS |
| Progress bar | 60% (amber fill) | PASS |
| Subtasks | 5 items: 3 ✓ (green, strikethrough), 2 ○ (pending) | PASS |

### Test 6 — Recent Activity

| Time | Text | Status |
|------|------|--------|
| 15:30 | 派發 MVP 實作給 Ron | PASS |
| 15:20 | 確認 Alice 概念設計通過 | PASS |
| 14:50 | 向 Ripple 報告進度 | PASS |

### Test 7 — Chat Button

Orange button with "Chat" label at bottom of modal — visible and styled correctly.

---

## Test 8 — Non-Sprite (PixiJS) Theme

Switched to `default-office` theme via localStorage (`arinova-office-theme`). PixiJS canvas rendered with all 5 agents (Linda, Alice, Ron, Casey, Vivi) in Work Area zones.

**Code review confirms:**
- `office-view.tsx:106-108` — `AgentModal` is rendered when `manifest?.renderer !== "sprite"`
- `pixi-renderer.ts:727` — `onAgentClick` callback fires on agent click
- `agent-modal.tsx` — Shows header (emoji, name, role, status), current task, recent activity, collaborators

> **Note:** PixiJS canvas interaction couldn't be tested via Playwright (canvas hit detection doesn't respond to dispatched events). Verified via code review + visual confirmation of rendered agents.

---

## Test 9 — Mobile Responsive (375×812)

On mobile viewport (375×812), the modal renders as a **bottom Sheet** instead of a centered Dialog:

- `max-h-[70vh]` — doesn't cover full screen
- `overflow-y-auto` — scrollable for long content
- `rounded-t-2xl` — rounded top corners
- All sections visible: header, plugin stats, task, activity

**Verified via `window.matchMedia("(max-width: 767px)")` detection in `CharacterModal`.**

---

## Mock Data Coverage

All 5 agents now have enriched mock data:

| Agent | Role | Model | Tokens | Session | Tool | Task |
|-------|------|-------|--------|---------|------|------|
| Linda | PM | claude-sonnet-4-6 | 42.3K/18.7K | 1h 2m | list_tasks | Sprint 2 進度管理 (P1, 60%) |
| Alice | UI/UX Designer | claude-sonnet-4-6 | 28.4K/15.2K | 43m | generate_image | 虛擬辦公室 Design Spec (P2, 35%) |
| Ron | Developer | claude-opus-4-6 | 156.8K/89.4K | 1h 39m | edit_file | Virtual Office Sprint 2 (P1, 55%) |
| Casey | Code Reviewer | claude-opus-4-6 | 98.5K/34.2K | 1h 10m | read_file | 架構審查 (P1, 40%) |
| Vivi | QA Tester | claude-haiku-4-5 | 12.8K/5.4K | 31m | run_tests | Smoke Test Sprint 2 (P2, 80%) |

---

## Screenshots Index

| File | Description |
|------|-------------|
| `modal-01-single-dialog.png` | Unified modal — single dialog, all sections visible (desktop) |
| `modal-02-sleeping-modal.png` | Modal after close + re-click — still single dialog |
| `modal-03-pixijs-office.png` | PixiJS default-office theme with 5 agents |
| `modal-04-pixijs-current.png` | PixiJS theme working state |
| `modal-05-mobile-sheet.png` | Mobile bottom sheet modal (375×812) |

---

## Files Changed

| File | Change |
|------|--------|
| `character-modal.tsx` | +165/-46 — Unified modal with plugin stats, task, activity, collaborators sections |
| `mock-data.ts` | +35/-1 — Added model, tokenUsage, sessionDurationMs, currentToolDetail, currentTask for all agents |
| `office-view.tsx` | +9/-1 — Skip AgentModal for sprite themes, pass agents array to CharacterModal |
| `sprite-renderer.ts` | -3 lines — Removed `onAgentClick` call from `handleHitboxClick` |

---

## Bugs Found

**None.**
