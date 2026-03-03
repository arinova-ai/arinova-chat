# QA Report: Drag-and-Drop File Upload

**Date:** 2026-02-26
**Branch:** jiumi (commits f85967a + 9173a6e)
**Tester:** Claude QA (static code review + TSC type check)
**Build:** `npx tsc --noEmit` PASS

---

## Summary: PASS 6 / SKIP 1 / FAIL 0

---

## T1: Drag Event Handling

| # | Test | Result |
|---|------|--------|
| T1.1 | handleDragEnter increments dragCounterRef, checks for Files type, sets isDragging | **PASS** — `chat-area.tsx:38-45`: `dragCounterRef.current++` then `if (e.dataTransfer.types.includes("Files")) setIsDragging(true)`. Correctly uses `useCallback([], [])` for stable reference. Counter pattern handles nested child elements firing duplicate enter events. |
| T1.2 | handleDragLeave decrements counter, only resets isDragging at 0 | **PASS** — `chat-area.tsx:47-54`: `dragCounterRef.current--; if (dragCounterRef.current === 0) setIsDragging(false)`. Prevents premature overlay dismissal when leaving child elements. |
| T1.3 | handleDragOver prevents default (required to enable drop) | **PASS** — `chat-area.tsx:56-59`: `e.preventDefault(); e.stopPropagation()`. Without `preventDefault()` on dragover, the browser would not fire the `drop` event. |
| T1.4 | handleDrop resets state and captures first file | **PASS** — `chat-area.tsx:61-70`: Resets `isDragging(false)` and `dragCounterRef.current = 0`, then `setDroppedFile(files[0])`. Only takes the first file (single-file upload). |
| T1.5 | All 4 handlers attached to outer div | **PASS** — `chat-area.tsx:108-111`: `onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}` on the root `<div>`. |

---

## T2: Drop Zone Overlay

| # | Test | Result |
|---|------|--------|
| T2.1 | Overlay renders conditionally on isDragging | **PASS** — `chat-area.tsx:113-120`: `{isDragging && (<div className="absolute inset-0 z-50 ...">...</div>)}`. |
| T2.2 | Overlay covers entire chat area with visual feedback | **PASS** — Classes: `absolute inset-0 z-50` (full coverage), `border-2 border-dashed border-primary bg-primary/10` (dashed border + tinted background), `pointer-events-none` (doesn't intercept the drop event on parent). |
| T2.3 | Upload icon and text displayed | **PASS** — `Upload` icon from lucide-react (`h-12 w-12`) + `<p className="text-lg font-medium">Drop file to upload</p>`. Centered with `flex items-center justify-center`. |

---

## T3: File Passing to ChatInput

| # | Test | Result |
|---|------|--------|
| T3.1 | droppedFile state initialized as null | **PASS** — `chat-area.tsx:35`: `const [droppedFile, setDroppedFile] = useState<File | null>(null)`. |
| T3.2 | droppedFile and onDropHandled passed to ChatInput | **PASS** — `chat-area.tsx:139`: `<ChatInput droppedFile={droppedFile} onDropHandled={() => setDroppedFile(null)} />`. The `onDropHandled` callback resets the parent state to `null`. |
| T3.3 | ChatInput receives and processes droppedFile via useEffect | **PASS** — `chat-input.tsx:109-117`: `useEffect(() => { if (!droppedFile) return; if (isAcceptedFile(droppedFile)) { setSelectedFile(droppedFile); } else { useToastStore.getState().addToast("Unsupported file type"); } onDropHandled?.(); }, [droppedFile, onDropHandled])`. Correct flow: validate → set or toast → notify parent. |
| T3.4 | ChatInputProps interface with optional props + default | **PASS** — `chat-input.tsx:58-61`: `interface ChatInputProps { droppedFile?: File \| null; onDropHandled?: () => void; }`. Line 65: `({ droppedFile, onDropHandled }: ChatInputProps = {})` — default `{}` ensures backward compatibility. |

---

## T4: File Type Validation

| # | Test | Result |
|---|------|--------|
| T4.1 | ACCEPTED_TYPES Set with correct types | **PASS** — `chat-input.tsx:48-52`: Covers images (`image/jpeg, image/png, image/gif, image/webp`), documents (`application/pdf, text/plain, text/csv, application/json`), and audio (`audio/webm, audio/mp4, audio/mpeg, audio/ogg, audio/wav`). 14 types total. |
| T4.2 | isAcceptedFile uses strict Set lookup | **PASS** — `chat-input.tsx:54-56`: `return ACCEPTED_TYPES.has(file.type)`. O(1) lookup, strict match (no substring/wildcard). |
| T4.3 | Unsupported files show toast notification | **PASS** — `chat-input.tsx:113-114`: `useToastStore.getState().addToast("Unsupported file type")`. Toast is shown immediately, file is NOT set as selectedFile. |
| T4.4 | Accepted files go to selectedFile state | **PASS** — `chat-input.tsx:111-112`: `if (isAcceptedFile(droppedFile)) { setSelectedFile(droppedFile); }`. This triggers the existing file preview UI (file name, size, remove button). |
| T4.5 | ACCEPTED_TYPES matches file input accept attribute | **PASS** — `chat-input.tsx:711`: `accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv,application/json,audio/webm,audio/mp4,audio/mpeg,audio/ogg,audio/wav"`. All 14 types match between the Set and the `<input accept>` attribute. Commit 9173a6e ensured strict audio type validation consistency. |

---

## T5: Existing Features Unaffected

| # | Test | Result |
|---|------|--------|
| T5.1 | ChatInput backward-compatible (no required new props) | **PASS** — `ChatInputProps` has all optional fields (`droppedFile?: File \| null; onDropHandled?: () => void`), and the default destructure `= {}` means any existing caller of `<ChatInput />` without props continues to work. |
| T5.2 | Manual file upload (paperclip button) unaffected | **PASS** — `chat-input.tsx:698-713`: The `<Paperclip>` button, `<input type="file">`, and `handleFileSelect` callback are unchanged. Both manual selection and drag-drop converge on `setSelectedFile()`. |
| T5.3 | Voice recording unaffected | **PASS** — `chat-input.tsx:416-462`: `handleVoiceUpload` and `<VoiceRecorder>` are unchanged. |
| T5.4 | Slash command popup unaffected | **PASS** — Slash command logic (lines 119-345) is completely independent of the drag-drop changes. |
| T5.5 | Thread panel and message list unaffected | **PASS** — `chat-area.tsx`: ThreadPanel rendered at line 167, MessageList at line 138. Neither component changed. Drag handlers are on the parent div and don't interfere with child event propagation (each handler calls `e.stopPropagation()` only on drag events, not click/input events). |

---

## T6: TypeScript Type Check

| # | Test | Result |
|---|------|--------|
| T6.1 | `npx tsc --noEmit` passes | **PASS** — No type errors. All new types (`ChatInputProps`, `ACCEPTED_TYPES`, `isAcceptedFile`, drag state/handlers) are correctly typed. |

---

## T7: Frontend Screenshot

| # | Test | Result |
|---|------|--------|
| T7.1 | Drag overlay visual test | **SKIP** — Test account (cozy@test.com) has no direct or group conversations. The `ChatArea` component only renders (with drag handlers) when `activeConversationId` is set. Without an active conversation, `EmptyState` renders instead, which does not have drag-drop support. |

**Reason:** Same as Thread QA — Docker test environment has no seeded conversation data. The drag-drop overlay components exist and compile (TSC passes), but visual testing requires either: (a) seeding a conversation via the API, or (b) manual testing via a development server with real conversations.

---

## Architecture Overview

```
┌──────────────────────────────────────────────┐
│              ChatArea (chat-area.tsx)          │
│                                                │
│  State:                                        │
│    isDragging: boolean                         │
│    droppedFile: File | null                    │
│    dragCounterRef: useRef<number>(0)           │
│                                                │
│  Handlers (on root div):                       │
│    onDragEnter → counter++ → isDragging=true   │
│    onDragLeave → counter-- → if 0, false       │
│    onDragOver  → preventDefault (enable drop)  │
│    onDrop      → reset → setDroppedFile(f[0])  │
│                                                │
│  ┌──────────────────────────────────────────┐  │
│  │  {isDragging && <DropOverlay />}         │  │
│  │  absolute inset-0 z-50 pointer-events-  │  │
│  │  none, border-dashed, Upload icon       │  │
│  └──────────────────────────────────────────┘  │
│                                                │
│  <ChatInput                                    │
│    droppedFile={droppedFile}                    │
│    onDropHandled={() => setDroppedFile(null)}   │
│  />                                            │
└──────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────┐
│            ChatInput (chat-input.tsx)          │
│                                                │
│  ACCEPTED_TYPES = Set([14 MIME types])         │
│  isAcceptedFile(file) → ACCEPTED_TYPES.has()   │
│                                                │
│  useEffect([droppedFile]):                     │
│    if accepted → setSelectedFile(file)         │
│    else        → toast("Unsupported file")     │
│    onDropHandled() → parent resets to null      │
│                                                │
│  Existing paths:                               │
│    Paperclip → <input> → handleFileSelect      │
│    Voice     → VoiceRecorder → handleVoice     │
│    Both converge on setSelectedFile / upload    │
└──────────────────────────────────────────────┘
```

---

## Findings & Notes

### Design Decisions

1. **Single-file drop**: `handleDrop` only takes `files[0]` — intentional single-file upload design. Multi-file would need UI changes (preview list, batch upload). Current approach is clean and consistent with the manual file picker (also single-file).

2. **dragCounterRef pattern**: Classic solution for nested element drag events. Without the counter, `dragLeave` fires when entering a child element, causing the overlay to flicker. The ref (not state) avoids re-renders on counter changes.

3. **pointer-events-none on overlay**: Critical detail — the overlay doesn't intercept the drop event. The drop is handled by the parent div's `onDrop`, and the overlay is purely visual.

4. **Separation of concerns**: ChatArea handles the drag-drop UX (overlay + file capture), ChatInput handles validation + file state. Clean boundary — ChatInput doesn't need to know about drag events.

### Edge Cases

1. **Empty file.type**: Some OS/browser combinations may produce a `File` object with an empty `type` string (e.g., files with unknown extensions). The strict `ACCEPTED_TYPES.has(file.type)` will correctly reject these with a toast.

2. **Multiple rapid drops**: Each drop sets `droppedFile` state, triggering the useEffect. If a user drops files rapidly, each drop replaces the previous `droppedFile`. The `onDropHandled?.()` cleanup ensures no stale state. The last valid file wins.

3. **Drop outside active conversation**: If `activeConversationId` is null, `ChatArea` returns `<EmptyState />` which has no drag handlers — drops are ignored by the browser default (no-op). Correct behavior.
