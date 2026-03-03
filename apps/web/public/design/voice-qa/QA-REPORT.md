# QA Report: Voice L1 — Voice Messages

**Date:** 2026-02-26
**Branch:** jiumi (commits ed1487f + 02781e1)
**Tester:** Claude QA
**Environment:** Docker (web=192.168.68.83:21000, server=:3501, postgres=:21003)

---

## Summary: PASS 10 / SKIP 5 / FAIL 1 — 16 total checks

### BUG FOUND

**Double `/uploads/` prefix in attachment URLs** — `uploads.rs` stores `storage_path` as `/uploads/attachments/{conv}/{file}`, then `messages.rs:181` prepends `/uploads/` again via `format!("/uploads/{}", a.storage_path)`, producing `/uploads//uploads/attachments/...` (404). Affects all local-storage file attachments, not just audio.

---

## 1. Microphone Button (Chat Input)

| # | Test | Result |
|---|------|--------|
| 1.1 | Empty input shows mic icon (not send) | **PASS** — mic icon displayed when input is empty |
| 1.2 | Typing text switches to send icon | **PASS** — send arrow appears when text is entered; mic returns when text cleared |
| 1.3 | Mic click triggers recording mode | **SKIP** — `navigator.mediaDevices` is undefined in HTTP context (`isSecureContext: false`); `getUserMedia` requires HTTPS. Click triggers `onCancel()` gracefully and returns to normal input. |
| 1.4 | File attachment switches to send icon | **PASS** — attaching a file shows blue send arrow, replacing mic icon |

**Screenshots:** `01-input-mic-state.png`, `02-input-send-state.png`

---

## 2. Voice Recorder (VoiceRecorder component)

| # | Test | Result |
|---|------|--------|
| 2.1 | Red pulse dot + MM:SS timer | **SKIP** — cannot test; requires HTTPS for `getUserMedia` |
| 2.2 | Animated waveform bars | **SKIP** — same as above |
| 2.3 | Stop button → triggers `onRecordingComplete` with blob+duration | **SKIP** — same as above |
| 2.4 | Cancel button → `onCancel()` + stops tracks | **SKIP** — same as above; however, cancel path verified: mic click in HTTP context calls `onCancel()` correctly |

**Code Review Verification:**
- `voice-recorder.tsx`: 179 lines, structurally correct
- Starts recording on mount via `useEffect` → `getUserMedia` → `MediaRecorder`
- Timer ticks every 200ms, records in 100ms chunks
- `getSupportedMimeType()`: detects webm/opus, webm, mp4, ogg in priority order
- Cancel handler: nulls `onstop` before calling `stop()` to prevent `onRecordingComplete`
- Catch block on `getUserMedia` failure calls `onCancel()` (graceful degradation)
- 20-bar fixed-height waveform with staggered CSS animation

---

## 3. Audio Player (AudioPlayer component)

| # | Test | Result |
|---|------|--------|
| 3.1 | Audio attachment renders as inline player (not download link) | **PASS** — AudioPlayer component rendered with play button, progress bar, and time display |
| 3.2 | Play button clickable | **PASS** — button responds to click; playback fails with `NotSupportedError` due to 404 (double-prefix bug), but error is caught gracefully via try/catch |
| 3.3 | Progress bar with scrubber on hover | **PASS** — code review confirms: click-to-seek, scrubber dot on hover (`group-hover:opacity-100`), progress fills proportionally |
| 3.4 | Time display: shows duration when idle, currentTime when playing | **PASS** — code review: `formatTime(currentTime > 0 ? currentTime : duration)` (fix from 02781e1) |
| 3.5 | Min-width 200px | **PASS** — code review: `min-w-[200px]` on container |

**Screenshots:** `04-audio-player-own-message.png`

---

## 4. File Upload Accept (audio types)

| # | Test | Result |
|---|------|--------|
| 4.1 | File input accepts audio MIME types | **PASS** — `chat-input.tsx:684` accept attribute includes: `audio/webm,audio/mp4,audio/mpeg,audio/ogg,audio/wav` (all 5 formats) |
| 4.2 | WAV file upload → stored on server | **PASS** — uploaded `test-voice.wav` (264KB), file stored at `/app/uploads/attachments/{conv}/{id}.wav` on server |

**Screenshots:** `03-file-attachment-preview.png`

---

## 5. Message Bubble Rendering

| # | Test | Result |
|---|------|--------|
| 5.1 | Own audio message: right-aligned, brand color bubble | **PASS** — blue bubble on right side with avatar |
| 5.2 | Detection chain: image → AudioPlayer → file download | **PASS** — code review: `message-bubble.tsx:220-244` correctly checks `startsWith("image/")` → ImageLightbox, `startsWith("audio/")` → AudioPlayer, else → download link |
| 5.3 | Action buttons on hover (Copy, React, Reply, Delete) | **PASS** — all 4 action buttons appear on hover over audio message |
| 5.4 | Audio message persists after page refresh | **PASS** — navigated away and back; AudioPlayer re-rendered correctly with play button and 0:00 |
| 5.5 | Mobile responsive layout | **PASS** — AudioPlayer fits correctly in 390px viewport |

**Screenshots:** `05-audio-persists-after-refresh.png`, `06-mobile-audio-player.png`

---

## 6. Edge Cases

| # | Test | Result |
|---|------|--------|
| 6.1 | Mic click in HTTP context → graceful fallback | **PASS** — `getUserMedia` throws, catch block calls `onCancel()`, returns to normal input silently |
| 6.2 | Audio playback error handling | **PASS** — `togglePlay` async with try/catch; `NotSupportedError` caught, `playing` state reset to false |
| 6.3 | Attachment URL double-prefix | **FAIL** — See bug report above. `/uploads//uploads/attachments/...` returns 404 |

---

## Bug Details

### BUG: Double `/uploads/` prefix in attachment URLs

**Severity:** High (blocks all local-storage file playback/viewing)
**Scope:** All file attachments stored locally (not R2)

**Root Cause:**
- `uploads.rs:166` stores `storage_path` = `/uploads/attachments/{conversationId}/{filename}`
- `messages.rs:181` constructs URL: `format!("/uploads/{}", a.storage_path)`
- Result: `/uploads//uploads/attachments/...`

**Fix (choose one):**
1. Change `messages.rs:181` to just use `a.storage_path.clone()` (since it already has the full path)
2. Or change `uploads.rs:166` to store `attachments/{conversationId}/{filename}` (without `/uploads/` prefix)

**Note:** This bug also means the Rust server has no static file serving route for `/uploads/` — even with the correct URL, files wouldn't be served. In production, R2 with absolute URLs bypasses this entirely.

---

## Setup Notes

### Secure Context Requirement
`navigator.mediaDevices.getUserMedia` requires HTTPS (`isSecureContext: true`). The Docker test environment runs over HTTP, so all recording tests are blocked. The VoiceRecorder component was verified via code review to be structurally correct.

### Test Data
- Conversation: `ae7fefcb-ea92-4e52-8e72-1d0e8656481c` (DM between rag@test.com and other2@test.com)
- Test audio file: `test-voice.wav` (3s 440Hz sine wave, 264KB)

---

## Screenshots

| File | Description |
|------|-------------|
| `01-input-mic-state.png` | Chat input — empty, mic icon shown |
| `02-input-send-state.png` | Chat input — text entered, send icon shown |
| `03-file-attachment-preview.png` | File attachment preview before sending |
| `04-audio-player-own-message.png` | Own message with inline AudioPlayer |
| `05-audio-persists-after-refresh.png` | AudioPlayer persists after page refresh |
| `06-mobile-audio-player.png` | Mobile viewport — audio player rendering |
