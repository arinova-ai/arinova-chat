# QA Report: Cozy Studio Three.js 3D Theme

**Date:** 2026-02-26
**Branch:** jiumi (commits f359a06 + 9b60141)
**Tester:** Claude QA
**Environment:** Docker (web=192.168.68.83:21000, server=:3501, postgres=:21003)

---

## Summary: PASS 12 / SKIP 0 / FAIL 0 — 12 total checks

---

## A. Theme Store + Selection

| # | Test | Result |
|---|------|--------|
| A1 | Theme Store shows Cozy Studio with correct info | **PASS** — Listed as "Cozy Studio" with FREE badge, description "A warm illustrated studio with wood floors, bookshelves, and cozy furniture.", tags `#warm #cozy #illustrated`, 1 agent max. |
| A2 | Selecting Cozy Studio → Office loads 3D scene | **PASS** — After applying Cozy Studio, Office page loads Three.js WebGL canvas (confirmed `data-engine="three.js r183"`). Canvas renders at full container size (1184×643 at desktop). |

**Note:** Theme registry description says "illustrated" and tags `#warm #cozy #illustrated`, but `theme.json` has been updated to `["warm", "cozy", "3d", "free"]` with `renderer: "threejs"`. The registry entry should be updated to match (minor discrepancy, non-blocking).

---

## B. Three.js 3D Scene Rendering

| # | Test | Result |
|---|------|--------|
| B1 | Background color is warm beige (0xf5f0e8) | **PASS** — Verified programmatically: `renderer.bgColor = 0xf5f0e8`. Ground plane, fog, and canvas surround all use warm cream color instead of the default dark navy (`0x1a1a2e`). |
| B2 | All 11 furniture GLB models load (200 OK) | **PASS** — Network requests confirm all 11 models loaded successfully: `room.glb`, `desk.glb`, `chair.glb`, `monitor.glb`, `bookshelf.glb`, `bean-bag.glb`, `coffee-table.glb`, `plant.glb`, `floor-lamp.glb`, `rug.glb`, `wall-art.glb`. Plus `arinova-bot.glb` (3D character) from `/office/models/`. |
| B3 | Room shell fills world space | **PASS** — Room shell GLB model uses special non-uniform scaling (`worldW/size.x`, `worldH/size.z`) to span the full 960×540 world-unit footprint (1920×1080 canvas × WORLD_SCALE 0.5). Visible as a 3D room with tan/sandy walls, panel divisions, and interior surfaces. |
| B4 | 3D agent character rendered at seat position | **PASS** — Agent "Linda" (the single mock agent, `maxAgents: 1`) has a Three.js Group with 4 children: bot model (Group/GLB clone), invisible hit-box (Mesh/CylinderGeometry), name label (Sprite), status dot (Mesh). Positioned at work-area desk-1 seat in world coords (195, 0, -10) when "working", and lounge bean-1 seat (-130, 0, -20) when "idle". |
| B5 | Warm name tags (cream bg + dark brown text) | **PASS** — Verified programmatically: `nameTagColor = "#4A3728"` (warm dark brown), `nameTagBgColor = "rgba(255,245,230,0.75)"` (warm cream semi-transparent). These override the default cold-palette (`#e2e8f0` on `rgba(15,23,42,0.85)`). Applied to both agent name tags and zone labels via `createLabelSprite()`. |
| B6 | Zone floors use warm darkened color | **PASS** — Zone floor color computed via `darkenColor(0xf5f0e8, 0.08)` producing a slightly darker warm tint. Two zones confirmed in scene: "WORK AREA" label sprite at (183, 55, -85) and "LOUNGE" label sprite at (-168, 55, -85). Both zone label positions mathematically verified against manifest zone bounds. Total scene: 84 objects (46 meshes, 4 lights, 3 sprites). |
| B7 | Click character → agent modal opens | **PASS** — Clicking at Linda's projected screen position (797, 450) triggers raycasting against invisible hit-box. Modal opens with full agent details: Linda (PM), Working/Idle status, Current Task "Sprint 2 進度管理" (P1, 60%), subtask checklist (3/5 done), Recent Activity timeline. |

---

## C. Theme Switching

| # | Test | Result |
|---|------|--------|
| C1 | Switch to Starter Desk → PixiJS renders correctly | **PASS** — Applied Starter Desk from Theme Store. Office page switches from Three.js to PixiJS renderer. Pixel art isometric room renders with full background, REST AREA and WORK AREA labels, mascot character on bed (idle). No errors. |
| C2 | Switch back to Cozy Studio → 3D scene restores | **PASS** — Re-applied Cozy Studio. Office page re-initializes Three.js (WebGLShadowMap warning confirms fresh renderer). 3D room, furniture GLBs, agent character all restore identically. No artifacts from the renderer switch. |

---

## D. Mobile Viewport

| # | Test | Result |
|---|------|--------|
| D1 | Mobile (390×844) renders 3D scene correctly | **PASS** — Three.js canvas resizes to mobile width. Orthographic camera adjusts frustum for new aspect ratio. Room shell, furniture, and ground plane all visible. Bottom nav bar (Chat, Office, Arinova, Friends, Settings) renders correctly below the 3D canvas. |

---

## Technical Notes

### Three.js Renderer (threejs-renderer.ts)
- **Engine**: Three.js r183 (OrthographicCamera, WebGLRenderer)
- **Camera**: Position (0, 600, 350), lookAt (0, 0, 0), frustum 500, ~60° elevation angle
- **Lighting**: Warm-tinted directional (0xfff5e6, 0.8 intensity), cool fill (0xc4d4ff, 0.3), hemisphere (sky 0x87ceeb / ground 0x362d22), ACES Filmic tone mapping @ 1.2 exposure
- **WORLD_SCALE**: 0.5 (canvas coords × 0.5 = world units)
- **BOT_HEIGHT**: 40 world units, agent name tag at y=52
- **Agent LERP**: 0.08 factor for smooth position transitions
- **Shadows**: PCFShadowMap (PCFSoftShadowMap deprecated warning)

### Warm Theme Customization (from theme.json)
| Property | Default (Dark) | Cozy Studio (Warm) |
|---|---|---|
| Background | `0x1a1a2e` (dark navy) | `0xf5f0e8` (warm cream) |
| Ground plane | Dark navy | Warm cream |
| Zone floor | 8% darker navy | 8% darker cream |
| Name tag text | `#e2e8f0` (light slate) | `#4A3728` (dark brown) |
| Name tag bg | `rgba(15,23,42,0.85)` | `rgba(255,245,230,0.75)` |

### GLB Models (11 furniture + 1 character)
- Room shell: Non-uniform scaling to fill 960×540 world footprint
- Furniture: Uniform scaling `max(w,h) * 0.25` world units, positioned via `canvasToWorld()`
- Character: `arinova-bot.glb` from `/office/models/`, normalized to 40 world units height
- All models cast and receive shadows

### Console Output
- **Errors**: 1 — `/api/office/stream` returns 503 (SSE endpoint not running in test env — expected)
- **Warnings**: 1 — `THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead.` (cosmetic, non-blocking)
- **No GLB loading errors** — all 12 models (11 furniture + 1 character) loaded 200 OK

---

## Minor Issues (Non-blocking)

1. **Theme registry description mismatch**: `theme-registry.ts` still says "A warm illustrated studio" and tags `#warm #cozy #illustrated`, but `theme.json` was updated to `renderer: "threejs"` with tags `["warm", "cozy", "3d", "free"]`. Consider updating the registry description and tags to reflect the 3D renderer.

2. **PCFSoftShadowMap deprecation**: Three.js r183 warns that PCFSoftShadowMap is deprecated. Consider switching to `PCFShadowMap` in `setupLighting()` to suppress the warning.

3. **3D models appear small**: The furniture GLB models (desk, chair, monitor, etc.) are relatively small compared to the room shell. At default zoom the individual pieces are hard to distinguish. This is a design/art direction consideration rather than a bug.

---

## Screenshots

| File | Description |
|------|-------------|
| `01-theme-store.png` | Theme Store with Cozy Studio listed as Applied |
| `02-office-3d-scene.png` | Office — Cozy Studio 3D scene (desktop) |
| `03-3d-scene-detail.png` | 3D scene detail — canvas container view |
| `04-3d-agent-character.png` | 3D scene with agent character (Working status) |
| `05-agent-modal.png` | Agent modal (Linda PM) over 3D scene |
| `06-starter-desk-theme.png` | Starter Desk PixiJS theme (for comparison) |
| `07-cozy-studio-restored.png` | Cozy Studio restored after theme switch |
| `08-mobile-3d-scene.png` | Mobile (390×844) — 3D scene with bottom nav |
