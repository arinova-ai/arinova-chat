# Virtual Office — Theme Engine Spec

> Version 0.1.0 | 2026-02-25 | Author: Alice (UI/UX)

---

## 1. Overview

The Virtual Office is rendered with **PixiJS** and driven by a declarative **Theme Manifest** (`theme.json`). Every visual element — background, furniture, zones, characters — is defined in this manifest so that:

1. Themes are fully swappable at runtime (marketplace model).
2. Third-party creators can build themes with no code changes.
3. The renderer is theme-agnostic; it reads the manifest and draws.

### Design Principles

- **Data-driven** — the renderer never hard-codes positions, sprites, or animations.
- **Asset-lazy** — load what's visible; prefetch the rest.
- **Mobile-first** — a single manifest serves both desktop and mobile via viewport mapping.
- **Creator-friendly** — the manifest format is human-readable and validatable with JSON Schema.

---

## 2. Theme Package Structure

```
themes/
  cozy-studio/
    theme.json            # manifest (required)
    preview.png           # marketplace thumbnail (required, 640x360)
    background.png        # base scene (required)
    background@2x.png     # retina variant (optional)
    background-mobile.png # mobile override (optional)
    sprites/
      furniture.json      # texture atlas (PixiJS spritesheet format)
      furniture.png       # atlas image
      characters.json     # character spritesheet atlas
      characters.png      # character atlas image
      effects.json        # optional: particles, status indicators
      effects.png
    audio/                # optional
      ambient.mp3
      click.mp3
```

### File Size Constraints (Marketplace Upload)

| Asset | Max Size | Format |
|-------|----------|--------|
| `background.png` | 2 MB | PNG or WebP |
| Each sprite atlas | 1 MB | PNG (must have alpha) |
| `preview.png` | 200 KB | PNG or WebP, 640x360 |
| Total theme package | 10 MB | — |

---

## 3. Theme Manifest — `theme.json`

```jsonc
{
  // ─── Meta ─────────────────────────────────────────────
  "id": "cozy-studio",
  "name": "Cozy Studio",
  "version": "1.0.0",
  "author": {
    "name": "Arinova",
    "id": "arinova-official"
  },
  "description": "A warm, modern open-plan office with meeting room and lounge.",
  "tags": ["modern", "warm", "open-plan"],
  "preview": "preview.png",
  "license": "standard",           // "standard" | "exclusive"

  // ─── Canvas & Background ─────────────────────────────
  "canvas": {
    "width": 1920,
    "height": 1080,
    "background": {
      "image": "background.png",
      "image2x": "background@2x.png",
      "mobile": "background-mobile.png"
    }
  },

  // ─── Viewport (camera) ───────────────────────────────
  "viewport": {
    "minZoom": 0.5,
    "maxZoom": 2.0,
    "defaultZoom": 1.0,
    "panBounds": true,              // clamp pan to canvas edges
    "mobile": {
      "defaultZoom": 0.6,           // fit more on small screens
      "pinchToZoom": true,
      "doubleTapZoom": 1.2
    }
  },

  // ─── Layers (z-order) ───────────────────────────────
  "layers": [
    { "id": "background",  "zIndex": 0 },
    { "id": "floor-decor",  "zIndex": 10 },
    { "id": "furniture",    "zIndex": 20 },
    { "id": "characters",   "zIndex": 30 },
    { "id": "furniture-top", "zIndex": 40 },
    { "id": "effects",      "zIndex": 50 },
    { "id": "ui-overlay",   "zIndex": 100 }
  ],

  // ─── Zones ──────────────────────────────────────────
  "zones": [
    {
      "id": "work-area",
      "name": "Work Area",
      "type": "work",                // "work" | "meeting" | "lounge" | "custom"
      "bounds": { "x": 60, "y": 280, "width": 900, "height": 500 },
      "capacity": 6,
      "seats": [
        { "id": "desk-1", "x": 160, "y": 380, "direction": "down",  "label": "Desk 1" },
        { "id": "desk-2", "x": 360, "y": 380, "direction": "down",  "label": "Desk 2" },
        { "id": "desk-3", "x": 560, "y": 380, "direction": "down",  "label": "Desk 3" },
        { "id": "desk-4", "x": 160, "y": 560, "direction": "up",    "label": "Desk 4" },
        { "id": "desk-5", "x": 360, "y": 560, "direction": "up",    "label": "Desk 5" },
        { "id": "desk-6", "x": 560, "y": 560, "direction": "up",    "label": "Desk 6" }
      ]
    },
    {
      "id": "meeting-room",
      "name": "Meeting Room",
      "type": "meeting",
      "bounds": { "x": 1050, "y": 100, "width": 450, "height": 400 },
      "capacity": 4,
      "seats": [
        { "id": "meet-1", "x": 1150, "y": 220, "direction": "right" },
        { "id": "meet-2", "x": 1350, "y": 220, "direction": "left" },
        { "id": "meet-3", "x": 1150, "y": 380, "direction": "right" },
        { "id": "meet-4", "x": 1350, "y": 380, "direction": "left" }
      ],
      "door": { "x": 1050, "y": 300, "width": 20, "height": 80 }
    },
    {
      "id": "lounge",
      "name": "Lounge / Break Area",
      "type": "lounge",
      "bounds": { "x": 1050, "y": 580, "width": 450, "height": 380 },
      "capacity": 3,
      "seats": [
        { "id": "sofa-1", "x": 1150, "y": 700, "direction": "right" },
        { "id": "sofa-2", "x": 1300, "y": 700, "direction": "down" },
        { "id": "sofa-3", "x": 1150, "y": 850, "direction": "right" }
      ]
    }
  ],

  // ─── Furniture ──────────────────────────────────────
  "furniture": [
    {
      "id": "work-desk-1",
      "sprite": "desk-long",        // key in furniture.json atlas
      "layer": "furniture",
      "x": 100, "y": 340,
      "width": 180, "height": 100,
      "anchor": { "x": 0.5, "y": 1.0 },
      "sortY": true                  // dynamic z-sort by y position
    },
    {
      "id": "work-desk-2",
      "sprite": "desk-long",
      "layer": "furniture",
      "x": 300, "y": 340,
      "width": 180, "height": 100,
      "anchor": { "x": 0.5, "y": 1.0 },
      "sortY": true
    },
    {
      "id": "meeting-table",
      "sprite": "table-round",
      "layer": "furniture",
      "x": 1250, "y": 300,
      "width": 160, "height": 120,
      "anchor": { "x": 0.5, "y": 1.0 }
    },
    {
      "id": "sofa",
      "sprite": "sofa-l-shape",
      "layer": "furniture",
      "x": 1100, "y": 720,
      "width": 200, "height": 140,
      "anchor": { "x": 0.5, "y": 1.0 }
    },
    {
      "id": "coffee-machine",
      "sprite": "coffee-machine",
      "layer": "furniture",
      "x": 1400, "y": 620,
      "width": 60, "height": 80,
      "interactive": true,
      "tooltip": "Coffee Machine"
    },
    {
      "id": "plant-1",
      "sprite": "plant-tall",
      "layer": "floor-decor",
      "x": 40, "y": 260,
      "width": 50, "height": 100
    },
    {
      "id": "monitor-overlay-1",
      "sprite": "monitor-glow",
      "layer": "furniture-top",       // renders ABOVE characters
      "x": 120, "y": 330,
      "width": 40, "height": 30,
      "animation": {
        "type": "flicker",
        "interval": 3000
      }
    }
  ],

  // ─── Characters ─────────────────────────────────────
  "characters": {
    "atlas": "sprites/characters.json",
    "frameWidth": 48,
    "frameHeight": 64,
    "anchor": { "x": 0.5, "y": 1.0 },

    "hitArea": {
      "type": "rect",
      "x": -20,
      "y": -58,
      "width": 40,
      "height": 60
    },

    "nameTag": {
      "offsetY": -68,
      "font": "12px sans-serif",
      "color": "#FFFFFF",
      "bgColor": "rgba(0,0,0,0.55)",
      "padding": { "x": 6, "y": 2 },
      "borderRadius": 4,
      "maxWidth": 100
    },

    "statusBadge": {
      "offsetX": 18,
      "offsetY": -58,
      "radius": 5,
      "colors": {
        "online":   "#22C55E",
        "busy":     "#F59E0B",
        "meeting":  "#3B82F6",
        "blocked":  "#EF4444",
        "idle":     "#9CA3AF",
        "offline":  "#4B5563"
      }
    },

    "states": {
      "idle": {
        "prefix": "char-idle",
        "frames": 4,
        "fps": 2,
        "loop": true
      },
      "working": {
        "prefix": "char-working",
        "frames": 4,
        "fps": 3,
        "loop": true
      },
      "walking": {
        "prefix": "char-walk",
        "frames": 6,
        "fps": 8,
        "loop": true
      },
      "meeting": {
        "prefix": "char-meeting",
        "frames": 4,
        "fps": 2,
        "loop": true
      },
      "coffee": {
        "prefix": "char-coffee",
        "frames": 4,
        "fps": 2,
        "loop": true
      }
    },

    "directions": ["down", "left", "right", "up"]
  },

  // ─── Ambient Effects ────────────────────────────────
  "effects": [
    {
      "id": "window-light",
      "type": "sprite",
      "sprite": "light-shaft",
      "layer": "effects",
      "x": 0, "y": 0,
      "width": 400, "height": 1080,
      "opacity": 0.15,
      "blendMode": "screen",
      "animation": {
        "type": "pulse",
        "minOpacity": 0.10,
        "maxOpacity": 0.20,
        "duration": 8000
      }
    }
  ],

  // ─── Audio (optional) ───────────────────────────────
  "audio": {
    "ambient": {
      "src": "audio/ambient.mp3",
      "volume": 0.15,
      "loop": true
    }
  }
}
```

---

## 4. Sprite Atlas Format

Theme creators must provide sprite atlases in **PixiJS TexturePacker JSON Hash** format. This is the standard supported by tools like TexturePacker, ShoeBox, and free-tex-packer.

```jsonc
// sprites/furniture.json
{
  "frames": {
    "desk-long": {
      "frame": { "x": 0, "y": 0, "w": 180, "h": 100 },
      "sourceSize": { "w": 180, "h": 100 },
      "spriteSourceSize": { "x": 0, "y": 0, "w": 180, "h": 100 }
    },
    "table-round": {
      "frame": { "x": 180, "y": 0, "w": 160, "h": 120 },
      "sourceSize": { "w": 160, "h": 120 },
      "spriteSourceSize": { "x": 0, "y": 0, "w": 160, "h": 120 }
    }
    // ...
  },
  "meta": {
    "image": "furniture.png",
    "format": "RGBA8888",
    "size": { "w": 1024, "h": 1024 },
    "scale": "1"
  }
}
```

Character atlases follow the same format, but frames are named with the convention:
```
{prefix}-{direction}-{frameIndex}
```
Example: `char-idle-down-0`, `char-idle-down-1`, `char-working-right-0`

---

## 5. Rendering Architecture

### 5.1 Layer Stack (PixiJS Containers)

```
Stage
  |-- [zIndex  0] BackgroundLayer     (single sprite: background.png)
  |-- [zIndex 10] FloorDecorLayer     (plants, rugs, floor stickers)
  |-- [zIndex 20] FurnitureLayer      (desks, tables, shelves)
  |-- [zIndex 30] CharacterLayer      (avatars + name tags + status badges)
  |-- [zIndex 40] FurnitureTopLayer   (monitor overlays, lamp tops — render above characters)
  |-- [zIndex 50] EffectsLayer        (light shafts, particles)
  |-- [zIndex 100] UIOverlayLayer     (tooltips, modals, zone labels)
```

### 5.2 Y-Sorting

Furniture and characters with `"sortY": true` are dynamically sorted within their layer by their `y + height` value (foot position). This creates correct overlap for isometric or 3/4-view perspectives.

```
sortableChildren = true
sprite.zIndex = sprite.y + sprite.height
```

### 5.3 Character Rendering Pipeline

```
CharacterContainer (per user)
  |-- AnimatedSprite   (current state animation)
  |-- NameTag          (BitmapText + background Graphics)
  |-- StatusBadge      (Graphics circle, colored by status)
  |-- HitArea          (invisible Rectangle for click/tap detection)
```

**State transitions**: When a character's status changes (e.g. `idle` -> `working`), the renderer:
1. Fades out current AnimatedSprite (100ms)
2. Swaps texture frames to new state
3. Fades in (100ms)
4. Updates StatusBadge color

**Walking**: When a character moves between seats, the renderer:
1. Switches to `walking` state
2. Tweens position along a path (simple A-to-B, no pathfinding needed in v1)
3. Flips sprite direction based on movement vector
4. On arrival, switches to destination state (`working`, `meeting`, etc.)

### 5.4 Hit Area & Character Interaction

Each character has a rectangular hit area defined in `characters.hitArea`:

```
hitArea: new PIXI.Rectangle(-20, -58, 40, 60)
```

This is relative to the character's anchor point (bottom-center). On click/tap:

1. **Desktop**: Show a popover card (name, role, status, quick actions).
2. **Mobile**: Show a bottom sheet modal.

The hit area is intentionally larger than the visual sprite to make tapping easy on mobile (minimum 44x44 CSS px touch target).

**Zone hover**: When hovering over a zone boundary on desktop, show a subtle zone name tooltip. On mobile, zones are not interactive (characters are the primary tap target).

---

## 6. Resource Loading Strategy

### 6.1 Load Phases

```
Phase 1 — Immediate (blocking, before first render)
  - theme.json manifest
  - background.png (or background-mobile.png on mobile)

Phase 2 — Essential (load while showing background)
  - furniture atlas (sprites/furniture.json + .png)
  - character atlas (sprites/characters.json + .png)

Phase 3 — Deferred (load after office is interactive)
  - effects atlas
  - audio files
  - @2x retina variants (if devicePixelRatio > 1)
```

### 6.2 Theme Switching at Runtime

When user switches theme:

```
1. Show transition overlay (fade to branded color, ~300ms)
2. Destroy current PixiJS scene containers (release GPU textures)
3. Load Phase 1 of new theme
4. Render background + show loading indicator on overlay
5. Load Phase 2
6. Place furniture + characters at their seats
7. Fade out overlay (~300ms)
8. Load Phase 3 in background
```

**Texture memory**: Before loading a new theme, call `PIXI.Assets.unload()` on all current theme assets to free GPU memory. On low-end mobile devices, also call `renderer.textureGC.run()`.

### 6.3 Caching

- Themes are cached via service worker + Cache API.
- Cache key: `theme:{id}:{version}` — version bump busts cache.
- On subsequent visits, Phase 1 loads from cache (instant).

---

## 7. Mobile Adaptation

### 7.1 Viewport Mapping

The canvas logical size is always `1920x1080`. On mobile, the renderer scales to fit:

```
scaleX = screenWidth / canvas.width
scaleY = screenHeight / canvas.height
scale = Math.min(scaleX, scaleY)
```

Default mobile zoom is `0.6` (show ~60% of the office), pannable to see the rest.

### 7.2 Mobile-Specific Behaviors

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Navigation | Mouse pan + scroll zoom | Touch pan + pinch zoom |
| Character click | Popover card | Bottom sheet modal |
| Zone hover | Tooltip on hover | No hover (tap character instead) |
| Double-click | Zoom to zone | Double-tap zoom |
| Background | `background.png` | `background-mobile.png` if provided |
| Default zoom | 1.0 | 0.6 |

### 7.3 Mobile Background Override

If `canvas.background.mobile` is provided, use it on screens narrower than 768px. This allows theme creators to provide a portrait-optimized layout or a simplified background that reads well on small screens.

### 7.4 Touch Targets

All interactive elements must have a minimum touch target of **44x44 CSS pixels**. The character hit area (`40x60` at native scale) meets this requirement at zoom levels >= 0.75. At lower zoom levels, the renderer inflates hit areas proportionally.

---

## 8. Character Status System

### 8.1 Status Types

| Status | Badge Color | Animation State | Description |
|--------|-------------|-----------------|-------------|
| `online` | Green `#22C55E` | `idle` | Available, at desk |
| `busy` | Amber `#F59E0B` | `working` | Working, prefer not to disturb |
| `meeting` | Blue `#3B82F6` | `meeting` | In meeting room zone |
| `blocked` | Red `#EF4444` | `working` (head-scratch variant) | Stuck, needs help |
| `idle` | Grey `#9CA3AF` | `idle` (slower fps) | AFK / inactive |
| `offline` | Dark Grey `#4B5563` | — (static frame, reduced opacity) | Not connected |

### 8.2 Auto-Status Rules

The system can auto-update status based on context:

- User moves to meeting room zone -> status becomes `meeting`.
- User moves to lounge zone -> status stays `online` (lounge is still available).
- No input for 5 minutes -> status becomes `idle`.
- User disconnects -> status becomes `offline` (rendered at 40% opacity).

### 8.3 Status Badge Rendering

The status badge is a filled circle rendered at the top-right of the character container. It has a 2px white stroke for contrast against any background.

```
badge.position.set(hitArea.x + hitArea.width - 2, hitArea.y + 2)
badge.beginFill(statusColor)
badge.drawCircle(0, 0, 5)
badge.lineStyle(2, 0xFFFFFF)
```

---

## 9. Character Interaction — Modal Detail

When a character is clicked/tapped:

### Desktop: Popover Card
```
+---------------------------+
|  [Avatar]  Alice Chen     |
|  UI/UX Designer           |
|  ● Working                |
+---------------------------+
|  [Chat]  [Call]  [Nudge]  |
+---------------------------+
```
- Appears above the character, arrow pointing down.
- Dismisses on click outside or Escape key.
- Width: 240px. Follows the theme's color scheme.

### Mobile: Bottom Sheet
```
+-----------------------------------+
|  ─── (drag handle) ───            |
|                                   |
|  [Avatar]  Alice Chen             |
|            UI/UX Designer         |
|            ● Working              |
|                                   |
|  [💬 Chat]  [📞 Call]  [👋 Nudge] |
+-----------------------------------+
```
- Slides up from bottom, max 40% screen height.
- Swipe down to dismiss.
- Large touch targets (48px button height).

---

## 10. Theme Validation

### 10.1 JSON Schema

A JSON Schema will be provided for `theme.json` so creators can validate before uploading. Key validations:

- `id`: lowercase alphanumeric + hyphens, 3-50 chars.
- `version`: semver format.
- `canvas.width` and `canvas.height`: must be positive integers, max 3840x2160.
- `zones[].seats[].direction`: enum `["up","down","left","right"]`.
- `characters.states`: must include at least `idle` and `working`.
- All file paths: relative, no `..`, no absolute paths.

### 10.2 Asset Validation (on upload)

- All referenced sprites exist in the atlas JSON.
- Atlas image dimensions are power-of-two (GPU efficiency).
- No seat coordinates outside canvas bounds.
- `preview.png` exists and is 640x360.

---

## 11. Versioning & Marketplace

### 11.1 Theme Updates

- Theme creators can push updates with a new `version`.
- Users who purchased a theme auto-receive updates (service worker detects version change).
- Breaking changes (removed zones/seats) bump major version — renderer handles gracefully by placing displaced characters in the nearest available seat.

### 11.2 Theme API Endpoints (reference)

```
GET  /api/themes                    # list marketplace themes
GET  /api/themes/:id                # theme detail + preview
GET  /api/themes/:id/download       # download theme package (purchased users)
POST /api/themes                    # upload new theme (creators)
PUT  /api/themes/:id/versions       # push update
```

---

---

# Part 2: Default Theme — "Modern Loft Office" Concept

## Visual Direction

**Style**: Isometric 2.5D, warm flat illustration with subtle gradients and soft shadows. Inspired by the cozy productivity aesthetic — think "lo-fi hip hop study room" meets modern coworking space.

**Palette**:
- Background/walls: Warm cream `#F5F0E8`, soft wood `#D4B896`
- Floor: Light warm grey `#E8E2D9` with subtle wood grain texture
- Furniture: Natural wood `#C4A882` + white surfaces `#FAFAFA`
- Accents: Teal `#2DD4BF` (plants), Warm orange `#FB923C` (cushions, mugs), Soft blue `#60A5FA` (monitor screens)
- Shadows: Warm purple-grey `rgba(80, 60, 80, 0.12)`

**Perspective**: Isometric (~30 degree), camera looking from bottom-left toward top-right. This gives a natural "overview" feel and makes zones clearly distinguishable.

## Scene Layout

```
Canvas: 1920 x 1080

         +----------------------------------------------------------+
         |  ////// WINDOWS (top wall, natural light) //////         |
         |                                                          |
         |   +-------------------+        +------------------+      |
         |   |                   |   🌿   |  MEETING ROOM    |      |
         |   |   WORK AREA       |        |                  |      |
         |   |                   | plant   |  [round table]   |      |
         |   |  [desk1] [desk2]  |  wall  |  [4 chairs]      |      |
         |   |                   |        |                  |      |
         |   |  [desk3] [desk4]  |        |  whiteboard wall |      |
         |   |                   |        +------------------+      |
         |   |  [desk5] [desk6]  |                                  |
         |   |                   |        +------------------+      |
         |   +-------------------+   🌿   |  LOUNGE /        |      |
         |                        plant   |  BREAK AREA      |      |
         |          bookshelf             |                  |      |
         |          coat rack    ☕       |  [L-sofa]        |      |
         |                      coffee    |  [coffee table]  |      |
         |                      machine   |  [bean bag]      |      |
         |                                +------------------+      |
         +----------------------------------------------------------+
              ENTRANCE (bottom)
```

## Zone Details

### Zone A — Work Area (Left, 60% of width)

6 desks arranged in 3 rows of 2, paired face-to-face:

```
  Row 1:  [desk-1 ↓]  [desk-2 ↓]     (facing down)
          [desk-4 ↑]  [desk-5 ↑]     (facing up)

  Row 2:  [desk-3 ↓]  [desk-6 ↓]     (facing down)
          (row 2 bottom is open — room to grow)
```

Each desk is an L-shaped standing/sitting desk (isometric) with:
- Monitor on desk
- Small personal items (mug, plant, notebook — randomized per desk to add life)
- Ergonomic chair (rotates to face character's direction)

The work area has a large window wall at the top, casting warm light shafts across the floor (rendered in the effects layer with `blendMode: screen`).

### Zone B — Meeting Room (Top-right, walled off)

Enclosed room with glass-panel walls (semi-transparent in the sprite so you can see characters inside):
- 1 round table in the center
- 4 cushioned chairs around it
- A whiteboard on the back wall (decorative)
- Warm pendant lamp hanging above the table
- Glass door on the left wall with a subtle "In Meeting" indicator when occupied

### Zone C — Lounge / Break Area (Bottom-right)

Open area, no walls, separated by a change in floor pattern (rug):
- L-shaped couch (seats 2)
- 1 bean bag chair
- Small coffee table with magazines
- A tall bookshelf on the dividing edge (acts as visual separator from work area)
- Coffee machine against the right wall (interactive — tooltip "Coffee Machine", characters in lounge play the `coffee` animation)

### Shared Elements

- **Plants**: 4-5 potted plants scattered around edges and between zones. Varying heights (floor fern, desk succulent, tall fiddle-leaf fig). Adds warmth.
- **Floor**: Continuous warm wood texture, with a cozy area rug under the lounge zone.
- **Lighting**: Warm overhead ambient. Additional light shafts from the window wall. Meeting room has its own pendant light.
- **Wall art**: 2-3 framed motivational/abstract posters on the walls (decorative furniture sprites).
- **Entrance**: Bottom edge of the canvas. When a character comes online, they "walk in" from here.

## Sprite List

### Furniture Sprites

| Sprite Key | Description | Approx Size (px) | Notes |
|------------|-------------|-------------------|-------|
| `desk-l-shape` | L-shaped desk, isometric | 180 x 120 | Used for all 6 work desks |
| `chair-ergo` | Ergonomic office chair | 48 x 60 | 4 directional variants |
| `monitor` | Desktop monitor on stand | 40 x 35 | Glowing screen effect in furniture-top layer |
| `table-round` | Round meeting table | 140 x 100 | Isometric |
| `chair-cushion` | Meeting room chair | 44 x 50 | 4 directional variants |
| `sofa-l-shape` | L-shaped couch | 200 x 140 | Isometric, warm orange cushions |
| `bean-bag` | Bean bag chair | 64 x 50 | Teal colored |
| `coffee-table` | Small low table | 80 x 50 | With magazine sprites baked in |
| `coffee-machine` | Coffee maker on counter | 60 x 80 | Interactive |
| `bookshelf` | Tall bookshelf | 80 x 160 | Colorful book spines |
| `whiteboard` | Wall-mounted whiteboard | 120 x 80 | Decorative scribbles |
| `pendant-lamp` | Hanging lamp | 40 x 60 | Warm glow effect |
| `coat-rack` | Standing coat rack | 40 x 100 | Near entrance |
| `plant-tall` | Fiddle-leaf fig tree | 50 x 120 | |
| `plant-floor` | Floor fern in pot | 50 x 60 | |
| `plant-desk` | Small succulent | 20 x 20 | Baked into some desk sprites |
| `rug-lounge` | Area rug | 300 x 200 | Floor-decor layer, under lounge furniture |
| `wall-art-1` | Framed abstract poster | 60 x 80 | |
| `wall-art-2` | Framed motivational poster | 80 x 60 | |
| `glass-wall` | Semi-transparent wall panel | 20 x 200 | Meeting room walls, ~70% opacity |
| `glass-door` | Glass door | 20 x 80 | Meeting room entrance |
| `mug` | Coffee mug on desk | 12 x 14 | Baked into desk variants or standalone |
| `notebook` | Open notebook on desk | 20 x 16 | Baked into desk variants |

### Character Sprites

| State | Frames | FPS | Description |
|-------|--------|-----|-------------|
| `idle` | 4 | 2 | Subtle breathing / looking around |
| `working` | 4 | 3 | Typing on keyboard, occasional head movement |
| `walking` | 6 | 8 | Walking cycle |
| `meeting` | 4 | 2 | Seated, gesturing / nodding |
| `coffee` | 4 | 2 | Holding mug, sipping |

Each state has 4 direction variants (`down`, `left`, `right`, `up`).
Total character frames: **(4+4+6+4+4) x 4 directions = 88 frames** at 48x64 each.

### Effects Sprites

| Sprite Key | Description |
|------------|-------------|
| `light-shaft` | Warm light beam from window, screen blend mode |
| `monitor-glow` | Subtle screen glow, placed in furniture-top layer |
| `meeting-indicator` | "In Meeting" dot on glass door |

## Mobile Version Notes

The mobile background (`background-mobile.png`) is the same scene but:
- Slightly tighter crop (less empty wall/floor at edges)
- Furniture details slightly simplified for clarity at small sizes
- The 3 zones remain distinguishable at `defaultZoom: 0.6`

At the mobile default zoom, the full office fits on a phone screen in landscape. In portrait, the work area is visible by default, and users pan right to see meeting room / lounge.

---

## Appendix A — Character Frame Naming Convention

```
char-{state}-{direction}-{frame}

Examples:
  char-idle-down-0
  char-idle-down-1
  char-idle-down-2
  char-idle-down-3
  char-working-right-0
  char-walking-up-5
```

## Appendix B — Coordinate Reference (Default Theme)

All coordinates are in canvas space (1920x1080 logical pixels).

| Element | x | y | w | h |
|---------|---|---|---|---|
| Work Area zone | 60 | 280 | 900 | 500 |
| Meeting Room zone | 1050 | 100 | 450 | 400 |
| Lounge zone | 1050 | 580 | 450 | 380 |
| Desk 1 seat | 160 | 380 | — | — |
| Desk 2 seat | 360 | 380 | — | — |
| Desk 3 seat | 560 | 380 | — | — |
| Desk 4 seat | 160 | 560 | — | — |
| Desk 5 seat | 360 | 560 | — | — |
| Desk 6 seat | 560 | 560 | — | — |
| Meeting seat 1 | 1150 | 220 | — | — |
| Meeting seat 2 | 1350 | 220 | — | — |
| Meeting seat 3 | 1150 | 380 | — | — |
| Meeting seat 4 | 1350 | 380 | — | — |
| Lounge seat 1 | 1150 | 700 | — | — |
| Lounge seat 2 | 1300 | 700 | — | — |
| Lounge seat 3 | 1150 | 850 | — | — |
| Entrance point | 960 | 1080 | — | — |
