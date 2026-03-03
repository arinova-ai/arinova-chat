# Cozy Studio — Three.js 3D Scene Design Spec

## Overview

Transform the Cozy Studio theme from a 2D background + sprite approach into a fully 3D isometric room rendered in Three.js. The target is a warm, sunlit single-person studio that matches the concept art (preview.png).

---

## 1. Camera Configuration

### Current Problem
```
Camera: (0, 600, 350) — too high, looking straight down
Result: furniture appears as tiny colored blocks on dark floor
```

### Recommended: True Isometric 30°
```typescript
// Orthographic camera — isometric projection
const frustum = 220; // much tighter framing (was 500)
const aspect = w / h;
camera = new THREE.OrthographicCamera(
  -frustum * aspect, frustum * aspect,
  frustum, -frustum,
  0.1, 2000
);

// Classic isometric angle: 30° elevation, 45° rotation
// Camera distance ~500, positioned at upper-right-back
camera.position.set(350, 280, 350);
camera.lookAt(0, 0, 0);
```

### Key Changes
| Param | Current | Recommended | Why |
|-------|---------|-------------|-----|
| frustum | 500 | 220 | Tighter framing, room fills viewport |
| position.x | 0 | 350 | Offset to see right wall + window |
| position.y | 600 | 280 | Lower angle = more isometric feel |
| position.z | 350 | 350 | Keep depth |
| lookAt | (0,0,0) | (0,0,0) | Center of room |

### Result
- The room shell (6m×5m with walls) fills ~80% of the viewport
- Furniture is large and recognizable
- You see 2 walls (back + right side with window)
- 30° isometric matches the concept art exactly

---

## 2. Lighting Configuration

### Target: Warm Sunlit Studio

```typescript
// 1. Warm ambient — fills the room with cozy base light
const ambient = new THREE.AmbientLight(0xfff5e6, 0.6);
// Color: warm cream (was pure white 0xffffff)
// Intensity: 0.6 (was 0.5) — slightly brighter base

// 2. Hemisphere — warm sky/ground variation
const hemi = new THREE.HemisphereLight(
  0xffecd2, // sky: warm peach (was 0x87ceeb cool blue!)
  0x8b6f47, // ground: warm earth (was 0x362d22)
  0.4       // intensity (was 0.3)
);

// 3. Main directional — "window sunlight" from upper-right
const sun = new THREE.DirectionalLight(0xfff0d4, 1.0);
sun.position.set(300, 400, 100); // from right wall (window)
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); // higher res for crisp shadows
sun.shadow.camera.left = -300;
sun.shadow.camera.right = 300;
sun.shadow.camera.top = 300;
sun.shadow.camera.bottom = -300;
sun.shadow.bias = -0.0001; // reduce shadow acne
// Color: 0xfff0d4 warm yellow (was 0xfff5e6 — close but brighter now)
// Intensity: 1.0 (was 0.8) — stronger sun effect

// 4. Fill from left-back — softer warm fill
const fill = new THREE.DirectionalLight(0xffe8cc, 0.25);
fill.position.set(-200, 200, -100);
// Color: warm cream (was 0xc4d4ff cool blue!)
```

### Comparison
| Light | Current Color | New Color | Mood |
|-------|:---:|:---:|------|
| Ambient | 0xffffff (white) | 0xfff5e6 (warm cream) | Cozy base |
| Hemisphere sky | 0x87ceeb (cool blue) | 0xffecd2 (warm peach) | Indoor warmth |
| Hemisphere ground | 0x362d22 (dark) | 0x8b6f47 (earth) | Wood reflection |
| Directional sun | 0xfff5e6 (warm) | 0xfff0d4 (golden) | Window sunlight |
| Fill | 0xc4d4ff (cool blue!) | 0xffe8cc (warm cream) | No cold fill! |

### Critical Fix
The **fill light** is currently COOL BLUE (0xc4d4ff) which kills the warm mood. Changing it to warm cream is essential.

---

## 3. Renderer Settings

```typescript
renderer.toneMapping = THREE.ACESFilmicToneMapping; // keep (good for warm)
renderer.toneMappingExposure = 1.4; // slightly higher (was 1.2)
renderer.outputColorSpace = THREE.SRGBColorSpace; // ensure correct display

// Background color — warm cream instead of dark scene
scene.background = new THREE.Color(0xf5f0e8);
// Or match the room wall color for seamless edges

// Fog — warm fade instead of dark fade
scene.fog = new THREE.FogExp2(0xf0e8d8, 0.0004);
// Color: warm cream fog (was dark matching background)
// Density: 0.0004 (reduced — room is small, don't fade furniture)
```

---

## 4. Room Architecture (room.glb)

A pre-built room shell model is provided at:
`/themes/cozy-studio/models/room.glb`

### Structure
```
6m × 5m room (matches canvas 1920×1080 proportions)
├── Wood plank floor (7 planks with dark gaps)
├── Back wall (cream, full width)
├── Right wall (cream, with window cutout)
│   ├── Window frame (light wood)
│   ├── Glass pane (sky blue, semi-transparent)
│   ├── Horizontal cross bar
│   └── 2 sheer curtains (left + right drapes)
└── Baseboards (light wood trim)
```

### Placement
```typescript
// Room is centered at origin, floor at Y=0
// In theme.json furniture array:
{
  "id": "room-shell",
  "sprite": "/themes/cozy-studio/models/room.glb",
  "layer": "furniture",
  "x": 960, "y": 540,  // canvas center
  "width": 1920, "height": 1080
}
```

---

## 5. Furniture Layout

All warm-tone furniture GLBs are in `/themes/cozy-studio/models/`.

### Scene Layout (Canvas Coordinates → World Positions)

```
Canvas 1920×1080 | World: canvas * 0.5 - center

 ┌─── back wall ──────────────────────────────────────┐
 │                                                      │ right
 │  [wall-shelf]      [wall-art]                        │ wall
 │                                                      │ (window)
 │  [plant]     [bean-bag]       [desk]+[chair]        │
 │              [coffee-tbl]      [monitor on desk]     │
 │                                                      │
 │  [floor-lamp]    [   rug   ]                        │
 │                                                      │
 └──────────────────────────────────────────────────────┘
```

### Furniture Placement Table (canvas coords)

| Asset | x | y | width | height | Rotation | Notes |
|-------|---|---|-------|--------|----------|-------|
| room.glb | 960 | 540 | 1920 | 1080 | 0° | Full room shell |
| desk.glb | 1350 | 450 | 220 | 110 | 0° | Near right wall |
| chair.glb | 1350 | 520 | 80 | 80 | 0° | In front of desk |
| monitor.glb | 1350 | 440 | 100 | 60 | 0° | On desk surface |
| bookshelf.glb | 600 | 200 | 140 | 100 | 0° | Wall-mounted, upper left |
| bean-bag.glb | 700 | 500 | 160 | 130 | 0° | Center-left, cozy area |
| coffee-table.glb | 800 | 600 | 120 | 120 | 0° | Next to bean bag |
| plant.glb | 400 | 400 | 100 | 200 | 0° | Left side, tall |
| floor-lamp.glb | 350 | 650 | 60 | 280 | 0° | Left corner |
| rug.glb | 900 | 600 | 440 | 320 | 0° | Center of room |
| wall-art.glb | 960 | 200 | 100 | 80 | 0° | Back wall, centered |

---

## 6. Material Palette

### Warm Cozy Palette (all furniture models use these)

| Material | Hex | sRGB | Usage |
|----------|-----|------|-------|
| Wood Honey | #c8956c | warm golden wood | Desk, shelf, chair, stands |
| Wood Light | #deb887 | burlywood | Floor planks |
| Wood Dark | #8b6f47 | walnut | Accents, brackets, lamp base |
| Wall Cream | #f5f0e8 | warm white | Walls, background |
| Bean Bag | #e8913a | warm amber | Bean bag chair |
| Rug Cream | #f5ead6 | warm cream | Rug center |
| Green Leaf | #5d9e5a | natural green | Plant foliage |
| Terracotta | #c4713a | orange-brown | Plant pots |
| Lamp Shade | #f5e6c8 | warm ivory | Lamp shade |
| Screen Glow | #b8d4f0 | soft blue | Monitor screen |
| Metal Warm | #8c7e6e | warm gray | Metal parts |
| Fabric | #c4a882 | warm beige | Cushion, couch |

### PBR Settings
- **Wood**: roughness 0.45-0.55, metalness 0.0
- **Fabric**: roughness 0.7-0.85, metalness 0.0
- **Metal**: roughness 0.25-0.35, metalness 0.4-0.6
- **Screen**: roughness 0.2, metalness 0.0

---

## 7. Character (3D Bot) Integration

### Current State
The ThreeJS renderer already loads `arinova-bot.glb` as a 3D model (1650 tris, Mixamo rig). This is the correct approach — **no 2D sprites needed**.

### Recommendations

1. **Keep using arinova-bot.glb** — it's already 3D, has proper shadows, and works with the renderer's seat placement system.

2. **Scale adjustment** — BOT_HEIGHT is currently 40 world units. With the tighter camera (frustum 220 vs 500), the bot will appear larger. Consider:
   ```typescript
   const BOT_HEIGHT = 30; // slightly smaller for cozy room proportions
   ```

3. **Material tinting for this theme** — The bot's blue/white colors work well against warm backgrounds (creates nice contrast). No material changes needed.

4. **Shadow** — The bot already casts shadows. With the warmer directional light, shadows will be softer and warmer, blending naturally with the wood floor.

5. **Seat position** — Place the desk seat so the bot sits at the desk facing the monitor:
   ```json
   "seats": [{ "id": "desk-1", "x": 1350, "y": 520, "direction": "up" }]
   ```

### Why 3D Works Here
- The bot and furniture share the same lighting/shadow system
- Orthographic camera means no perspective distortion mismatch
- The bot sits at the same ground plane as furniture
- No z-fighting or compositing artifacts (unlike 2D sprite on 3D)

---

## 8. Ground Plane Override

### Current Problem
```typescript
// Ground is dark navy — kills the warm mood
color: 0x1e293b // dark slate blue
```

### Solution
The `room.glb` includes its own wood plank floor, so the default ground should either:

**Option A: Disable default ground** (preferred)
```typescript
// In theme-aware setup, skip createGround() when room.glb has floor
if (manifest.id !== 'cozy-studio') {
  this.createGround();
}
```

**Option B: Warm fallback ground**
```typescript
const mat = new THREE.MeshStandardMaterial({
  color: 0xd4a574, // warm wood
  roughness: 0.6,
  metalness: 0.0,
});
```

---

## 9. Zone Floor Markers Override

### Current Problem
Zone markers are semi-transparent dark slate (0x334155) — too cold for this theme.

### Solution
Either hide zone markers for this theme or use warm colors:
```typescript
color: 0xc8956c  // warm wood tone
opacity: 0.15    // very subtle (was 0.6)
```

Zone labels should use warm colors:
```typescript
createLabelSprite(zone.name, "#8b6f47"); // warm brown (was "#94a3b8" cool gray)
```

---

## 10. Implementation Checklist for Ron

### Phase 1: Scene Config (make it look right)
- [ ] Add theme-aware camera config (frustum, position per theme or global override)
- [ ] Add theme-aware lighting colors (read from manifest or per-theme presets)
- [ ] Change scene background color to `0xf5f0e8` for cozy-studio
- [ ] Change fog color to warm `0xf0e8d8`
- [ ] Increase toneMappingExposure to 1.4

### Phase 2: Room Shell
- [ ] Load `room.glb` as first furniture item
- [ ] Skip default createGround() when theme provides room shell
- [ ] Skip or warm-ify zone markers for this theme

### Phase 3: Furniture Placement
- [ ] Update cozy-studio theme.json with furniture array (see Section 5)
- [ ] All furniture GLBs are ready in `/themes/cozy-studio/models/`
- [ ] Verify furniture scale (normalizeModel uses width/height from manifest)

### Phase 4: Character Polish
- [ ] Consider reducing BOT_HEIGHT to 30 for cozy proportions
- [ ] Verify shadow casting on wood floor looks natural
- [ ] Test seat placement at desk position

### Future: Theme Manifest Extensions
Consider adding to ThemeManifest type:
```typescript
interface ThreeJSSceneConfig {
  camera?: {
    frustum?: number;
    position?: [number, number, number];
    lookAt?: [number, number, number];
  };
  lighting?: {
    ambient?: { color: string; intensity: number };
    hemisphere?: { sky: string; ground: string; intensity: number };
    directional?: { color: string; intensity: number; position: [number, number, number] };
    fill?: { color: string; intensity: number; position: [number, number, number] };
  };
  background?: string; // hex color
  fog?: { color: string; density: number };
  ground?: { color: string; roughness: number } | false; // false = disable
}
```

---

## 11. Assets Inventory

### New GLB Models (`/themes/cozy-studio/models/`)

| File | Tris | Size | Description |
|------|-----:|-----:|-------------|
| room.glb | 1232 | 73.3 KB | Room shell (floor + walls + window) |
| desk.glb | 264 | 16.2 KB | Honey wood desk with drawer |
| chair.glb | 244 | 14.5 KB | Wood chair with amber cushion |
| monitor.glb | 160 | 11.4 KB | Monitor on wood stand |
| bookshelf.glb | 540 | 35.1 KB | Wall shelves with books + small plant |
| bean-bag.glb | 220 | 14.3 KB | Amber bean bag chair |
| plant.glb | 396 | 25.9 KB | Large monstera in terracotta pot |
| floor-lamp.glb | 120 | 9.4 KB | Floor lamp with warm shade |
| rug.glb | 220 | 13.9 KB | Cream rug with wood-tone border |
| coffee-table.glb | 120 | 7.3 KB | Small round wood table |
| wall-art.glb | 336 | 22.7 KB | Framed abstract art |

**Total: 3,852 tris | 244 KB** — lightweight for web delivery.

### Existing Asset (reused)
| File | Tris | Size | Description |
|------|-----:|-----:|-------------|
| arinova-bot.glb | 1650 | 167 KB | 3D character (Mixamo rig) |

**Grand total scene: ~5,500 tris | ~411 KB** — well within web budget.
