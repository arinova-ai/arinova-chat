# PRD: Lounge — Voice Agent for Influencers

## Overview

Lounge is a new community type in Arinova Chat where influencers (KOLs) can create AI-powered voice agents that interact with fans using the influencer's cloned voice. Fans enter a Lounge to have 1-on-1 conversations with a Voice Agent that sounds like the influencer, available 24/7 without the influencer being online.

## Problem

- Influencers who don't do live streaming have no scalable way to interact with fans
- Fans want personal interaction, but influencers lack time or willingness to go live
- Current options are limited to "reply to comments" or "ignore" — no middle ground
- Voice interaction creates stronger emotional connection than text, but requires real-time presence

## Target Users

### Influencer Side
- Instagram / Xiaohongshu photo-based creators — not comfortable with live streaming
- YouTube knowledge creators — recognizable voice but don't livestream
- Podcast hosts — loyal listeners but no real-time interaction channel
- Semi-retired influencers — still have fans but don't want to invest time

### Fan Side
- Fans who want personal interaction beyond comments/DMs
- Fans in different time zones who miss live events
- Fans willing to pay for exclusive, personalized experiences

## Solution

### New Community Type: Lounge

Add `lounge` as a third community type alongside `official` and `club`.

| | Official | Club | Lounge |
|---|---|---|---|
| Purpose | Business customer service | Group chat community | Fan-influencer voice interaction |
| Owner | Verified business | Any user | Verified influencer |
| Interaction | 1-on-1 CS (AI/human) | Group conversation | 1-on-1 Voice Agent |
| Key Feature | CS queue + handoff | Shared chat room | Voice-cloned AI agent |

### Core Flow

1. **Influencer Setup**
   - Create a Lounge community
   - Upload 3-5 minutes of voice samples (clear speech, various tones)
   - Configure agent persona: personality, knowledge base, topics, boundaries
   - Set monetization: free tier limits, paid tier pricing

2. **Voice Clone Generation**
   - Platform processes voice samples via Voice Cloning API
   - Generates a voice model tied to this Lounge
   - Influencer previews and approves the voice clone

3. **Fan Interaction**
   - Fan discovers Lounge via browse/search or influencer's external link
   - Fan enters Lounge → starts 1-on-1 conversation with Voice Agent
   - Agent responds in text + synthesized voice (influencer's voice)
   - Conversation is private (only fan + agent)

4. **Influencer Dashboard**
   - View active conversations / fan engagement stats
   - Revenue dashboard (earnings, subscriber count)
   - Voice model management (re-record, update)
   - Content moderation settings

### Chat Integration

In the conversation list, add a **Lounge** tab/filter alongside existing categories:

```
[All] [Direct] [Groups] [Officials] [Clubs] [Lounges]
```

Lounge conversations appear as 1-on-1 chats with a special badge indicating it's a Voice Agent.

### Monetization

| Tier | Access | Price |
|---|---|---|
| Free | N minutes/day of voice chat | 0 |
| Subscriber | Unlimited voice chat + exclusive voice content | Monthly subscription (influencer sets price) |
| Gift | Personalized voice message (birthday, etc.) | Per-message fee |

**Revenue split:** Platform 20-30%, Influencer 70-80%

## Technical Design

### Database Changes

```sql
-- Add 'lounge' to community type
ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_type_check;
ALTER TABLE communities ADD CONSTRAINT communities_type_check
  CHECK (type IN ('official', 'club', 'lounge'));

-- Lounge-specific columns on communities
ALTER TABLE communities ADD COLUMN IF NOT EXISTS voice_model_id VARCHAR(255);
ALTER TABLE communities ADD COLUMN IF NOT EXISTS voice_model_status VARCHAR(20) DEFAULT 'pending'
  CHECK (voice_model_status IN ('pending', 'processing', 'ready', 'failed'));
ALTER TABLE communities ADD COLUMN IF NOT EXISTS voice_samples_url TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS free_minutes_per_day INTEGER DEFAULT 5;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS subscription_price_cents INTEGER;

-- Lounge subscriptions
CREATE TABLE IF NOT EXISTS lounge_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  tier VARCHAR(20) DEFAULT 'free' CHECK (tier IN ('free', 'subscriber')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE (community_id, user_id)
);

-- Voice usage tracking
CREATE TABLE IF NOT EXISTS lounge_voice_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  date DATE DEFAULT CURRENT_DATE,
  minutes_used NUMERIC(6,2) DEFAULT 0,
  UNIQUE (community_id, user_id, date)
);
```

### Voice Cloning Integration

Candidate APIs (evaluate during implementation):
- **Fish Audio** — Chinese-friendly, competitive pricing
- **ElevenLabs** — Industry leader, high quality
- **OpenAI TTS** — If custom voice cloning becomes available

Integration architecture:
```
Agent (persona + knowledge) + Voice Model (cloned voice)
         ↓                           ↓
    Text response              TTS synthesis
         ↓                           ↓
    Chat message      +      Audio attachment
```

### API Endpoints

```
POST   /api/lounge                           — Create lounge
GET    /api/lounge/:id                       — Get lounge details
POST   /api/lounge/:id/voice-samples         — Upload voice samples
POST   /api/lounge/:id/generate-voice        — Trigger voice clone generation
GET    /api/lounge/:id/voice-status          — Check voice model status
POST   /api/lounge/:id/subscribe             — Subscribe to lounge
GET    /api/lounge/:id/usage                 — Get voice usage for current user
GET    /api/lounge/:id/dashboard             — Influencer dashboard data
POST   /api/lounge/:id/chat                  — Send message (checks usage limits)
```

### Frontend Pages

- `/community` — Add Lounge tab in browse page
- `/community/[id]` — Lounge detail page (voice agent preview, subscribe button)
- `/lounge/[id]/dashboard` — Influencer dashboard (stats, voice management, revenue)
- Chat view — Voice message playback in conversation bubbles

## MVP Scope

Phase 1 (MVP):
- Lounge community type creation
- Voice sample upload + clone generation (single API provider)
- Basic 1-on-1 text chat with Voice Agent (text-only first, voice TTS in phase 2)
- Free tier with daily message limit
- Basic influencer dashboard

Phase 2:
- Voice TTS in chat (audio messages)
- Subscription/payment integration
- Personalized voice message gifts
- Voice model re-training / update

Phase 3:
- Real-time voice call with Voice Agent
- Influencer live takeover (switch from AI to real person mid-conversation)
- Fan engagement analytics
- Revenue payouts

## Success Metrics

- Number of Lounges created
- Fan engagement rate (messages per active user per day)
- Free → Subscriber conversion rate
- Influencer retention (active after 30 days)
- Revenue per Lounge

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Voice clone quality too low | Start with text-only MVP, add voice when quality meets bar |
| Legal/ethical concerns with voice cloning | Require explicit influencer consent + voice watermarking |
| Low fan willingness to pay | Generous free tier to build habit, then upsell |
| API costs too high per conversation | Set daily free limits, cache common responses |
| Influencer content moderation | Agent persona boundaries + automated content filtering |
