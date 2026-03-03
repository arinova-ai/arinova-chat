# QA Report: Cozy Studio v3 — Renderer Upgrade

**Date:** 2026-02-26
**Branch:** jiumi (commits 1aa932e + e77ebe7)
**Tester:** Claude QA (static code review + TSC + live browser test)
**Build:** `npx tsc --noEmit` PASS

---

## Summary: PASS 22 / SKIP 0 / FAIL 2

### BLOCKING FAIL: `validateManifest()` rejects v3 theme

`theme-loader.ts:50` throws `"Manifest 'zones' must not be empty"` because v3 `theme.json` has `"zones": []`. Additionally, `theme-loader.ts:62` would throw for `"layers": []`. The validation was **not updated** for v3 themes that use `room.model` instead of zones/layers/furniture.

**Fix needed:** Skip zone/layer/seat validation when `room.model` is present (v3 path).

---

## T1: Theme Types

| # | Test | Result |
|---|------|--------|
| T1.1 | RoomConfig interface exists | **PASS** — `theme-types.ts:197-200`: `interface RoomConfig { model: string; scale?: [number, number, number]; }` |
| T1.2 | CharacterConfig interface exists | **PASS** — `theme-types.ts:204-210`: `interface CharacterConfig { model: string; idleModel?: string; scale?: [number, number, number]; height?: number; animations?: Record<string, string>; }` |
| T1.3 | CameraConfig interface exists | **PASS** — `theme-types.ts:214-219`: `interface CameraConfig { type?: "orthographic" \| "perspective"; frustum?: number; position?: [number, number, number]; target?: [number, number, number]; }` |
| T1.4 | LightingConfig interface exists | **PASS** — `theme-types.ts:223-226`: `interface LightingConfig { ambient?: { color: string; intensity: number }; directional?: { color: string; intensity: number; position: [number, number, number] }; }` |
| T1.5 | ThemeManifest has v3 optional fields | **PASS** — `theme-types.ts:253-258`: `room?: RoomConfig; character?: CharacterConfig; camera?: CameraConfig; lighting?: LightingConfig;` — all optional, so legacy v2 themes still valid. |

---

## T2: Theme.json v3

| # | Test | Result |
|---|------|--------|
| T2.1 | version: "3.0", renderer: "threejs" | **PASS** — `theme.json:4,10`: `"version": "3.0"`, `"renderer": "threejs"`. |
| T2.2 | room.model points to GLB file | **PASS** — `theme.json:44-47`: `"room": { "model": "cosy-studio-room.glb", "scale": [1, 1, 1] }`. File exists locally (9.3 MB). |
| T2.3 | character.model points to animated GLB | **PASS** — `theme.json:49-50`: `"character": { "model": "arinova-doll-animated.glb" }`. File exists locally (6.6 MB). |
| T2.4 | character.animations has walk and idle | **PASS** — `theme.json:53-56`: `"animations": { "walk": "walk", "idle": "idle" }`. Maps canonical keys to clip names. |
| T2.5 | camera settings exist | **PASS** — `theme.json:59-64`: `"camera": { "type": "orthographic", "frustum": 8, "position": [7, 7, 6], "target": [0, 0, 0] }`. |
| T2.6 | lighting settings exist | **PASS** — `theme.json:66-69`: `"lighting": { "ambient": { "color": "0xfff5e6", "intensity": 0.7 }, "directional": { "color": "0xffffff", "intensity": 1.0, "position": [5, 8, 6] } }`. |

---

## T3: threejs-renderer.ts

| # | Test | Result |
|---|------|--------|
| T3.1 | isV3Theme() checks room.model | **PASS** — `threejs-renderer.ts:164-166`: `function isV3Theme(manifest): boolean { return !!manifest?.room?.model; }`. Simple null-safe check. |
| T3.2 | loadRoomModel: loads GLB + shadow | **PASS** — `threejs-renderer.ts:557-582`: Loads `/themes/{id}/{room.model}` via GLTFLoader, applies `manifest.room.scale`, traverses meshes to set `castShadow = true; receiveShadow = true`. Stores `roomScene` for click-to-walk raycasting. |
| T3.3 | loadCharacterModel: AnimationMixer + clips | **PASS** — `threejs-renderer.ts:586-667`: Loads character GLB, creates `THREE.AnimationMixer`, stores animation clips. Also handles separate `idleModel` GLB if specified. Falls back to playing any available animation if idle isn't found. |
| T3.4 | Animation name mapping: reverse map from manifest | **PASS** — `threejs-renderer.ts:615-625` (commit e77ebe7): Builds `reverseMap` from `manifest.character.animations` entries (e.g. `{ "walk": "Armature|walking" }` → reverse: `{ "Armature|walking": "walk" }`). Stores clips under canonical keys. Also has fallback: single-clip → "walk" (line 628-630). Same logic repeated for idleModel (lines 641-653). |
| T3.5 | playAnimation: fadeIn/fadeOut crossfade | **PASS** — `threejs-renderer.ts:671-683`: Current action `fadeOut(0.3)`, new action `reset().fadeIn(0.3).play()`. 0.3s crossfade duration. |
| T3.6 | Click-to-walk: raycaster + movement | **PASS** — `threejs-renderer.ts:939-947` (click handler): Raycasts `roomScene.children` recursively, gets hit point, sets `walkTarget` at y=0, plays "walk" animation. Movement in render loop `threejs-renderer.ts:1004-1029`: direction vector, `CHARACTER_MOVE_SPEED * delta` step, `lookAt` for rotation, auto-transitions to "idle" on arrival (distance < 0.1). |
| T3.7 | setupCameraV3: OrthographicCamera from manifest | **PASS** — `threejs-renderer.ts:462-478`: Reads `frustum`, `position`, `target` from `manifest.camera` with sensible defaults (frustum=8, pos=[7,7,6], target=[0,0,0]). Near/far = 0.1/200. |
| T3.8 | setupLightsV3: ambient + directional from manifest | **PASS** — `threejs-renderer.ts:517-553`: Reads ambient color/intensity and directional color/intensity/position from `manifest.lighting`. Also adds HemisphereLight (0.25) and soft fill DirectionalLight. Shadow map 2048×2048, shadow camera bounds ±15. |
| T3.9 | Render loop: clock.getDelta() + mixer + movement | **PASS** — `threejs-renderer.ts:994-1044`: `clock.getDelta()` feeds `mixer.update(delta)` for animation timing and character walk step calculation. Legacy lerp still runs for v2 agent groups. |
| T3.10 | Legacy v2 path preserved | **PASS** — init() at lines 276-286: `if (isV3Theme) { loadRoomModel + loadCharacterModel } else { createGround + drawZoneFloors + loadModels + placeFurniture }`. Same branching in `setupCamera` (253-257), `setupLights` (270-274), `resize` (354-368), `updateAgents` (380 — v3 returns early), and click handler (939-947 v3 path vs 949-971 legacy path). All legacy methods untouched. |

---

## T4: .gitignore

| # | Test | Result |
|---|------|--------|
| T4.1 | cosy-studio-room.glb excluded | **PASS** — `.gitignore:11`: `apps/web/public/themes/cozy-studio/cosy-studio-room.glb` |
| T4.2 | arinova-doll-animated.glb excluded | **PASS** — `.gitignore:12`: `apps/web/public/themes/cozy-studio/arinova-doll-animated.glb` |
| T4.3 | Comment explaining the exclusion | **PASS** — `.gitignore:10`: `# Large 3D assets — room and character GLBs (use LFS or local copy)` |

---

## T5: TypeScript Check

| # | Test | Result |
|---|------|--------|
| T5.1 | `npx tsc --noEmit` passes | **PASS** — No type errors. All v3 interfaces, renderer methods, and animation types compile cleanly. |

---

## T6: Screenshot / Runtime Test

| # | Test | Result |
|---|------|--------|
| T6.1 | Theme loads in browser | **FAIL** — `validateManifest()` in `theme-loader.ts:50` throws `"Manifest 'zones' must not be empty"`. v3 theme.json has `"zones": []` which is correct for room-model-based themes but the validator wasn't updated. |
| T6.2 | Fallback behavior | **FAIL** (degraded) — Falls back to Starter Desk theme (see screenshot `01-office-error-state.png`). The v3 3D scene never renders. |

### Root Cause

`theme-loader.ts` `validateManifest()` has hard requirements that are v2-specific:

```
Line 50: if (zones.length === 0) throw new Error("Manifest 'zones' must not be empty");
Line 62: if (!Array.isArray(d.layers) || d.layers.length === 0) throw "Manifest missing 'layers' array";
Line 51-58: Each zone must have id/bounds/seats with ≥1 seat
```

v3 themes replace zones/layers/furniture with a single `room.model`, so these arrays are intentionally empty. The validator needs a v3-aware path:

```typescript
// Proposed fix sketch:
const hasRoomModel = !!(d.room as Record<string,unknown>)?.model;
if (!hasRoomModel) {
  // existing zone/layer/seat validation (v2 only)
  ...
}
```

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────┐
│                  theme-loader.ts                      │
│  loadTheme() → fetch theme.json → validateManifest() │
│         ❌ BLOCKS HERE: zones/layers empty            │
└──────────────┬────────────────────────────────────────┘
               │ (if validation passed)
               ▼
┌─────────────────────────────────────────────────────┐
│              threejs-renderer.ts                      │
│                                                       │
│  isV3Theme() → manifest.room.model exists?            │
│       │                                               │
│  ┌────┴────┐          ┌────────────┐                  │
│  │ v3 Path │          │ v2 Legacy  │                  │
│  ├─────────┤          ├────────────┤                  │
│  │ loadRoom│          │ createGround│                 │
│  │ loadChar│          │ drawZones   │                 │
│  │ mixer   │          │ loadModels  │                 │
│  │ walkTo  │          │ furniture   │                 │
│  │ cameraV3│          │ agentGroups │                 │
│  │ lightsV3│          │ camera/light│                 │
│  └─────────┘          └────────────┘                  │
│                                                       │
│  Render loop: delta → mixer.update + walk movement    │
└─────────────────────────────────────────────────────┘
```

---

## Screenshots

| File | Description |
|------|-------------|
| `01-office-error-state.png` | Office page showing Starter Desk fallback theme after v3 Cozy Studio failed `validateManifest()` |

---

## Recommendations

1. **[BLOCKING] Update `validateManifest()` for v3** — Skip zone/layer/seat checks when `room.model` is present. This is the only thing preventing the v3 renderer from working at runtime.

2. **destroy() cleanup** — `destroy()` properly nulls `characterModel`, `roomScene`, `mixer`, `animationClips`, `walkTarget`, and `currentAction`. Looks thorough.

3. **CHARACTER_MOVE_SPEED = 2** — May need tuning once GLBs load. At frustum=8, 2 units/sec should cross the room in ~4-5 seconds, which feels reasonable.

4. **Shadow camera bounds** — v3 uses ±15 (appropriate for frustum=8 room scale). v2 uses ±500 (for world-space coordinates). Correct separation.
