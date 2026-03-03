# QA Report: 12 Frontend Features on jiumi Branch (Round 2)

**Tester:** Vivi (QA Agent)
**Date:** 2026-03-03
**Branch:** jiumi (17 commits — 16 features + 1 security fix)
**Environment:** Docker — Web :21000 (http://192.168.68.83:21000), Server :21001
**Test Account:** Perry (ripple0129@gmail.com, admin)

---

## Summary

| # | Feature | Method | Result |
|---|---------|--------|--------|
| 1 | Club/Lounge creation — no 'community not found' error | Browser | **PASS** |
| 2 | Profile page — skeleton loading, not spinner | Browser | **PASS** |
| 3 | Friends list — click name/avatar → profile | Browser | **PASS** |
| 4 | Agent manage button for owner | Browser | **PASS** |
| 5 | Conversation header avatar → peer profile | Browser | **PARTIAL** ⚠️ |
| 6 | Search conversation + scroll loads more messages | Browser | **PASS** |
| 7 | Reply quote above bubble (Telegram/Discord style) | Browser + Code | **FAIL** 🐛 |
| 8 | Thread reply count pill badge | Browser + Code | **PASS** (code verified) |
| 9 | Sticker Shop featured banner slide animation | Browser | **PASS** |
| 10 | Block/Mute buttons on profile page | Browser | **PARTIAL** ⚠️ |
| 11 | Creator Console — sticker management | Browser | **PASS** |
| 12 | Pin message — option + pinned bar | Browser + Code | **PARTIAL** ⚠️ |

**Total: 8 PASS, 1 FAIL, 3 PARTIAL**

---

## Bugs Found

### BUG-1: Server compile error — `link_preview.rs:19` (Blocker)
- **File:** `apps/rust-server/src/services/link_preview.rs:19`
- **Error:** `error[E0762]: unterminated character literal`
- **Code:** `let re = Regex::new(r"https?://[^\s<>\)\]\}\"'`,]+").unwrap();`
- **Impact:** Prevents the entire server from compiling. Cannot rebuild server with latest commits. All backend-dependent features (pin, block/mute API, peerUserId) are affected.
- **Workaround:** Built only web container, kept older server running.

### BUG-2: Reply quote bar UI not implemented (Task 7)
- **File:** `apps/web/src/components/chat/chat-input.tsx`
- **Symptom:** Clicking Reply button sets `replyingTo` state in store (button shows [active]) but no visual reply quote bar appears above the message input.
- **Root cause:** `chat-input.tsx` does NOT import `replyingTo` from the chat store and does NOT render a reply preview/quote bar.
- **Expected:** Telegram/Discord-style reply bar showing "Replying to [name]: [message preview]" with cancel button above the textarea.
- **Store works:** `chat-store.ts:112` has `replyingTo: Message | null` and `setReplyingTo` action. Message sending correctly attaches `replyToId`. Only the UI rendering is missing.

### BUG-3: i18n keys not translated — Block/Mute buttons (Task 10)
- **File:** `apps/web/src/app/profile/[id]/page.tsx`
- **Symptom:** Block and Mute buttons show raw i18n keys instead of translated text:
  - `userProfile.block` instead of "Block"
  - `userProfile.mute` instead of "Mute"
  - `userProfile.unblock` instead of "Unblock"
- **Impact:** Buttons are functional (block/unblock toggle works) but labels are not user-friendly.
- **Likely cause:** Missing translation keys in the i18n JSON files.

### BUG-4: `/api/users/muted` returns 404
- **Endpoint:** `GET /api/users/muted`
- **Symptom:** Console error on every profile page load.
- **Impact:** Cannot determine if a user is muted. Mute button state may not persist after page reload.
- **Note:** May be because server wasn't rebuilt with latest code.

### BUG-5: `/api/conversations/{id}/pins` returns 404
- **Endpoint:** `GET /api/conversations/{id}/pins`
- **Symptom:** Pin API endpoint doesn't exist on current server build.
- **Impact:** Pin button in UI sends request but gets 404. Pinned messages bar cannot load.
- **Note:** Server compile error (BUG-1) prevents rebuilding with the pin endpoint code.

---

## Detailed Results

### Task 1: Club/Lounge Creation — No 'community not found' error
**Commits:** 80bb174 (community resilient to not-found)
**Result: PASS**

- Navigated to `/community`, clicked Create
- Filled in "Vivi QA Test Lounge" name, selected Lounge type
- [PASS] Successfully created, navigated to `/community/e8f20195-...`
- [PASS] No 'community not found' error
- [PASS] Community page loads with proper layout
- Minor: 403 on `/members` endpoint (likely permission issue, not a crash)
- Screenshot: `01-community-created.png`

### Task 2: Profile Page — Skeleton Loading
**Commits:** 9bda296 (profile skeleton loading)
**Result: PASS**

- Navigated to Timi's profile via Friends page
- [PASS] Profile loads fast with proper layout
- [PASS] Skeleton loading code exists at `profile/[id]/page.tsx:138` (`{/* Skeleton banner */}`)
- [PASS] No spinner visible — profile renders with skeleton placeholders
- [PASS] Avatar, name, username, bio, join date all render correctly
- Screenshot: `02-profile-page.png`

### Task 3: Friends List — Click Name/Avatar → Profile
**Commits:** 8040200 (click-to-profile on friends)
**Result: PASS**

- Navigated to `/friends`
- [PASS] Timi shown with `[cursor=pointer]` on the friend card
- [PASS] Clicking Timi navigated to `/profile/30e077f7-ac5e-469c-b2ca-ff46ae512ebe`
- [PASS] Profile page loaded with Timi's data
- Screenshot: `03-friends-to-profile.png`

### Task 4: Agent Manage Button for Owner
**Commits:** 8040200 (manage agent button)
**Result: PASS**

- Entered Linda conversation (agent owned by Perry)
- Clicked header → Agent profile sheet opened
- [PASS] "Manage Agent" button visible (owner only, with Settings icon)
- [PASS] Clicked → editing panel shows Name, Description, Category, System Prompt, Welcome Message fields
- [PASS] Non-owned agents don't show the button
- Screenshot: `04-agent-manage-button.png`

### Task 5: Conversation Header Avatar → Peer Profile
**Commits:** faf9947 (chat header avatar → profile)
**Result: PARTIAL ⚠️**

- In Timi's conversation, clicked header button "Timi Timi"
- [FAIL] Header button does NOT have `[cursor=pointer]`
- [FAIL] Clicking did not navigate to profile page
- **Root cause:** Code at `chat-header.tsx:88` uses `peerUserId` from `conversation.peerUserId`, but the server (older build) doesn't return this field.
- [PASS] Code logic is correct — navigation would work if server returned `peerUserId`
- Screenshot: `05-header-avatar-click.png`
- **Verdict:** Frontend code is correct but requires server rebuild to function.

### Task 6: Search Conversation + Scroll Loads More Messages
**Commits:** c11c687 (hasMoreDown for infinite scroll)
**Result: PASS**

**Search:**
- [PASS] Search input present in sidebar ("Search conversations...")
- [PASS] Typed "Casey" + Enter → search triggered via API
- [PASS] 183 results returned with highlighted "Casey" in yellow `<mark>` tags
- [PASS] Results show: avatar, sender name, conversation title, message snippet, timestamp
- [PASS] Clicked result → jumped to exact message in Linda conversation
- Screenshots: `06-search-results.png`, `06b-search-jump-to-message.png`

**Scroll loads more:**
- [PASS] In Linda conversation, scrolled to top
- [PASS] scrollHeight grew from 14,169px → 24,079px (more messages loaded)
- [PASS] Older messages appeared above the viewport
- Screenshot: `06c-scroll-loaded-more.png`

### Task 7: Reply Quote Above Bubble (Telegram/Discord Style)
**Commits:** dcc7158 (reply quote above bubble + thread indicator)
**Result: FAIL 🐛**

- Clicked Reply on Timi's "哭暈在廁所" message
- [PASS] Reply button shows [active] state
- [PASS] Store state `replyingTo` is set correctly (`chat-store.ts:252`)
- [PASS] Message sending logic attaches `replyToId` (`chat-store.ts:470-480`)
- [FAIL] **No reply quote bar appears above the message input**
- [FAIL] `chat-input.tsx` does NOT import `replyingTo` from store and does NOT render a reply preview bar
- **See BUG-2 above**
- Screenshot: `07-reply-no-quote-bar.png`

### Task 8: Thread Reply Count Pill Badge
**Commits:** dcc7158 (reply quote above bubble + thread indicator)
**Result: PASS (code verified)**

- [PASS] Thread dialog opens when clicking "Start thread" button
- [PASS] Thread panel shows original message at top, full message, and "Reply in thread..." input
- [PASS] Thread pill badge code exists at `message-bubble.tsx:667-680`
- [PASS] Badge renders `{replyCount} replies` in a `rounded-full bg-brand/10` button with MessageSquare icon
- [NOTE] No existing thread replies in production data to visually verify the pill — but component code is correct and conditionally renders when `threadSummary.replyCount > 0`
- Screenshot: `08-thread-dialog.png`

### Task 9: Sticker Shop Featured Banner Slide Animation
**Commits:** d3cb00e (sticker shop banner animation)
**Result: PASS**

- Navigated to `/stickers` — Sticker Shop page loads
- [PASS] Featured carousel banner shows 3 packs: Pixel Cat Pack, Arinova Cat Pack 01, Lobster Baby Pack 01
- [PASS] Previous/Next arrow buttons functional
- [PASS] Pagination dots (3 dots) show active state
- [PASS] Clicking next arrow slides to next pack (Pixel Cat → Arinova Cat)
- [PASS] Smooth CSS transition between slides
- [NOTE] No auto-play/auto-slide timer implemented — manual navigation only
- Screenshots: `09-sticker-shop-banner.png`, `09b-sticker-shop-after-wait.png`

### Task 10: Block/Mute Buttons on Profile Page
**Commits:** ba92338 (block/mute users)
**Result: PARTIAL ⚠️**

- Navigated to Timi's profile
- [PASS] Block and Mute buttons visible with appropriate icons (Ban icon, VolumeX icon)
- [PASS] Block toggle works — clicking "block" changes to "unblock" and back
- [FAIL] **i18n keys not translated** — buttons show `userProfile.block` and `userProfile.mute` as raw text (BUG-3)
- [FAIL] `/api/users/muted` returns 404 (BUG-4)
- Screenshot: `10-block-mute-i18n-bug.png`

### Task 11: Creator Console — Sticker Management
**Commits:** 75d054b (creator console navigation + dashboards), 878aab6 (creator console sticker management)
**Result: PASS**

**Overview Dashboard:**
- [PASS] Creator Console loads at `/creator` with full dashboard
- [PASS] 4 stat cards: Total Revenue ($128.50), Total Downloads (4,523), Total Users (4,542), Avg Rating (4.6)
- [PASS] Your Creations: 3 Sticker Packs, 2 Agents, 1 Themes
- [PASS] Recent Activity feed with 3 items
- [PASS] Tabs: Overview, Stickers, Agents, Themes
- [PASS] Payout button in top-right

**Stickers Tab:**
- [PASS] Stickers tab loads and shows "YOUR STICKER PACKS (0)"
- [PASS] "+ New Sticker Pack" button visible
- [NOTE] Shows 0 packs (real API data) vs 3 in overview (mock data) — expected behavior
- Screenshots: `11-creator-console-overview.png`, `11b-creator-stickers-tab.png`

### Task 12: Pin Message — Option + Pinned Bar
**Commits:** 4834ce4 (Telegram-style multi-pin)
**Result: PARTIAL ⚠️**

- [PASS] Pin button visible on every message (50 instances counted in Linda conversation)
- [PASS] `pinned-messages-bar.tsx` component exists in codebase
- [PASS] Pin button has `title="Pin"` with yellow hover color (`hover:text-yellow-400`)
- [FAIL] Clicking Pin → 404 error on `/api/conversations/{id}/pin/{messageId}` (BUG-5)
- [FAIL] Pinned messages bar cannot load — `/api/conversations/{id}/pins` returns 404
- **Root cause:** Server compile error (BUG-1) prevents rebuilding with pin endpoint code
- Screenshot: `12-pin-button-click.png`

---

## Screenshots

| File | Description |
|------|-------------|
| 01-community-created.png | Lounge created successfully, no 'not found' error |
| 02-profile-page.png | Timi's profile with skeleton loading |
| 03-friends-to-profile.png | Friends → profile navigation |
| 04-agent-manage-button.png | Manage Bot panel for Linda (owner view) |
| 05-header-avatar-click.png | Header avatar click — didn't navigate (needs server) |
| 06-search-not-filtering.png | Search typed "Casey" — sidebar search box |
| 06-search-results.png | Search results — 183 matches with highlighted "Casey" |
| 06b-search-jump-to-message.png | Jump to message — Linda conversation with Casey workflow table |
| 06c-scroll-loaded-more.png | Scroll loaded more messages (scrollHeight grew) |
| 07-reply-no-quote-bar.png | Reply button active but no quote bar above input |
| 08-thread-dialog.png | Thread dialog with "Reply in thread..." input |
| 09-sticker-shop-banner.png | Sticker Shop carousel — Arinova Cat Pack 01 |
| 09b-sticker-shop-after-wait.png | Banner after 6s wait — no auto-slide |
| 10-block-mute-i18n-bug.png | Block/Mute buttons showing raw i18n keys |
| 11-creator-console-overview.png | Creator Console dashboard with stats |
| 11b-creator-stickers-tab.png | Stickers management tab — 0 packs, New button |
| 12-linda-conversation.png | Linda conversation — messages loaded |
| 12-pin-button-click.png | Pin clicked — server returned 404 |

---

## Server Build Issue

The server cannot be rebuilt with the latest jiumi branch commits due to a Rust compile error in `link_preview.rs:19`. This means:

1. **Backend-dependent features cannot be fully tested:**
   - Pin message API (Task 12)
   - Block/Mute API (`/api/users/muted`, `/api/users/block`)
   - peerUserId in conversation API (Task 5)
   - Link preview with OG meta extraction

2. **Workaround applied:** Built only the web container (`docker compose -f docker-compose.test.yml build web`) and kept the existing server running from a previous build.

3. **Fix needed:** The regex in `link_preview.rs:19` needs to be corrected. The escaped quotes in the raw string literal confuse the Rust compiler.

---

## Notes

- **Staging unavailable:** Could not log in to https://chat-staging.arinova.ai (password "arinova" failed). All testing done on local dev server at http://192.168.68.83:21000.
- **Test user ID correction:** Timi's correct user ID is `30e077f7-ac5e-469c-b2ca-ff46ae512ebe` (not the previously used `30e077f7-8bbf-48d6-b7f9-11bd84c480e5`).
- **Overview vs real data:** Creator Console overview uses mock/demo data (3 sticker packs, $128.50 revenue), while the Stickers tab shows real API data (0 packs).
- **Search is Enter-triggered:** The conversation search is not a real-time filter — it's a message-level search triggered by pressing Enter, with highlighted results and jump-to-message.
