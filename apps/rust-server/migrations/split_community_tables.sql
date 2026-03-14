-- Migration: Split community/official/lounge columns into separate tables
-- Officials and lounges get their own parent tables linked to communities via community_id

-- ── Officials table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS officials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL UNIQUE REFERENCES communities(id) ON DELETE CASCADE,
    cs_mode VARCHAR(20) DEFAULT 'ai_only'
        CHECK (cs_mode IN ('ai_only', 'human_only', 'hybrid')),
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    default_agent_listing_id UUID REFERENCES agent_listings(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_officials_community_id ON officials(community_id);

-- ── Lounges table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lounges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL UNIQUE REFERENCES communities(id) ON DELETE CASCADE,
    tts_voice TEXT DEFAULT 'alloy',
    voice_model_id TEXT,
    voice_model_status TEXT DEFAULT 'none'
        CHECK (voice_model_status IN ('none', 'processing', 'ready', 'failed')),
    voice_samples_url TEXT,
    free_minutes_per_day INTEGER NOT NULL DEFAULT 5,
    subscription_price_cents INTEGER NOT NULL DEFAULT 0,
    default_agent_listing_id UUID REFERENCES agent_listings(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lounges_community_id ON lounges(community_id);

-- ── Data migration (idempotent) ──────────────────────────────────
INSERT INTO officials (community_id, cs_mode, verified, verified_at, default_agent_listing_id, created_at, updated_at)
SELECT id, cs_mode, verified, verified_at, default_agent_listing_id, created_at, updated_at
FROM communities
WHERE type = 'official'
ON CONFLICT (community_id) DO NOTHING;

INSERT INTO lounges (community_id, tts_voice, voice_model_id, voice_model_status, voice_samples_url, free_minutes_per_day, subscription_price_cents, default_agent_listing_id, created_at, updated_at)
SELECT id, tts_voice, voice_model_id, voice_model_status, voice_samples_url, free_minutes_per_day, subscription_price_cents, default_agent_listing_id, created_at, updated_at
FROM communities
WHERE type = 'lounge'
ON CONFLICT (community_id) DO NOTHING;

-- NOTE: Do NOT drop columns from communities yet.
-- Old columns remain as fallback until code is deployed and verified.
-- A follow-up migration will drop: cs_mode, verified, verified_at, default_agent_listing_id,
-- tts_voice, voice_model_id, voice_model_status, voice_samples_url,
-- free_minutes_per_day, subscription_price_cents
