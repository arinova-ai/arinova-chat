# Arinova Office Theme — Starter Template

## Quick Start

1. Copy this `_template/` folder and rename it to your theme id (kebab-case):
   ```
   cp -r _template/ my-cool-theme/
   ```
2. Edit `theme.json` — update `id`, `name`, `author`, `description`, `tags`.
3. Replace `preview.png` with a 16:9 screenshot of your theme (recommended: 1280x720).
4. Add your background image and sprite assets.
5. Validate your theme:
   ```
   npx arinova-theme-validate ./my-cool-theme/
   ```
6. Upload via the Creator Dashboard or CLI.

## Directory Structure

```
my-cool-theme/
  theme.json       # Theme manifest (required)
  preview.png      # Store preview image (required, 16:9, max 1280x720)
  background.png   # Main background image
  background@2x.png  # Retina background (optional)
  background-mobile.png  # Mobile background (optional)
  sprites/         # Sprite assets for furniture, characters, effects
    desk.png
    plant.png
    characters.png
  audio/           # Audio assets (optional)
    ambient.mp3
```

## Theme Types

### v2 — PixiJS (2D sprite-based)
Set `renderer` to `"pixi"` (default). Requires:
- `canvas` with background image
- `layers` array (z-ordering)
- `zones` array with seats (agent positions)
- `characters` config (sprite atlas)
- `furniture` array (decorative sprites)

### v3 — Three.js (3D model-based)
Set `renderer` to `"threejs"`. Requires:
- `room.model` — path to a `.glb` room model
- `character.model` — path to a `.glb` animated character
- `camera` — camera position and settings
- `lighting` — ambient and directional lights

## Asset Guidelines

| Asset Type | Format | Max Size | Max Dimensions |
|------------|--------|----------|----------------|
| Background | PNG, JPG, WebP | 10 MB | 4096x4096 |
| Sprites | PNG, JPG, WebP | 10 MB | 4096x4096 |
| Preview | PNG | 10 MB | 1280x720 recommended |
| GLB (High) | GLB, glTF | 50 MB | — |
| GLB (Performance) | GLB, glTF | 20 MB | — |
| Audio | MP3, OGG | 5 MB | — |
| theme.json | JSON | 256 KB | — |
| Total bundle | — | 200 MB | — |

## Quality Modes

Add a `quality` block to provide alternative assets for High Resolution and Performance modes:

```json
{
  "quality": {
    "high": {
      "room": { "model": "models/room-high.glb" },
      "background": { "image": "background@2x.png" }
    },
    "performance": {
      "room": { "model": "models/room-low.glb" },
      "background": { "image": "background-low.png" }
    }
  }
}
```

When quality overrides are defined, both `high` and `performance` asset files must exist in the bundle.

## Manifest Reference

See the included `theme.json` for a fully annotated example of all available fields.

For the complete type definitions, refer to:
- `apps/web/src/components/office/theme-types.ts` — TypeScript interfaces
- `packages/shared/src/schemas/theme.ts` — Zod validation schema

## License

- `"standard"` — Theme can be used by anyone who purchases it.
- `"exclusive"` — Only one user can own this theme at a time.
