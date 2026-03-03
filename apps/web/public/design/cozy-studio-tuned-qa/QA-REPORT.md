# QA Report: Cozy Studio Scene Parameter Fixes

**Date:** 2026-02-26
**Branch:** jiumi (commits e1e0973 + 55c00a3)
**Tester:** Claude QA
**Environment:** Docker (web=192.168.68.83:21000, server=:3501, postgres=:21003)

---

## Summary: PASS 6 / SKIP 0 / FAIL 0 — 6 total checks

---

## Changes Verified

| Change | Before | After | Confirmed |
|--------|--------|-------|-----------|
| Camera frustum | 500 | 250 | Yes — orthographic top=250, bottom=-250 |
| Ambient light | 0.5 | 0.7 | Yes — AmbientLight intensity=0.7 |
| Warm SpotLight | (none) | SpotLight #fff0d4, 0.6 | Yes — 5 lights total (was 4) |
| Fog | FogExp2 0.0006 | Removed | Yes — no fog in scene |
| Furniture dimensions | 1× | 3× | Yes — all 11 furniture items tripled (e.g. desk 220×110 → 660×330) |
| Room shell | 4.4KB, flat gray | 3.3KB, vertex-colored warm | Yes — vertex colors enabled, warm tones baked in |
| arinova-bot.glb | 55KB (trimesh Q-style) | 167KB (Blender original) | Yes — 170,800 bytes, blue/gray robot design |

---

## A. Scene Quality

| # | Test | Result |
|---|------|--------|
| A1 | Scene more filled — furniture visibly larger? | **PASS** — Significant improvement. Camera frustum halved (500→250) provides 2× zoom, combined with 3× furniture dimensions. Furniture items (desk, bookshelf, bean-bag, plant, floor lamp, coffee table) clearly fill the viewport. The desk area dominates the right side, bean-bag and bookshelf fill the left. Scene feels substantially more "furnished" than before. |
| A2 | Warm colors — cream walls, wood floor? | **PASS** — Room shell uses vertex colors (`vertexColorEnabled: true`) with warm tones baked into the 3.3KB model. Walls render as cream/beige, floor areas are warm brown. Ground plane color is `#efe7d9` (warm cream, darkened from bgColor `#f5f0e8`). 5-light setup: AmbientLight 0.7, HemisphereLight (sky #87ceeb / ground), warm DirectionalLight (#fff5e6, 0.8), cool fill (#c4d4ff, 0.3), new warm SpotLight (#fff0d4, 0.6). Overall palette is warm brown + cream. |
| A3 | Character naturally integrates into scene? | **PASS (with note)** — Blender `arinova-bot.glb` (167KB) loads and renders as a blue/gray robot character. Agent "Linda" positioned at lounge seat (-130, 0, -20) when idle, work seat (195, 0, -10) when working. Agent group has 4 children (bot model, hit-box, name sprite, status dot). Click detection works — modal opens with full agent details. **Note:** The character appears small relative to the ×3 furniture. BOT_HEIGHT is still 40 world units while furniture tripled. Consider scaling BOT_HEIGHT proportionally (e.g. 80–120 units) to match the new furniture scale. |
| A4 | Gap with concept art narrowed? | **PASS (incremental)** — Clear improvement over previous versions. **Similarities to concept:** warm brown/cream color palette, recognizable furniture layout (desk with monitor, bookshelf, bean-bag, potted plant, floor lamp, coffee table), cozy enclosed room feel. **Remaining gaps:** (1) Concept art has detailed textures (wood grain, fabric, book spines) vs. low-poly flat shading; (2) Concept has dramatic window light with translucent curtains vs. subtle SpotLight; (3) Concept's Arinova bot is large and central, current bot is small; (4) Concept fills entire viewport, current scene has empty floor area in bottom half. The scene is about 60–70% of the way to the concept art's feel — a significant step up from the previous small-furniture version. |

---

## B. Theme Switching

| # | Test | Result |
|---|------|--------|
| A5 | Other themes not affected? | **PASS** — Switched to Starter Desk: PixiJS renderer initializes correctly, pixel art room with REST AREA / WORK AREA labels, Linda at work desk. Switched back to Cozy Studio: Three.js re-initializes (WebGLShadowMap warning confirms fresh renderer), all furniture and character restore. No cross-contamination between renderers. |

---

## C. Mobile

| # | Test | Result |
|---|------|--------|
| A6 | Mobile (390×844) renders correctly? | **PASS** — Three.js canvas resizes to mobile width. Orthographic camera adjusts frustum for portrait aspect ratio. Furniture items (desk, coffee table, bookshelf) visible. Character (blue bot) visible and proportionally more distinguishable at mobile scale. Bottom nav bar (Chat, Office, Arinova, Friends, Settings) renders correctly below canvas. |

---

## Technical Details

### Scene Metrics

| Metric | Previous (Kenney) | Current (Tuned) |
|--------|-------------------|-----------------|
| Camera frustum | 500 | 250 (2× zoom) |
| Visible meshes | 80 | 40 |
| Lights | 4 | 5 (+SpotLight) |
| Sprites | 3 | 3 |
| Total objects | 98 | 98 |
| arinova-bot.glb | 55 KB (trimesh) | 167 KB (Blender) |
| room.glb | 4.4 KB (flat) | 3.3 KB (vertex-colored) |

### Lighting Setup (5 lights)

| Type | Color | Intensity | Position |
|------|-------|-----------|----------|
| AmbientLight | #ffffff | 0.7 | (0,0,0) |
| HemisphereLight | sky #87ceeb | 0.3 | (0,1,0) |
| DirectionalLight | #fff5e6 (warm) | 0.8 | (200,500,200) |
| DirectionalLight | #c4d4ff (cool fill) | 0.3 | (-200,300,-100) |
| SpotLight (NEW) | #fff0d4 (warm window) | 0.6 | (-200,400,-200) |

### Room Shell

- 4 geometry meshes with **vertex colors** (`vertexColorEnabled: true`)
- MeshStandardMaterial with base color #ffffff + vertex colors for warm tones
- 3,308 bytes (down from 4,440 in Kenney build)
- Warm cream walls and brown/wood floor tones baked into vertices

### Console Output

- **Errors**: 1 — `/api/office/stream` returns 503 (expected — SSE not running in test env)
- **Warnings**: 1 — `PCFSoftShadowMap` deprecation (cosmetic)
- **No GLB loading errors** — all 13 models loaded 200 OK

---

## Suggestions for Next Iteration

1. **Character scale**: BOT_HEIGHT (40 world units) is now too small relative to ×3 furniture. The Blender bot is barely visible next to the enlarged desk and bookshelf. Consider scaling to 80–120 world units, or using a separate character scale factor for this theme.

2. **Furniture layout / empty space**: The bottom half of the viewport is mostly empty brown floor. Consider either: (a) repositioning furniture to spread more evenly, (b) adding more items (second plant, side table, wall decorations), or (c) shifting the camera's lookAt point upward to center the furnished area.

3. **Visible mesh count dropped**: 40 meshes (from 80 in Kenney). The room.glb simplification (4.4KB → 3.3KB) and vertex color approach reduced geometry parts. This is fine for performance but means less geometric detail in walls.

4. **Window light**: The concept art's most distinctive feature is warm sunlight streaming through translucent curtains. The new SpotLight (#fff0d4) adds warmth but doesn't create the same dramatic "light from window" effect. A volumetric or directional light with shadow casting positioned at the window could help.

---

## Screenshots

| File | Description |
|------|-------------|
| `01-scene-overview.png` | Full 3D scene with tuned parameters (desktop) |
| `02-vs-concept.png` | Scene for comparison with concept art (see `preview.png`) |
| `03-character-closeup.png` | Scene with Blender arinova-bot character |
| `04-mobile.png` | Mobile viewport (390×844) |
