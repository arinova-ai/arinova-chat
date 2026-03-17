# Arinova Office Theme — Starter Template

## Quick Start

1. Copy this `_template/` folder and rename it to your theme id (kebab-case):
   ```
   cp -r _template/ my-cool-theme/
   ```
2. Edit `theme.json` — update `id`, `name`, `author`, `description`, `tags`.
3. Create `theme.js` — your entry point (see below).
4. Replace `preview.png` with a 16:9 screenshot (recommended: 1280x720).
5. Upload via CLI:
   ```
   arinova-cli theme build
   arinova-cli theme upload theme.json my-cool-theme.zip
   ```

## Directory Structure

```
my-cool-theme/
  theme.json       # Theme manifest (required)
  theme.js         # Entry JS file (required)
  preview.png      # Store preview image (required, 16:9)
  assets/          # Static resources (optional)
    background.png
    sprites/
    audio/
```

## Theme Entry File

Your `theme.js` must export an object with lifecycle methods:

```js
export default {
  async init(sdk, container) {
    // sdk: Arinova SDK bridge (agents, events, asset loading)
    // container: DOM element to render into
    // Use any rendering tech: DOM, Canvas, WebGL, Three.js, PixiJS, etc.
  },
  resize(width, height) { /* viewport changed */ },
  destroy() { /* clean up */ },
};
```

## SDK Bridge

The `sdk` object provides:
- `sdk.agents` — current agent list
- `sdk.onAgentsChange(callback)` — subscribe to updates
- `sdk.selectAgent(id)` — notify host of agent click
- `sdk.assetUrl(path)` — resolve relative asset URLs
- `sdk.width`, `sdk.height`, `sdk.isMobile`, `sdk.pixelRatio`

## Development

```
arinova-cli theme init my-theme
cd my-theme
arinova-cli theme dev   # starts dev server at localhost:3100
```

## License

- `"standard"` — Theme can be used by anyone who purchases it.
- `"exclusive"` — Only one user can own this theme at a time.
