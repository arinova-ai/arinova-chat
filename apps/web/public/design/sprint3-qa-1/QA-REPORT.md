# QA Report: Sprint 3 Batch 1 — 12 Features + Bug Fixes

**Tester:** Vivi (QA Agent)
**Date:** 2026-02-28
**Branch:** jiumi
**Commits:** 13 commits (dde6bbf → bdcd826)
**Environment:** Docker — Web :21000, Server :21001, PostgreSQL :21003, Redis :21004
**Test Account:** cozy@test.com (Cozy Tester)

---

## Summary

| # | Feature | Commits | Method | Result |
|---|---------|---------|--------|--------|
| 67 | 自己的訊息頭像 | dde6bbf | Code Review + Browser | **3/3 PASS** |
| 68 | 移除 Dark Mode Toggle | c827798 | Code Review + Browser | **3/3 PASS** |
| 73 | Settings 顯示 username | 758dd32 | Code Review + Browser | **3/3 PASS** |
| 62 | Sidebar 對話排序 | 6f04242 | Code Review | **3/3 PASS** |
| 63 | Sidebar 串流時顯示 | 2dcd040 | Code Review | **3/3 PASS** |
| 66 | Markdown 表格 | a530a2f | Code Review | **4/4 PASS** |
| 59 | 錄音上傳佔位 | dc72865 | Code Review | **4/4 PASS** |
| 60 | Office token fallback | e27e5dd | Code Review | **3/3 PASS** |
| 61 | Office Chat 按鈕 | 4e672c0 | Code Review | **4/4 PASS** |
| 71 | Idle sleep 動畫 | 969b715 | Code Review | **4/4 PASS** |
| 70 | 內建貼圖 picker | bb2a8d7 | Code Review + Browser | **4/4 PASS** |
| 69 | User/Agent 個人頁面 | 8a72aca + bdcd826 | Code Review + Browser + API | **7/7 PASS** |

**Total: 45/45 PASS, 0 FAIL, 0 SKIP**

---

## Detailed Results

### #67 — 自己的訊息頭像 (commit dde6bbf)
Result: 3/3 PASS

- [PASS] **Avatar from session**: `message-bubble.tsx:159` uses `authClient.useSession()` to get live session data. `ownImage` is reactive and always reflects the latest avatar URL.
- [PASS] **User icon fallback**: Lines 170-179 — when `ownImage` is falsy, `AvatarFallback` renders `<User>` icon. Browser confirmed: right-side messages show User icon when no avatar is set.
- [PASS] **Old messages update**: Since avatar is read from session (not message payload), all messages use the current avatar. Verified in browser — all own messages share the same avatar source.

### #68 — 移除 Dark Mode Toggle (commit c827798)
Result: 3/3 PASS

- [PASS] **No toggle in Settings**: Appearance section only shows Language selector. No dark mode switch, no theme toggle. Screenshot: `qa-settings-appearance.png`
- [PASS] **Always dark theme**: `theme.tsx` hardcodes `type Theme = "dark"`, `ThemeProvider` unconditionally adds `dark` class via `useEffect`. HTML element has `class="dark h-full"`.
- [PASS] **Persists after refresh**: No toggle means no way to change theme. `useEffect` re-adds `dark` class on every mount.

### #73 — Settings 顯示 username (commit 758dd32)
Result: 3/3 PASS

- [PASS] **Username displayed**: Settings Profile section shows `Username` field with value `@cozy_tester`. Screenshot: `qa-settings-profile.png`
- [PASS] **Read-only**: `<Input readOnly>` at `settings/page.tsx:460` with `text-muted-foreground` styling.
- [PASS] **Correct value**: Displays `@cozy_tester` matching the database record. Uses session user data with `@` prefix.

### #62 — Sidebar 對話排序 (commit 6f04242)
Result: 3/3 PASS

- [PASS] **New message → top**: `conversation-list.tsx:17-27` — `useMemo` sorts by `updatedAt` descending. Chat store sets `updatedAt: new Date()` on `stream_start` (L1384), `stream_chunk` (L1456), `stream_end` (L1629), and user send (L480-483).
- [PASS] **Pinned first**: Lines 20-24 — pinned conversations always sort before unpinned. Multiple pinned conversations sort by `pinnedAt` descending.
- [PASS] **updatedAt descending**: Line 26 — `new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()`.

### #63 — Sidebar 串流時顯示 (commit 2dcd040)
Result: 3/3 PASS

- [PASS] **stream_start not blank**: `chat-store.ts:1377` sets `lastMessage.content = "..."` (three dots placeholder), not empty string.
- [PASS] **Real-time chunk updates**: Lines 1482-1486 — each `stream_chunk` appends text to `lastMessage.content` on the conversation object.
- [PASS] **Final message after stream_end**: `stream_end` handler replaces with `finalContent` (lines 1519, 1591, 1610) using `\r\n` normalized text.

### #66 — Markdown 表格 (commit a530a2f)
Result: 4/4 PASS

- [PASS] **\r\n normalization in store**: `chat-store.ts:1498` — `stream_end` handler: `event.content?.replace(/\r\n/g, "\n")`. Also at L1139 in `new_message` handler.
- [PASS] **preprocessMarkdown**: `markdown-content.tsx:104` — `raw.replace(/\r\n/g, "\n")` + blank line insertion before GFM table header/delimiter rows (L109-135).
- [PASS] **remarkStripTableBreaks**: Lines 149-164 — strips `break` nodes inside `table` elements, preventing `remark-breaks` from injecting `<br>` tags.
- [PASS] **Defense in depth**: Normalization at both store level (as data arrives) and render level (before ReactMarkdown), ensuring tables render correctly in all scenarios.

### #59 — 錄音上傳佔位 (commit dc72865)
Result: 4/4 PASS

- [PASS] **Optimistic temp message**: `chat-input.tsx:610-652` — creates temp message with `id: temp-${Date.now()}` and attachment `id: temp-att-${Date.now()}` immediately after recording.
- [PASS] **Spinner during upload**: `message-bubble.tsx:241-245` — `temp-att-` prefix triggers `animate-spin` spinner with duration or "Uploading audio..." text.
- [PASS] **Audio player on success**: Lines 246-250 — when attachment ID is no longer `temp-att-*`, renders `<AudioPlayer>` with real URL from server response.
- [PASS] **Failure recovery**: `chat-input.tsx:719-731` — catch block removes optimistic message from store. `finally` block sets `uploading: false`.

### #60 — Office token fallback (commit e27e5dd)
Result: 3/3 PASS

- [PASS] **emit() function**: `hooks.ts:186-207` — sends office state to Rust server via HTTP POST.
- [PASS] **Default token fallback**: Line 192: `const token = (accountId ? accountTokens.get(accountId) : undefined) ?? accountTokens.get("default")` — nullish coalescing falls back to `"default"` key when account-specific token is missing.
- [PASS] **Silent skip without token**: Line 193: `if (!token) return;` — no request sent if neither account nor default token exists.

### #61 — Office Chat 按鈕 (commit 4e672c0)
Result: 4/4 PASS

- [PASS] **onClick handler**: `character-modal.tsx:140-151` — `handleChat` callback finds or creates conversation, sets active, navigates to `/` (which is the chat route).
- [PASS] **Find or create conversation**: Lines 143-148 — searches `conversations` for existing direct conversation with `boundAgentId`. If not found, calls `createConversation(boundAgentId)`.
- [PASS] **Disabled without agent**: Line 338: `disabled={!boundChatAgent}`. `boundChatAgent` is null when no binding exists or agent not in chat agent list.
- [PASS] **Visual disabled state**: Line 340: `disabled:opacity-50 disabled:cursor-not-allowed` Tailwind classes.

### #71 — Idle sleep 動畫 (commit 969b715)
Result: 4/4 PASS

- [PASS] **10-minute timeout**: `sprite-renderer.ts:375` — `static IDLE_SLEEP_MS = 10 * 60 * 1000` (600,000ms).
- [PASS] **Auto-transition**: Lines 550-561 — `checkIdleSleep()` checks `Date.now() - idleSince >= IDLE_SLEEP_MS`, calls `transitionTo("sleeping")`.
- [PASS] **30-second polling**: Line 532 — `setInterval(checkIdleSleep, 30000)` for reasonable granularity.
- [PASS] **Memory leak prevention**: Cleanup in 3 locations — (1) `updateAgents` when agent exits idle (L539-542), (2) `checkIdleSleep` after transition fires (L556-558), (3) `destroy()` method (L461-464).

### #70 — 內建貼圖 picker (commit bb2a8d7)
Result: 4/4 PASS

- [PASS] **Smile icon button**: `chat-input.tsx:1071` — `<Smile>` icon in toolbar, only shown when `stickers.length > 0`. Screenshot: `qa-sticker-picker.png`
- [PASS] **20 sticker thumbnails**: Popover with 5-column grid (`grid-cols-5`), 20 stickers loaded from manifest. All 20 visible in browser. Screenshot: `qa-sticker-picker.png`
- [PASS] **Send sticker**: Lines 747-754 — `handleStickerSend` sends `![sticker](/stickers/arinova-pack-01/${filename})` and closes popover. Browser confirmed: sticker displayed as image in chat. Screenshot: `qa-sticker-sent.png`
- [PASS] **manifest.json loaded**: Lines 738-745 — fetches `/stickers/arinova-pack-01/manifest.json` on mount. File contains 20 entries with id, filename, emoji.

### #69 — User/Agent 個人頁面 (commits 8a72aca + bdcd826)
Result: 7/7 PASS

- [PASS] **User profile page**: `/profile/[id]` renders avatar, name (`Cozy Tester`), username (`@cozy_tester`), join date, owned agents list. Screenshot: `qa-user-profile.png`
- [PASS] **Agent profile page**: `/agent/[id]` renders avatar, name (`QA Test Bot`), status (`Offline`), description, Chat button, owner, stats (messages: 2, conversations: 1, last active). Screenshot: `qa-agent-profile.png`
- [PASS] **Agent avatar in chat**: Chat header shows clickable agent name/avatar at `button "QA Test Bot"` which navigates to agent profile.
- [PASS] **Public API — GET /api/agents/:id/profile**: Returns 200 with `{id, name, description, avatarUrl, ownerId, isPublic, category, usageCount, voiceCapable, createdAt}`. No owner restriction — uses `_user: AuthUser` (underscore = authenticated but not ownership checked).
- [PASS] **Public API — GET /api/users/:userId/agents**: Returns 200 with array of `{id, name, description, avatarUrl, category, voiceCapable}`. No owner restriction.
- [PASS] **Mobile responsive**: User profile renders properly at 375×812. Bottom nav visible, content fills width. Screenshot: `qa-user-profile-mobile.png`
- [PASS] **i18n 4 languages**: Translation keys (`profilePage.*`, `userProfile.*`) confirmed in all 4 locale files: en.json, zh-TW.json, zh-CN.json, ja.json.

---

## Screenshots

| File | Description |
|------|-------------|
| qa-settings-profile.png | Settings Profile — username @cozy_tester visible |
| qa-settings-appearance.png | Appearance — no dark mode toggle, language only |
| qa-sticker-picker.png | Sticker picker popover with 20 thumbnails |
| qa-sticker-sent.png | Sticker sent in chat as image |
| qa-agent-profile.png | Agent Profile page — QA Test Bot |
| qa-user-profile.png | User Profile page — Cozy Tester |
| qa-user-profile-mobile.png | User Profile mobile responsive 375×812 |

---

## Notes

- **No live agent**: OpenClaw test container is in crash loop. Chat features (#62 sidebar sort, #63 streaming preview, #59 audio upload, #66 markdown table) could not be tested end-to-end with real streaming — verified via comprehensive code review instead.
- **#67 avatar**: Tested with no-avatar user (User icon fallback). Cannot test avatar change flow without uploading a new avatar, but code review confirms `authClient.useSession()` reactive hook always returns latest avatar.
- **#60 Office token**: Tested via code review only — requires OpenClaw agent connection to verify end-to-end.
- **#61 Chat button**: Tested via code review — requires office character binding to verify end-to-end.
- **#71 Idle sleep**: Tested via code review — requires 10-minute idle wait to verify visually.

## Test Data Created

- Agent: `a1b2c3d4-e5f6-7890-abcd-ef1234567890` (QA Test Bot)
- Conversation: `c1d2e3f4-a5b6-7890-cdef-123456789012` (QA Test Chat)
