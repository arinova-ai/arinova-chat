## Why

On mobile browsers and PWA, hover interactions don't exist. Message action buttons (copy, delete, react, retry) are completely inaccessible because they rely on `group-hover:opacity-100`. Similarly, the sidebar conversation three-dot menu is invisible since it also depends on hover to appear.

## What Changes

- **Message bubble**: Add long press (~500ms) gesture on touch devices that opens an action sheet with Copy, React, Delete, and Retry (if error) options. Desktop hover behavior remains unchanged.
- **Sidebar conversation item**: Make the three-dot menu button always visible on touch devices using CSS `@media (hover: none)`. Desktop hover behavior remains unchanged.
- No new dependencies. Pure CSS media query for device detection, no JS device sniffing.

## Capabilities

### New Capabilities
- `mobile-touch-actions`: Long press gesture handling for message bubbles and always-visible sidebar menu on touch devices.

### Modified Capabilities

(none — desktop behavior stays unchanged)

## Impact

- `apps/web/src/components/chat/message-bubble.tsx` — add long press handler + action sheet
- `apps/web/src/components/chat/conversation-item.tsx` — CSS change for always-visible ⋮ on touch
- May need a new action sheet / bottom sheet component (or use existing shadcn Drawer)
