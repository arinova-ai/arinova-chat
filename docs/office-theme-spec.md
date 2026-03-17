# Virtual Office — Theme SDK Spec

> Version 2.0.0 | 2026-03-17

---

## 1. Overview

The Virtual Office theme system uses **sandboxed iframes**. Each theme ships an entry JS file and any assets it needs. The platform loads the theme in an iframe and provides an SDK bridge for communication.

### Design Principles

- **Creator freedom** — use any rendering technology (Canvas 2D, WebGL, Three.js, PixiJS, plain DOM, etc.) inside the iframe.
- **Sandboxed** — themes run in an iframe with `allow-scripts allow-same-origin`. They cannot access the parent page directly.
- **Data-driven** — the SDK bridge provides agent data; the theme decides how to render it.
- **Mobile-first** — themes receive viewport dimensions and should adapt responsively.

---

## 2. Theme Package Structure

```
my-theme/
  theme.json      # manifest (required)
  theme.js        # entry point (required)
  assets/         # static resources (optional)
    background.png
    sprites/
    audio/
```

---

## 3. Theme Manifest — `theme.json`

```json
{
  "id": "my-cool-theme",
  "name": "My Cool Theme",
  "version": "1.0.0",
  "author": {
    "name": "Creator Name",
    "id": "creator-id"
  },
  "description": "A description of the theme.",
  "tags": ["modern", "minimal"],
  "preview": "preview.png",
  "license": "standard",
  "entry": "theme.js"
}
```

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Kebab-case identifier (e.g. `my-cool-theme`) |
| `name` | string | Display name (1-100 chars) |
| `version` | string | Semver (e.g. `1.0.0`) |
| `author` | object | `{ name, id }` |
| `description` | string | 1-500 chars |
| `tags` | string[] | Up to 20 tags |
| `preview` | string | Relative path to preview image |
| `license` | string | `"standard"` or `"exclusive"` |
| `entry` | string | Relative path to entry JS file |

---

## 4. Theme Entry File

The entry file must export a default object with lifecycle methods:

```js
// theme.js
export default {
  // Called once when the theme is loaded
  async init(sdk, container) {
    // sdk: the Arinova SDK bridge
    // container: a <div> element to render into

    // Render your theme using any technology
    container.innerHTML = '<div id="office">...</div>';

    // Listen for agent updates
    sdk.onAgentsChange((agents) => {
      // Re-render with updated agent data
    });

    // Initial render
    renderAgents(sdk.agents);
  },

  // Called when the viewport resizes
  resize(width, height) {
    // Adjust your rendering
  },

  // Called when the theme is unloaded
  destroy() {
    // Clean up resources
  },
};
```

---

## 5. SDK Bridge API

The `sdk` object passed to `init()` provides:

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `agents` | Agent[] | Current list of agents |
| `width` | number | Viewport width |
| `height` | number | Viewport height |
| `isMobile` | boolean | `true` if width < 768 |
| `pixelRatio` | number | Device pixel ratio |
| `themeId` | string | Current theme ID |
| `themeVersion` | string | Current theme version |

### Methods

| Method | Description |
|--------|-------------|
| `onAgentsChange(callback)` | Subscribe to agent updates. Returns unsubscribe function. |
| `getAgent(id)` | Get a single agent by ID |
| `selectAgent(id)` | Notify the host that user clicked an agent |
| `openChat(id)` | Open chat with an agent |
| `navigate(path)` | Navigate to a path in the host app |
| `assetUrl(relativePath)` | Resolve a relative asset path to a full URL |
| `loadJSON(relativePath)` | Fetch and parse a JSON asset |
| `emit(event, data)` | Emit a custom event to the host |

### Agent Object

```ts
interface Agent {
  id: string;
  name: string;
  role: string;
  emoji: string;
  color: string;
  status: "working" | "idle" | "blocked" | "collaborating";
  online: boolean;
  currentTask: { title: string; priority: string; progress: number } | null;
  collaboratingWith: string[];
  recentActivity: { time: string; text: string }[];
}
```

---

## 6. Development

### Scaffold a new theme

```bash
arinova-cli theme init my-theme
cd my-theme
arinova-cli theme dev
```

The dev server starts at `http://localhost:3100` with live reload and mock agent data.

### Build for upload

```bash
arinova-cli theme build
# Creates my-theme.zip
arinova-cli theme upload theme.json my-theme.zip
```

---

## 7. File Size Constraints

| Asset | Max Size |
|-------|----------|
| Single image | 10 MB |
| Audio file | 5 MB |
| theme.json | 256 KB |
| Total bundle | 200 MB |
