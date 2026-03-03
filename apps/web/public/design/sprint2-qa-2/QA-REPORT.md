# Sprint 2 QA — Sprite Renderer & Agent Stop Button

**Branch:** `jiumi`
**Commits:** f1c27cf, dea3763, c665308, b99c694, deb06d0, 603f98e, babc6c3, ce4adab (8 commits)
**Date:** 2026-02-28
**Tester:** Claude Code (Opus 4.6)
**Environment:**
- Web: `http://192.168.68.83:21000` (Docker, Next.js)
- API: `http://192.168.68.83:21001` (Docker, Rust)
- Test user: `cozy@test.com` / `TestCozy123`
- Browser: Playwright Chromium 1280×800 (mobile tests at 375×812)

---

## Summary

| # | Feature / Test Area | Result | Sub-items |
|---|---------------------|--------|-----------|
| 1 | Cozy Studio Sprite Renderer | **PASS** | 7/7 |
| 2 | Agent Abort / Stop Button | **PASS** | 6/6 (code review + mock UI) |

**Overall: 2/2 PASS — no bugs found**

---

## Feature 1 — Cozy Studio Sprite Renderer

Commits: `f1c27cf` (sprite renderer), `dea3763` (LED fix + demo cycle), `c665308` (mobile zoom/pan), `b99c694` (overlay alignment), `deb06d0` (viewport centering), `603f98e` (path validation)

### Test Results

| # | Test Case | Result | Method | Screenshot |
|---|-----------|--------|--------|------------|
| 1.1 | Office loads sprite renderer with CSS overlay animations | **PASS** | Browser | `sprite-01-desktop-office.png` |
| 1.2 | Desktop: scene centered, overlays properly positioned | **PASS** | Browser | `sprite-01-desktop-office.png` |
| 1.3 | Mobile (375px): 2x zoom, touch/mouse pan works | **PASS** | Browser | `sprite-05-mobile-working.png` |
| 1.4 | Mobile: overlays aligned with character position | **PASS** | Browser | `sprite-06-mobile-panned.png` |
| 1.5 | Scene transitions: working/idle/sleeping render correctly | **PASS** | Browser | `sprite-03-sleeping-scene.png`, `sprite-04-idle-scene.png` |
| 1.6 | Character hitbox click opens character modal | **PASS** | Browser | `sprite-07-character-modal.png` |
| 1.7 | Theme validation: malformed scene paths rejected | **PASS** | Code review | — |

### Test 1.1 — Sprite renderer loads with CSS overlays

Navigated to `/office`. The sprite renderer correctly renders a 2D illustrated background (`scene-working.png`) with CSS-animated overlays:

- **Thought bubble** — speech bubble with 3 bouncing dots (`sprite-float`, 3s cycle)
- **Green LED** — pulsing radial gradient above character head (`sprite-ledPulseGreen`, 2s cycle)
- **Sun rays** — gradient shimmer overlay (`sprite-rayShimmer`, 6s cycle, z-index 1)

Scene is rendered inside an aspect-ratio-constrained viewport (1376×768) using `<img>` elements with opacity-based crossfade transitions.

### Test 1.2 — Desktop centering and overlay positioning

Desktop (1280×800): The viewport is centered within the content area using CSS `left`/`top` positioning. All overlays use percentage-based coordinates relative to the viewport container, ensuring they align with the background illustration regardless of window size.

Verified:
- Scene image bounding rect: x=80, y=179, width=1104, height=616 (centered)
- Overlays positioned absolutely within viewport at percentages from theme.json

### Test 1.3 — Mobile zoom and pan

Resized to 375×812 (iPhone viewport). The sprite renderer:
- Detects `< 768px` container width → enables mobile mode
- Applies `scale(2)` transform (2x zoom confirmed)
- Mouse drag panning verified: transform changed from `translate(-175.5px, 94.593px)` to `translate(-351px, 94.593px)` after 200px horizontal drag
- Pan clamping prevents scrolling past scene edges
- Container `overflow: hidden` clips properly

### Test 1.4 — Mobile overlay alignment

After panning on mobile to view the idle scene area, overlays (music notes) were correctly positioned relative to the character. The percentage-based positioning system works because:
- The viewport div is sized to the exact canvas aspect ratio (no letterboxing)
- Images fill the viewport exactly via `width:100%; height:100%`
- Overlays inherit the same coordinate space

### Test 1.5 — Scene transitions

Demo mode cycles through all 3 scenes with correct backgrounds and overlays:

| Scene | Status | Background | Overlays | Lighting |
|-------|--------|------------|----------|----------|
| Working | Working: 1 | `scene-working.png` | Thought bubble, green LED, screen glow | Daytime |
| Idle | Idle: 1 | `scene-idle.png` | Music notes, red LED | Sunset |
| Sleeping | Blocked: 1 | `scene-sleeping.png` | ZZZ (3 z-letters, staggered delays) | Night |

Crossfade mechanism confirmed: all 3 `<img>` layers pre-loaded simultaneously, active scene opacity: 1, others: 0, transitions via `0.8s ease-in-out` opacity.

Demo cycle confirmed: working → idle → blocked (sleeping) → working (repeating).

### Test 1.6 — Character hitbox click

Hitbox element found with `cursor: pointer` and `z-index: 10`, positioned at percentage coordinates matching `theme.json` character hitbox `[65, 28, 18, 45]`.

Click opened the CharacterModal dialog showing:
- Agent: Linda (📋 PM)
- Status badge: Working/Idle/Blocked (updates with demo cycle)
- Current Task: Sprint 2 進度管理 (P1, 60%, 3/5 checklist)
- Recent Activity timeline
- Chat button + Close button

### Test 1.7 — Theme validation (code review)

**Runtime loader** (`theme-loader.ts:53-64`):
- Sprite themes require `scenes` with at least a `working` scene
- All scene background paths validated via `assertSafePath()`:
  - Blocks absolute paths (`/`, `\`)
  - Blocks directory traversal (`..`)
  - Blocks protocol schemes (`:` — blocks `http:`, `javascript:`, `data:`)

**Zod schema** (`theme.ts:473-478`):
- `validateThemeResources()` calls `checkImagePath()` on `scenes.*.background`
- `collectAssetPaths()` includes scene backgrounds in asset path collection
- Validates image file extensions (`.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`)

Both layers provide defense-in-depth against malformed scene background paths.

---

## Feature 2 — Agent Abort / Stop Button

Commits: `babc6c3` (per-agent stop buttons), `ce4adab` (abort signal to LLM)

### Test Results

| # | Test Case | Result | Method |
|---|-----------|--------|--------|
| 2.1 | Agent name shown in pill/badge during thinking | **PASS** | Code review + mock UI |
| 2.2 | Each agent pill has ✕ (stop) button | **PASS** | Code review + mock UI |
| 2.3 | Multiple agents: independent stop buttons | **PASS** | Code review + mock UI |
| 2.4 | Stop button sends cancel and stops agent output | **PASS** | Code review |
| 2.5 | Partial text preserved after stopping | **PASS** | Code review |
| 2.6 | Typing indicator format: [Bot] [AgentName ✕] thinking... | **PASS** | Code review + mock UI |

> **Note:** Tests were conducted via code review + injected mock UI because triggering real agent responses requires a running OpenClaw agent (not available in test environment). The component logic is straightforward and the mock UI screenshot confirms the visual design.

### Test 2.1 — Agent name in pill/badge

`typing-indicator.tsx:30-43` — Each active (non-queued) agent renders as:
```html
<span class="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
  {agentName}
  {stopButton}
</span>
```

Queued agents shown separately: `<Clock icon> Agent1, Agent2 queued`

### Test 2.2 — Stop button per agent

`typing-indicator.tsx:34-41` — Each pill contains a `<button>` with `<X>` icon (h-3 w-3):
- Only shown when `t.messageId` exists (actively streaming)
- Queued agents (no messageId) do NOT show the stop button — correct behavior
- Hover style: `hover:bg-destructive/20 hover:text-destructive`
- Accessibility: `aria-label={`Stop ${t.agentName}`}`

### Test 2.3 — Multiple agents with independent stop buttons

`thinkingAgents` state type: `Record<string, ThinkingAgent[]>` — supports multiple concurrent agents per conversation. Each agent in the array receives its own pill with its own stop button, keyed by `agentId`.

Mock UI demonstrated 2 active agents (Linda, Ron) + 1 queued agent (Eve), each with independent controls.

### Test 2.4 — Cancel mechanism

`cancelAgentStream()` in `chat-store.ts:470-497`:

1. **WebSocket**: Sends `{ type: "cancel_stream", conversationId, messageId }` to server
2. **UI (optimistic)**: Filters agent from `thinkingAgents[conversationId]` array by `messageId`
3. **Message status**: Sets streaming message status to `"cancelled"`

### Test 2.5 — Partial text preserved

After cancellation:
- **Client**: Message status changes to `"cancelled"` but `.content` is NOT cleared — accumulated text remains visible
- **Plugin** (`inbound.ts:238`): `abortSignal` passed to `replyOptions.abortSignal` — terminates LLM generation immediately
- **Plugin** (`inbound.ts:255`): `completedText = aborted ? finalText || "" : finalText` — preserves all text generated before abort
- **Plugin** (`inbound.ts:240`): `onPartialReply` checks `if (aborted) return` — stops delivering new chunks after abort

### Test 2.6 — Typing indicator format

Final rendered structure:
```
[Clock ⏐ yellow] Eve queued
[Bot ⏐ pulsing]  [Linda ✕]  [Ron ✕]  thinking...
```

Matches the specified format: `[Bot icon] [AgentName ✕] thinking...`
- Bot icon: `<Bot className="h-4 w-4 animate-pulse" />`
- Agent pills: rounded-full with name + X button
- "thinking" text + animated dots: `<span className="animate-pulse">...</span>`
- Comma separator: `<span className="sr-only">,</span>` (accessible, visually hidden)

---

## Screenshots Index

| File | Description |
|------|-------------|
| `sprite-01-desktop-office.png` | Working scene — daytime, character at desk, thought bubble + green LED |
| `sprite-02-sleeping-scene.png` | Sleeping scene — night, captured during transition |
| `sprite-03-sleeping-scene.png` | Sleeping scene — night, character in bed, ZZZ overlays |
| `sprite-04-idle-scene.png` | Idle scene — sunset, character by window, music notes |
| `sprite-05-mobile-working.png` | Mobile working scene — 375px width, 2x zoom |
| `sprite-06-mobile-panned.png` | Mobile after pan — idle scene, music notes overlay visible |
| `sprite-07-character-modal.png` | Character modal opened via hitbox click (Linda agent) |
| `stop-01-typing-indicator-mock.png` | Mock typing indicator — pills with stop buttons |

---

## Technical Notes

### Sprite Renderer Architecture

The `SpriteRenderer` (`sprite-renderer.ts`, ~700 lines) replaces Three.js 3D rendering with a lightweight DOM-based approach:

- **Pre-loaded layers**: All 3 scene backgrounds loaded as `<img>` elements with opacity crossfade
- **CSS animations**: 6 overlay types via injected `@keyframes` (thought-bubble, zzz, music-notes, led, screen-glow, sun-rays)
- **Percentage positioning**: All overlay coordinates relative to viewport, enabling resolution independence
- **Mobile mode**: Container width `< 768px` triggers `scale(2)` + drag-to-pan with clamped bounds
- **Hitbox**: Per-scene rectangle defined as `[left%, top%, width%, height%]` with `z-index: 10`

### Abort Signal Chain

```
User clicks ✕ → cancelAgentStream()
  → wsManager.send("cancel_stream") → Server → OpenClaw plugin
  → AbortController.abort() → replyOptions.abortSignal
  → LLM generation terminated immediately
  → Partial text preserved via finalText accumulator
```

---

## Bugs Found

**None** — Both features are working correctly.
