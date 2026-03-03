# QA Report: Voice L2 — AI TTS (Text-to-Speech)

**Date:** 2026-02-26
**Branch:** jiumi (commits 519de39 + 4aad2c4 + 3cba47d)
**Tester:** Claude QA
**Environment:** Docker (web=192.168.68.83:21000, server=:3501, postgres=:21003)

---

## Summary: PASS 12 / SKIP 4 / FAIL 2 — 18 total checks

### CRITICAL BUG: Rust code does not compile

`msg_id` variable is defined inside `if !full_content.is_empty()` block but referenced outside it in the TTS `tokio::spawn` block. This causes 6 compilation errors (4x E0425 scope error + 2x E0282 type inference). **The server binary cannot be built from this branch.**

---

## 1. TTS Service (Backend) — `tts.rs`

| # | Test | Result |
|---|------|--------|
| 1.1 | `tts.rs` new file exists and structure correct | **PASS** — 53 lines, clean module: `text_to_speech(api_key, text, voice) -> Result<Vec<u8>, String>`. Uses OpenAI `/v1/audio/speech` endpoint, model `tts-1`, format `mp3`. |
| 1.2 | Text truncation is char-safe (CJK safe) | **PASS** — Lines 14-22: truncates at 4096 chars using `text.is_char_boundary(end)` with backward scanning. Will never split a multi-byte UTF-8 character. |
| 1.3 | HTTP client has 30s timeout | **PASS** — Line 25: `reqwest::Client::builder().timeout(std::time::Duration::from_secs(30))` |

---

## 2. Migration + Schema

| # | Test | Result |
|---|------|--------|
| 2.1 | `tts_voice` column on `agent_listings` (default 'alloy') | **PASS** — `ALTER TABLE agent_listings ADD COLUMN IF NOT EXISTS tts_voice TEXT DEFAULT 'alloy'`; verified in DB: `column_default = 'alloy'::text` |
| 2.2 | `tts_voice` column on `communities` (default 'alloy') | **PASS** — `ALTER TABLE communities ADD COLUMN IF NOT EXISTS tts_voice TEXT DEFAULT 'alloy'`; verified in DB |
| 2.3 | `tts_audio_url` column on `marketplace_messages` | **PASS** — `ALTER TABLE marketplace_messages ADD COLUMN IF NOT EXISTS tts_audio_url TEXT`; verified in DB |
| 2.4 | `tts_audio_url` column on `community_messages` | **PASS** — same pattern; verified in DB |
| 2.5 | Migration re-entrant | **PASS** — Ran migration twice; second run produces `NOTICE: column already exists, skipping` — no errors |

**Note:** Migration adds to `agent_listings` not `marketplace_listings` (the migration comment says "marketplace_listings" but the actual table is `agent_listings`). This matches `schema.sql` and the query in `marketplace_chat.rs:88`.

---

## 3. Marketplace Chat TTS

| # | Test | Result |
|---|------|--------|
| 3.1 | `done` event sent BEFORE TTS (non-blocking) | **PASS** — Code review: `marketplace_chat.rs:395-400` sends `done` event, then TTS runs in a nested `tokio::spawn` at line 410. User sees reply immediately. |
| 3.2 | TTS completion sends `audio_ready` SSE event | **PASS** — Code review: `marketplace_chat.rs:484-487` sends `{"type": "audio_ready", "audioUrl": url}` via the SSE channel |
| 3.3 | Frontend receives `audio_ready` and shows AudioPlayer | **PASS** — Code review: `marketplace/chat/[id]/page.tsx:147-155` handles `audio_ready`, updates last assistant message with `ttsAudioUrl`; line 309-313 renders `<AudioPlayer src={msg.ttsAudioUrl} />` |
| 3.4 | No OPENAI_API_KEY → silent skip | **PASS** — Code review: `marketplace_chat.rs:403` — `if let Some(openai_key) = config_clone.openai_api_key.as_deref()` — entire TTS block skipped when key is `None` |
| 3.5 | Live TTS test with agent | **SKIP** — No `OPENAI_API_KEY` configured in test environment |

---

## 4. Community Chat TTS

| # | Test | Result |
|---|------|--------|
| 4.1 | Same TTS flow as Marketplace | **PASS** — Code review: `community.rs:1657-1662` sends `done` first, then nested `tokio::spawn` for TTS at line 1672. Identical pattern. |
| 4.2 | Community SSE has `audio_ready` handling | **PASS** — Code review: `community/[id]/page.tsx:351-359` handles `audio_ready` event, checks `last?.agentListingId` (community-specific guard), renders `<AudioPlayer>` at line 588-592 |
| 4.3 | Live community TTS test | **SKIP** — No `OPENAI_API_KEY` configured |

---

## 5. Frontend SSE Handler

| # | Test | Result |
|---|------|--------|
| 5.1 | `marketplace/chat/[id]/page.tsx` has `audio_ready` handler | **PASS** — Line 147: `else if (event.type === "audio_ready")` — updates last assistant message's `ttsAudioUrl` |
| 5.2 | `community/[id]/page.tsx` has `audio_ready` handler | **PASS** — Line 351: `else if (event.type === "audio_ready")` — updates last agent message's `ttsAudioUrl` |
| 5.3 | AudioPlayer uses existing `audio-player.tsx` component | **PASS** — Both pages import `{ AudioPlayer } from "@/components/chat/audio-player"` |
| 5.4 | History messages include `ttsAudioUrl` from API | **PASS** — Code review: `marketplace_chat.rs:622` returns `"ttsAudioUrl": r.tts_audio_url` in message JSON; `community.rs:1857` returns `"ttsAudioUrl": r.tts_audio_url` |

---

## 6. Code Quality

| # | Test | Result |
|---|------|--------|
| 6.1 | TypeScript compiles (`tsc --noEmit`) | **PASS** — Exit code 0, no errors |
| 6.2 | No hardcoded secrets | **PASS** — `openai_api_key` read from `OPENAI_API_KEY` env var via `config.rs:75`. No `sk-*` patterns found in TTS-related files. |
| 6.3 | Rust compiles (`cargo check`) | **FAIL** — 6 errors: `msg_id` out of scope (see bug details below) |
| 6.4 | Live build test (Docker server rebuild) | **SKIP** — Blocked by compilation errors |

---

## Bug Details

### BUG 1 (CRITICAL): `msg_id` variable out of scope — Rust won't compile

**Severity:** Critical (blocks build)
**Files affected:** `marketplace_chat.rs` and `community.rs`

**Errors:**
```
error[E0425]: cannot find value `msg_id` in this scope
  --> src/routes/marketplace_chat.rs:415
  --> src/routes/marketplace_chat.rs:474
  --> src/routes/community.rs:1677
  --> src/routes/community.rs:1736
error[E0282]: type annotations needed
  --> src/routes/marketplace_chat.rs:415
  --> src/routes/community.rs:1677
```

**Root Cause:**
In both files, `msg_id` is declared inside `if !full_content.is_empty() { ... }` (marketplace_chat.rs:369, community.rs:1647) but referenced in the TTS `tokio::spawn` block that's **outside** that scope (marketplace_chat.rs:415/474, community.rs:1677/1736).

**Fix (marketplace_chat.rs):**
Move `msg_id` declaration before the `if` block:
```rust
let mut msg_id: Option<Uuid> = None;

if !full_content.is_empty() {
    msg_id = sqlx::query_scalar::<_, Uuid>(...)
        .fetch_one(&db)
        .await
        .ok();
    // ... billing ...
}

// done event
// TTS block can now access msg_id
```

Same fix needed for `community.rs`.

### Note: `full_content` also used in TTS block

`full_content` (declared at line 320 in marketplace_chat.rs) is also used inside the TTS spawn at line 411. Since `full_content` is a `String` owned by the outer spawn's scope, and the `if !full_content.is_empty()` block only borrows it, `full_content` remains valid and the move into the inner spawn at line 410 is correct. No bug here.

---

## Architecture Summary

```
User sends message
  → Server calls OpenRouter LLM (SSE stream)
  → Chunks streamed to frontend via SSE
  → Agent reply stored in DB (RETURNING id)
  → "done" event sent to frontend ← user sees reply
  → Background tokio::spawn:
      → OpenAI TTS API (text_to_speech)
      → Upload MP3 to R2 (fallback: local disk)
      → UPDATE message tts_audio_url
      → Send "audio_ready" SSE event
  → Frontend updates last message with AudioPlayer
```

**Design decisions:**
- TTS is non-blocking (separate `tokio::spawn` after `done`)
- R2 first, local fallback on R2 failure
- Silent failure if no `OPENAI_API_KEY` or TTS API error (`tracing::warn`)
- Audio format: MP3 (`audio/mpeg`)
- Voice configurable per agent/community (`tts_voice` column, default `alloy`)

---

## Screenshots

No live TTS screenshots possible (no `OPENAI_API_KEY` + Rust compilation blocks server rebuild). All testing performed via code review and migration verification.
