## Context

Arinova Chat uses hover-dependent UI for two key interactions: message action buttons (`group-hover:opacity-100` in message-bubble.tsx) and the sidebar conversation three-dot menu (`group-hover:opacity-100` in conversation-item.tsx). These are completely inaccessible on touch devices (mobile browsers, PWA).

Existing shadcn/ui components available: `Sheet` (slide-in panel), `Dialog`, `Popover`. No `Drawer` component installed yet.

## Goals / Non-Goals

**Goals:**
- Message actions (copy, react, delete, retry) accessible via long press on touch devices
- Sidebar three-dot menu always visible on touch devices
- Desktop hover behavior unchanged
- No JS device detection — use CSS `@media (hover: none)` only

**Non-Goals:**
- Swipe gestures
- Redesigning the desktop hover UX
- Adding new message actions beyond what exists today

## Decisions

### 1. Long press for message actions → action sheet

**Choice**: Custom `useLongPress` hook + shadcn Sheet (bottom sheet style) for the action menu.

**Why Sheet over Dialog/Popover**: Sheet with `side="bottom"` provides the native mobile action sheet feel (slides up from bottom). Dialog feels too desktop-centric. Popover lacks the full-width mobile treatment.

**Why custom hook over library**: A `useLongPress` hook is ~15 lines (touchstart timer + touchend/touchmove cancel). No need for a dependency.

**Threshold**: 500ms hold time. Cancel on touchmove (>10px) to avoid triggering during scroll.

### 2. CSS media query for sidebar visibility

**Choice**: Add `[@media(hover:none)]:opacity-100` to the existing three-dot button className.

**Why**: Single CSS class addition. No JS, no state changes, no conditional rendering. The button already exists and works — it just needs to be visible.

### 3. Haptic feedback

**Choice**: Call `navigator.vibrate(50)` on long press trigger if available. Silent no-op if not supported.

**Why**: Provides tactile confirmation that long press was recognized, matching native app behavior.

## Risks / Trade-offs

- **[Risk] Long press conflicts with text selection** → Set `user-select: none` on message bubble during touch, or use `touch-action: none` on the bubble. Text can still be copied via the action sheet's Copy button.
- **[Risk] Sheet may feel heavy for simple actions** → Keep the sheet minimal: icon + label per action, no extra chrome. Consider switching to a lightweight popover if sheet feels sluggish.
- **[Risk] `@media (hover: none)` on hybrid devices (Surface, iPad with trackpad)** → These devices support both touch and hover. The ⋮ will always show, which is acceptable — it's a small icon that doesn't hurt desktop UX significantly.
