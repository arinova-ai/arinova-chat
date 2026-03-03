# QA Report: Cozy Studio Theme + Wallet Navigation

**Date:** 2026-02-26
**Branch:** jiumi (commits e474a39 + 09c0609)
**Tester:** Claude QA
**Environment:** Docker (web=192.168.68.83:21000, server=:3501)

---

## Summary: PASS 13 / SKIP 0 / FAIL 0 — 13 total checks

---

## A. Cozy Studio Theme

| # | Test | Result |
|---|------|--------|
| A1 | Theme Store (/office/themes) shows Cozy Studio (no Starter Desk 3D) | **PASS** — "Cozy Studio" listed with FREE badge, description "A warm illustrated studio with wood floors, bookshelves, and cozy furniture.", tags #warm #cozy #illustrated. No "Starter Desk 3D" anywhere. |
| A2 | Cozy Studio preview is warm-colored room | **PASS** — Preview image shows warm isometric illustrated room with wood floors, bookshelves, bean bag, plants, desk with monitor, and Arinova mascot |
| A3 | Selecting Cozy Studio → Office shows warm isometric room background | **PASS** — After applying Cozy Studio, Office page renders the full illustrated background via PixiJS with character sprite at desk |
| A4 | Background image fills canvas (not dark bg + small color blocks) | **PASS** — `background-cozy.png` fills the entire 1920x1080 canvas. No fallback dark background visible. |
| A5 | Agent character at desk position | **PASS** — "Linda" character sprite rendered at the WORK AREA zone (desk-1 seat at x:1200 y:600) with name tag and idle animation |
| A6 | Click character → modal opens | **PASS** — Clicking character opens dialog with agent details: Linda (PM), Current Task "Sprint 2 進度管理" (P1, 60%), subtask checklist, recent activity timeline |
| A7 | Switch to default (Modern Office) → works normally | **PASS** — Applied Modern Office, Office page shows dark background with zone labels (MEETING ROOM, WORK AREA, BREAK AREA) and agent avatar icons |
| A8 | Switch back to Cozy Studio → background restores | **PASS** — Re-applied Cozy Studio, Office page shows the warm illustrated room again, identical to first render |

**Screenshots:**
- `01-theme-store-cozy-studio.png` — Theme Store with Cozy Studio listed
- `02-office-cozy-studio-desktop.png` — Office with Cozy Studio theme (full screen)
- `02b-agent-modal-cozy-studio.png` — Agent modal over Cozy Studio
- `02c-modern-office-theme.png` — Modern Office theme (for comparison)
- `02d-cozy-studio-restored.png` — Cozy Studio restored after switch
- `03-mobile-cozy-studio.png` — Mobile view of Cozy Studio

---

## B. Wallet Navigation

| # | Test | Result |
|---|------|--------|
| B1 | Desktop icon-rail has Wallet entry | **PASS** — "Wallet" button with icon appears between Market and Settings in the left icon rail |
| B2 | Click Wallet → navigates to /wallet | **PASS** — Clicking navigates to `/wallet`, icon-rail highlights Wallet |
| B3 | Wallet page displays correctly (balance, plans, history) | **PASS** — Shows Current Balance (0 credits), 4 Top Up plans (Starter $5/500, Standard $10/1100+10%, Advanced $25/3000+20%, Pro $50/6500+30%), Transaction History |
| B4 | Mobile fan menu has Wallet option | **PASS** — Fan menu shows 5 buttons: Community, Theme, Market, Wallet, Spaces |
| B5 | Fan menu 5 buttons evenly distributed | **PASS** — Angles: -72, -36, 0, 36, 72 degrees (code verified in `mobile-bottom-nav.tsx:68`). Visual layout shows even arc distribution. |

**Note:** Desktop Wallet icon reuses the Market icon SVGs (no dedicated wallet icon asset). Mobile uses the Lucide `Wallet` icon. Consider adding a unique desktop icon for Wallet.

**Screenshots:**
- `04-desktop-wallet-icon-rail.png` — Desktop icon-rail showing Wallet
- `05-mobile-fan-menu-wallet.png` — Mobile fan menu with 5 buttons including Wallet
- `06-wallet-page.png` — Wallet page with balance, top-up plans, and history

---

## Technical Notes

### Cozy Studio Theme
- **theme.json**: Canvas 1920x1080, background `background-cozy.png`, single zone "work-area" at (900,350,700x450), one seat at (1200,600)
- **Renderer**: PixiJS (switched from Three.js GLB models to illustrated background image)
- **Furniture**: Empty array (furniture is part of the background image)
- **Character**: Reuses `mascot-sprite.png` sprite sheet (256x256 frames), same as Starter Desk
- **Mobile**: defaultZoom 0.6 with pinch-to-zoom support

### Wallet Navigation
- **icon-rail.tsx**: Added `wallet` entry with href `/wallet`, active path detection for `/wallet`
- **mobile-bottom-nav.tsx**: Added `wallet` entry with Lucide `Wallet` icon, fan angles updated from 4-item [-60,-20,20,60] to 5-item [-72,-36,0,36,72]

---

## Screenshots

| File | Description |
|------|-------------|
| `01-theme-store-cozy-studio.png` | Theme Store listing with Cozy Studio |
| `02-office-cozy-studio-desktop.png` | Office — Cozy Studio full desktop view |
| `02b-agent-modal-cozy-studio.png` | Agent modal (Linda PM) over Cozy Studio |
| `02c-modern-office-theme.png` | Office — Modern Office theme (comparison) |
| `02d-cozy-studio-restored.png` | Office — Cozy Studio restored after theme switch |
| `03-mobile-cozy-studio.png` | Mobile — Cozy Studio with character |
| `04-desktop-wallet-icon-rail.png` | Desktop icon-rail showing Wallet entry |
| `05-mobile-fan-menu-wallet.png` | Mobile fan menu with 5 buttons (incl. Wallet) |
| `06-wallet-page.png` | Wallet page — balance, top-up plans, history |
