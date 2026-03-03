# QA Report: Marketplace 改版 — OpenRouter Integration

**Branch:** jiumi (commits 0d12258, 30b962a, 6b4d847, 97f9041)
**Date:** 2026-02-26
**Tester:** Vivi (AI QA)
**Environment:** Docker test (192.168.68.83:21000 web, 192.168.68.83:21001 server)

---

## Summary

**Overall: PASS 17 / SKIP 2 / 19 total checks**

The OpenRouter integration successfully replaces per-creator API key management with platform-managed LLM routing. The Creator form correctly removes API key fields and adds Model selector + Input Char Limit. Backend validation is solid — boundary values for char limit and empty model are properly rejected. The Marketplace browse and detail pages correctly display model info and char limit. Chat functionality is architecturally correct but requires a live OPENROUTER_API_KEY for end-to-end testing (SKIP).

---

## Test Results

### 1. Creator — New Agent (/creator/new)

| # | Test Case | Result | Notes |
|---|-----------|--------|-------|
| 1.1 | Page loads | **PASS** | "Create New Agent" heading, all sections rendered |
| 1.2 | No API Key field | **PASS** | No api_key, api_key_encrypted, or provider fields anywhere in form |
| 1.3 | Model dropdown present | **PASS** | 6 options: GPT-4o, GPT-4o Mini (default), Claude 3.5 Sonnet, Claude 3 Haiku, Gemini 2.0 Flash, Llama 3.1 70B |
| 1.4 | Input Char Limit field | **PASS** | Spinbutton with default 2000, label "Max characters per user message (1–20,000)" |
| 1.5 | Price per call setting | **PASS** | "Credits per Message" (default 1) + "Free Trial Messages" (default 3) |
| 1.6 | Submit valid form → agent created | **PASS** | Created "QA Test Agent" with model=anthropic/claude-3.5-sonnet, inputCharLimit=5000. Redirected to Creator Dashboard showing agent as "active" |
| 1.7 | Empty model → error | **PASS** | API returns `{"error":"model is required"}` |
| 1.8 | inputCharLimit=0 → error | **PASS** | API returns `{"error":"inputCharLimit must be between 1 and 20000"}` |
| 1.9 | inputCharLimit=99999 → error | **PASS** | API returns `{"error":"inputCharLimit must be between 1 and 20000"}` |

### 2. Creator — Edit Agent (/creator/[id]/edit)

| # | Test Case | Result | Notes |
|---|-----------|--------|-------|
| 2.1 | Page loads with correct values | **PASS** | Model="Claude 3.5 Sonnet" [selected], inputCharLimit=5000, price=2, trial=5 all pre-filled |
| 2.2 | Modify model and char limit → save | **PASS** | Changed to GPT-4o + 3000 chars. DB confirmed: model=openai/gpt-4o, input_char_limit=3000 |
| 2.3 | No API Key UI | **PASS** | No api_key fields on edit page |

### 3. Marketplace Browse

| # | Test Case | Result | Notes |
|---|-----------|--------|-------|
| 3.1 | Page loads with agent cards | **PASS** | 8 agent cards rendered with search, category filters, sort dropdown |
| 3.2 | Cards show model info | **PASS** | Each card displays model name (e.g. "gpt-4o", "claude-3-opus-20240229", "gpt-3.5-turbo") |

### 4. Agent Detail

| # | Test Case | Result | Notes |
|---|-----------|--------|-------|
| 4.1 | Shows model info | **PASS** | "openai/gpt-4o" displayed with CPU icon in pricing card |
| 4.2 | Shows input char limit | **PASS** | "Max 3,000 chars per message" displayed below model |
| 4.3 | Price info correct | **PASS** | "2 credits/message" + "5 free trial messages" shown |

### 5. Chat Functionality

| # | Test Case | Result | Notes |
|---|-----------|--------|-------|
| 5.1 | Chat page loads | **PASS** | Header shows "QA Test Agent", "2 credits/msg · 5 free", input field + Wallet button |
| 5.2 | Send message → OpenRouter call | **SKIP** | Server returns "LLM service not configured" — no OPENROUTER_API_KEY in test environment. Architecturally correct: request reaches `openrouter::call_stream()`, fails at config check |
| 5.3 | Exceed input char limit → rejected | **PASS** | Sent 3001-char message → API returns `{"error":"Message must be 1-3000 characters"}` |
| 5.4 | Full streaming response test | **SKIP** | Requires live OPENROUTER_API_KEY for end-to-end SSE streaming |

---

## DB Schema Verification

Migration applied successfully. Column changes verified:

| Change | Status |
|--------|--------|
| `model` column added (TEXT, NOT NULL, default 'openai/gpt-4o-mini') | **OK** |
| `input_char_limit` column added (INTEGER, NOT NULL, default 2000) | **OK** |
| `api_key_encrypted` removed | **OK** |
| `model_provider` removed | **OK** |
| `model_id` removed | **OK** |
| Existing agents backfilled with model from provider/id concat | **OK** |

---

## Screenshots

| # | Description | Path |
|---|-------------|------|
| 1 | Creator new agent page — model selector + char limit | `01-creator-new-page.png` |
| 2 | Creator edit page — pre-filled model + char limit | `02-creator-edit-page.png` |
| 3 | Marketplace browse — agent cards with model info | `03-marketplace-browse.png` |
| 4 | Agent detail — model, char limit, pricing card | `04-agent-detail.png` |
| 5 | Chat page — message + "LLM service not configured" error | `05-chat-page.png` |

All screenshots saved to: `apps/web/public/design/marketplace-openrouter/`

---

## Technical Details

### OpenRouter Service (`services/openrouter.rs`)
- Single platform API key (env: `OPENROUTER_API_KEY`)
- POST to `https://openrouter.ai/api/v1/chat/completions`
- Custom headers: `HTTP-Referer: https://arinova.ai`, `X-Title: Arinova Chat`
- Streaming SSE response, OpenAI-compatible chunk parsing
- Default: max_tokens=4096, temperature=0.7

### Frontend Model Options
| Value | Label |
|-------|-------|
| `openai/gpt-4o` | GPT-4o |
| `openai/gpt-4o-mini` | GPT-4o Mini (default) |
| `anthropic/claude-3.5-sonnet` | Claude 3.5 Sonnet |
| `anthropic/claude-3-haiku` | Claude 3 Haiku |
| `google/gemini-2.0-flash` | Gemini 2.0 Flash |
| `meta-llama/llama-3.1-70b-instruct` | Llama 3.1 70B |

### Validation Summary
| Field | Frontend | Backend |
|-------|----------|---------|
| model | Required, dropdown | Non-empty string |
| inputCharLimit | min=1, max=20000, spinbutton | 1–20,000, 400 if out of range |
| message length | — | 1–charLimit per agent, 400 if exceeded |
| name | Required, max 100 chars | Required |
| systemPrompt | Required | Required, content moderation |
