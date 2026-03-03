# QA Report: Cozy Studio with Kenney Furniture Kit Assets

**Date:** 2026-02-26
**Branch:** jiumi (commits eb6e89b + c7a1867 + 18ababf)
**Tester:** Claude QA
**Environment:** Docker (web=192.168.68.83:21000, server=:3501, postgres=:21003)

---

## Summary: PASS 10 / SKIP 0 / FAIL 0 — 10 total checks

---

## A. 3D Scene Quality (Core)

| # | Test | Result |
|---|------|--------|
| A1 | Cozy Studio loads with Three.js | **PASS** — Three.js r183 WebGL canvas renders. All 13 GLB models loaded 200 OK (12 furniture + 1 character). No loading errors in console. |
| A2 | Furniture quality — Kenney assets vs old geometric shapes | **PASS** — Significant improvement. 80 visible meshes (up from 46 with old assets). Kenney low-poly models have recognizable furniture shapes: desk with wooden top and blue panel, office chair with swivel base, bookshelf with colored books on shelves, potted plants, floor lamp with shade. Much better than the previous plain colored blocks. |
| A3 | Room shell — wood floor, warm walls, window | **PASS** — room.glb (4.4KB, simplified from 75KB) renders a room enclosure with dark gray walls and a large window/panel element at top. Brown/warm-toned floor. The room is simpler than the concept art but provides a clean enclosure for the furniture. |
| A4 | Furniture placement — all items present | **PASS** — 12 furniture items confirmed in scene: room-shell, desk, chair, monitor, bookshelf, bean-bag, coffee-table, plant, floor-lamp, rug, wall-art (laptop), plant-small. All positioned per theme.json coordinates. Items visible at correct locations in the 3D scene. |
| A5 | 3D character — arinova-bot.glb redesign | **PASS** — New `arinova-bot.glb` (55KB, "Q-style 3D mascot") loads from `/office/models/arinova-bot.glb`. Character has distinct head and body shape with pink/skin tone and teal accents. Positioned correctly at work-area desk (working) or lounge bean-bag (idle). Agent group has 4 children: bot model, hit-box, name label sprite, status dot. |
| A6 | Overall atmosphere — closer to concept art? | **PASS (incremental)** — The Kenney furniture kit provides recognizable 3D objects (desks, chairs, bookshelves with books, plants). This is a clear step up from the previous geometric color blocks. The Q-style mascot character adds personality. However, the scene is still more minimal than the concept art's warm illustrated style — the room shell is simpler (flat walls vs. the concept's detailed wood paneling, curtains, and window light). The warm color scheme (bgColor 0xf5f0e8, warm nameTag colors) bridges the gap. Overall: moving in the right direction. |

---

## B. Interaction

| # | Test | Result |
|---|------|--------|
| B1 | Click character → modal opens | **PASS** — Clicking at agent's projected screen position triggers raycasting against invisible hit-box (CylinderGeometry). Modal opens with Linda (PM), Working/Idle status, Sprint 2 task (P1, 60%), subtask checklist, activity timeline. Identical behavior to previous version. |
| B2 | Name tag warm style | **PASS** — Verified programmatically: `nameTagColor = "#4A3728"` (warm dark brown), `nameTagBgColor = "rgba(255,245,230,0.75)"` (warm cream). Applied to both agent name labels and zone label sprites ("WORK AREA" at world 183,55,-85 and "LOUNGE" at -168,55,-85). |

---

## C. Theme Switching

| # | Test | Result |
|---|------|--------|
| C1 | Switch to Starter Desk → normal | **PASS** — Applied Starter Desk, Three.js renderer destroyed and PixiJS renderer initialized. Starter Desk pixel art room renders correctly with REST AREA / WORK AREA labels and mascot character. |
| C2 | Switch back to Cozy Studio → restores | **PASS** — Re-applied Cozy Studio, Three.js re-initializes (WebGLShadowMap warning confirms fresh renderer). All furniture GLBs and character model reload correctly. |

---

## D. Mobile

| # | Test | Result |
|---|------|--------|
| D1 | Mobile (390×844) displays correctly | **PASS** — Three.js canvas resizes to mobile width. Orthographic camera adjusts frustum proportionally. Room shell, furniture, and Q-style character all visible. Bottom nav bar (Chat, Office, Arinova, Friends, Settings) renders below canvas. Agent character is actually more distinguishable at mobile scale due to proportionally larger rendering. |

---

## Asset Comparison: Old vs Kenney

| Metric | Old Assets (f359a06) | Kenney Assets (eb6e89b) |
|--------|---------------------|------------------------|
| Visible meshes | 46 | 80 (+74%) |
| room.glb size | 75 KB | 4.4 KB (-94%) |
| arinova-bot.glb | shared generic model | 55 KB (new Q-style mascot) |
| desk.glb | 16.5 KB | 14.6 KB |
| chair.glb | 14.8 KB | 36.2 KB (+detailed swivel) |
| bookshelf.glb | 36 KB | 16.3 KB (with colored books) |
| Furniture items | 11 | 12 (+plant-small) |
| Visual quality | Plain colored geometric shapes | Recognizable low-poly furniture |

---

## Technical Notes

### New Assets
- **Kenney Furniture Kit**: CC0-licensed low-poly furniture models (`LICENSES.md` added)
- **Build scripts**: `build_furniture.py` (515 lines) generates all furniture GLBs, `build_arinova_bot_trimesh.py` generates the Q-style character
- **Preview renders**: Each furniture model has a `preview-*.png` render for reference
- **Shared asset directory**: `/office/models/furniture/` — 11 shared furniture GLBs that can be reused by other themes

### Character Redesign (c7a1867)
- **arinova-bot.glb**: New 55KB Q-style 3D mascot built with trimesh
- Character has distinct head/body proportions (chibi/Q-style)
- Pink/skin body tones with teal/cyan accents matching Arinova brand
- Replaces the previous generic shared bot model

### theme.json Changes
- `wall-art` renamed to `laptop` at (1320, 400) with smaller size (60x40)
- New `plant-small` at (1150, 380) with size (50x80)
- 12 furniture items total (was 11)
- All other settings unchanged (zones, seats, nameTag colors, background)

### Console Output
- **Errors**: 1 — `/api/office/stream` returns 503 (expected — SSE not running in test env)
- **Warnings**: 1 — `PCFSoftShadowMap` deprecation (cosmetic)
- **No GLB loading errors** — all 13 models loaded 200 OK

---

## Suggestions for Future Improvement

1. **Room shell detail**: The simplified 4.4KB room.glb provides basic walls but lacks the warmth of the concept art (wood paneling, window with curtains, natural lighting). A more detailed room model would significantly improve atmosphere.

2. **Furniture scale**: Items appear small at default orthographic zoom. Consider increasing furniture dimensions in theme.json or adjusting the `WORLD_SCALE` / camera frustum.

3. **Theme registry sync**: Still shows "illustrated" description and tags — should be updated to "3D" to match the Three.js renderer.

---

## Screenshots

| File | Description |
|------|-------------|
| `01-scene-overview.png` | Full 3D scene overview with Kenney furniture |
| `02-furniture-detail.png` | Canvas container detail view |
| `03-character.png` | Scene with Q-style agent character at work area |
| `04-agent-modal.png` | Agent modal (Linda PM) over 3D scene |
| `05-mobile.png` | Mobile viewport (390×844) |
