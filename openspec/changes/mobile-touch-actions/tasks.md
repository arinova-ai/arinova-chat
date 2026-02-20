## 1. Long Press Hook

- [x] 1.1 Create `useLongPress` hook in `apps/web/src/hooks/use-long-press.ts` — accepts callback + options (threshold 500ms, moveThreshold 10px), returns `onTouchStart`/`onTouchEnd`/`onTouchMove` handlers. Calls `navigator.vibrate(50)` on trigger.

## 2. Message Action Sheet

- [x] 2.1 Create `MessageActionSheet` component using shadcn Sheet (`side="bottom"`) — accepts message, open state, and action callbacks (copy, delete, retry, react). Shows relevant actions based on message role/status.
- [x] 2.2 Integrate `useLongPress` + `MessageActionSheet` into `MessageBubble` — long press opens action sheet on touch devices. Wire up Copy, Delete, Retry, React actions to existing store methods.

## 3. Sidebar Touch Visibility

- [x] 3.1 Add `[@media(hover:none)]:opacity-100` to the three-dot menu button className in `conversation-item.tsx` so it's always visible on touch devices.

## 4. Verify

- [x] 4.1 Test on mobile Safari / Chrome — long press message shows action sheet, all actions work, sidebar ⋮ always visible. Desktop hover behavior unchanged.
