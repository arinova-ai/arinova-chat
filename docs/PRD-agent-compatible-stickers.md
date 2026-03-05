# PRD: Agent Compatible Stickers

## Overview

Arinova Chat stickers are divided into two tiers: **Free stickers** (general use) and **Agent Compatible stickers** (paid, AI-aware). Agent Compatible stickers carry hidden semantic metadata that allows AI agents to understand the sticker's meaning and respond contextually — a feature unique to Arinova.

## Problem

- Most messaging platforms offer free stickers, making it hard to justify charging for basic stickers
- AI agents cannot interpret image-only stickers — they see a picture with no context
- No existing platform has solved the "sticker + AI" interaction gap

## Solution

### Two-Tier Sticker System

| | Free Stickers | Agent Compatible Stickers |
|---|---|---|
| Price | 0 (free download) | Paid (creator sets price) |
| Human chat | Normal display | Normal display |
| Agent chat | Agent ignores / sees image only | Agent understands meaning and responds |
| Badge | None | "AI" badge on sticker |
| Gift | Share / recommend | Purchase as gift |

### How Agent Compatible Works

Each sticker in an Agent Compatible pack has an `agent_prompt` field — a short text description of the sticker's intent/emotion. When a user sends this sticker in an agent conversation:

1. Frontend sends the sticker as usual (image display)
2. Backend detects the sticker has `agent_prompt` metadata
3. Backend injects the prompt as a hidden text message alongside the sticker image
4. Agent receives: `[User sent a sticker: <agent_prompt>]` (e.g., `[User sent a sticker: User is greeting you cheerfully with a wave]`)
5. Agent responds naturally based on the context

**Example:**
- User sends a cat-waving sticker with `agent_prompt: "User is saying hello in a cute, playful way"`
- Agent sees: `[User sent a sticker: User is saying hello in a cute, playful way]`
- Agent responds: "Hey there! You seem to be in a good mood today!"

### Sticker Pack Metadata

Each pack gains a new boolean flag: `agent_compatible`

- `false` (default): Free pack, no agent prompts
- `true`: Paid pack, each sticker has `agent_prompt` field

Each individual sticker gains a new field: `agent_prompt`

- `NULL` for free stickers
- Text string for Agent Compatible stickers (e.g., "User is feeling happy and excited")

## DB Schema Changes

### sticker_packs table
```sql
ALTER TABLE sticker_packs ADD COLUMN agent_compatible BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sticker_packs ADD COLUMN review_status TEXT NOT NULL DEFAULT 'none';
-- Values: 'none' (free pack), 'pending_review', 'approved', 'rejected'
ALTER TABLE sticker_packs ADD COLUMN review_note TEXT;
-- Admin rejection reason
```

### stickers table
```sql
ALTER TABLE stickers ADD COLUMN agent_prompt VARCHAR(200);
-- Max 200 characters, English only, NULL for free stickers
```

## API Changes

### Existing endpoints (add new fields)

- `GET /api/sticker-packs` — response includes `agentCompatible: boolean`
- `GET /api/sticker-packs/:id` — response includes `agentCompatible: boolean`
- Each sticker object includes `agentPrompt: string | null`

### Message sending flow (agent conversations)

When sending a sticker in an agent conversation:
1. Frontend sends sticker message as normal (type: "sticker", with sticker ID/filename)
2. Backend checks if the sticker has `agent_prompt`
3. If yes, the message stored/sent to agent includes the prompt text in metadata:
   ```json
   {
     "role": "user",
     "content": "[User sent a sticker: <agent_prompt>]",
     "metadata": {
       "type": "sticker",
       "stickerId": "...",
       "stickerUrl": "...",
       "agentPrompt": "User is greeting you cheerfully"
     }
   }
   ```
4. Agent plugin reads `content` field which contains the prompt
5. Human users in the same conversation still see the sticker image (not the text)

### Creator Console (sticker management)

- When creating/editing a pack, toggle "Agent Compatible" on/off
- If Agent Compatible = true:
  - Price field becomes required (minimum > 0)
  - Each sticker shows an `agent_prompt` text input field (max 200 chars)
  - Validation: all stickers in an Agent Compatible pack must have agent_prompt filled
  - "Submit for Review" button — triggers review fee payment + sets status to `pending_review`
  - Pack is not visible in shop until `review_status = 'approved'`
- Self-purchase blocked: API returns error if `creator_id === buyer_id`

### Admin Review Panel

- List all packs with `review_status = 'pending_review'`
- View each sticker's image alongside its `agent_prompt`
- Approve or reject (with note) each pack
- Check for: prompt injection, inappropriate content, prompt-visual mismatch

## UI/UX

### Sticker Shop
- Agent Compatible packs show an "AI" badge on the pack card
- Pack detail page explains the feature: "This sticker pack works with AI agents — they can understand and respond to these stickers!"
- Filter/tab: "All" | "Free" | "Agent Compatible"

**Agent Prompt Preview (pack detail page):**
- Each sticker shows a truncated agent_prompt below the image (first ~50 chars + "...")
- Tap/click a sticker to expand and see the full agent_prompt
- "Try it" demo section at the top of pack detail: shows a simulated chat where a sticker is sent and an agent responds naturally — static example to demonstrate the value of Agent Compatible stickers

### Sticker Picker (in chat)

**Layout: LINE-style inline panel (not overlay)**
- Sticker picker opens as a **bottom panel that pushes the chat area up**, not an overlay/popup that covers messages
- Similar to how the keyboard works — chat content remains visible above, just with reduced height
- User can see conversation context while browsing stickers
- Panel height: ~40-50% of screen (adjustable by drag handle)
- Smooth transition animation when opening/closing
- Closing: tap outside, swipe down, or tap the sticker icon again

**Content:**
- Agent Compatible stickers show a small "AI" indicator on the corner
- In agent conversations: tooltip or subtle hint "This sticker will be understood by your agent"
- In human conversations: no difference, works like normal stickers

### Sticker Picker — Favorites & Recents

Users will collect Agent Compatible stickers across multiple packs for quick replies. Without quick access, digging through packs every time is impractical.

**Recents tab:**
- Automatically tracks recently sent stickers (last ~30)
- Sorted by last-used time (most recent first)
- Stored locally (localStorage) — no backend needed
- Shows stickers from all owned packs mixed together

**Favorites tab:**
- User long-presses / right-clicks a sticker to "Add to Favorites"
- Manually curated list of go-to stickers across all packs
- Synced to backend (survives device switch / clear cache)
- Drag to reorder

**Agent Compatible filter toggle:**
- A toggle/switch in the picker header to show only Agent Compatible stickers
- When ON: Recents/Favorites/Packs all filter to show only AI stickers
- When OFF (default): show all stickers
- Useful in agent conversations where users only want stickers the agent can understand

**Picker tab order:** Recents | Favorites | [Pack 1] | [Pack 2] | ...

**DB (favorites only — recents are client-side):**
```sql
CREATE TABLE user_favorite_stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  sticker_id UUID NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, sticker_id)
);
```

### Sticker Shop Gift Flow
- Free packs: "Share" button (recommend to friend)
- Agent Compatible (paid) packs: "Gift" button (purchase for friend)

## Business Model

- **Free stickers (non-Agent Compatible)**: All free, zero barrier, drive adoption
- **Agent Compatible stickers**: Revenue through unique AI value
  - Creator sets price (minimum > 0)
  - Revenue split: Creator 70% / Platform 30% (adjustable)
  - Creator cannot purchase their own pack (`creator_id !== buyer_id` enforced server-side)

### Review Fee (Agent Compatible packs only)

Agent Compatible packs require **human review** before going live. A one-time **review fee** is charged upon submission.

**Rationale:**
- `agent_prompt` fields are injected directly into AI agent conversations — malicious or inappropriate prompts could manipulate agent behavior (prompt injection attacks)
- All agent_prompt content must be manually reviewed for safety and quality
- The review fee covers the cost of human review and prevents abuse (e.g., users creating their own Agent Compatible packs to bypass purchasing)

**Review flow:**
1. Creator submits Agent Compatible pack with all `agent_prompt` fields filled
2. Creator pays the review fee (amount TBD, e.g., $5-10)
3. Pack enters "pending_review" status
4. Admin reviews all `agent_prompt` content for:
   - Prompt injection attempts
   - Inappropriate / harmful content
   - Quality and relevance (does the prompt match the sticker's visual?)
5. Approved: pack goes live in the sticker shop
6. Rejected: creator notified with reason, can revise and resubmit (re-review may require additional fee)

**DB addition:**
```sql
ALTER TABLE sticker_packs ADD COLUMN review_status TEXT NOT NULL DEFAULT 'none';
-- Values: 'none' (free pack), 'pending_review', 'approved', 'rejected'
ALTER TABLE sticker_packs ADD COLUMN review_note TEXT;
-- Admin rejection reason
```

- **Future**: Creator tools to easily generate agent_prompt suggestions (AI-assisted)

## Implementation Phases

### Phase 1: Schema + Backend
- DB migration (add `agent_compatible`, `agent_prompt`, `review_status`, `review_note` columns)
- Update sticker API responses to include new fields
- Add self-purchase block (`creator_id !== buyer_id`)
- Update Creator Console endpoints for agent_compatible pack management

### Phase 2: Agent Prompt Injection
- Modify message sending flow for agent conversations
- When sticker has `agent_prompt`, inject context for agent
- Update OpenClaw plugin to handle sticker messages with prompt

### Phase 3: Frontend UI
- Sticker shop: AI badge, filter tabs, feature explanation
- Sticker picker: AI indicator on compatible stickers
- Sticker picker: Recents tab (client-side, localStorage)
- Sticker picker: Favorites tab (backend-synced, reorderable)
- Favorite action: long-press / right-click sticker to add/remove
- Creator Console: agent_compatible toggle + agent_prompt input fields
- "Submit for Review" flow with review fee payment

### Phase 4: Review + Pricing
- Admin review panel for pending Agent Compatible packs
- Set existing packs to price=0 (free)
- Create sample Agent Compatible pack(s) with pricing
- Update gift flow: free packs = share, paid packs = gift purchase

## Success Metrics

- Agent Compatible sticker purchase rate
- Sticker usage rate in agent conversations (before vs after)
- Creator adoption of Agent Compatible format
- User engagement: do users who buy AI stickers chat with agents more?

## Decisions (Confirmed)

1. **All-or-nothing per pack** — entire pack is either Agent Compatible or not, no mixing
2. **agent_prompt in English only** for now (agents handle English best), i18n later
3. **agent_prompt max 200 characters**
