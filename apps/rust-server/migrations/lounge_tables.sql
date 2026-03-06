-- Lounge MVP tables
-- Depends on: conversation_type_expand.sql (lounge enum value)

-- Expand communities CHECK to include 'lounge'
ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_type_check;
ALTER TABLE communities ADD CONSTRAINT communities_type_check CHECK (type IN ('official', 'club', 'lounge'));

-- New columns for lounge voice cloning
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS voice_model_id TEXT,
  ADD COLUMN IF NOT EXISTS voice_model_status TEXT DEFAULT 'none'
    CHECK (voice_model_status IN ('none', 'processing', 'ready', 'failed')),
  ADD COLUMN IF NOT EXISTS voice_samples_url TEXT,
  ADD COLUMN IF NOT EXISTS free_minutes_per_day INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS subscription_price_cents INTEGER NOT NULL DEFAULT 0;

-- Lounge subscriptions (fan pays for premium access)
CREATE TABLE IF NOT EXISTS lounge_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  UNIQUE(community_id, user_id)
);

-- Daily voice usage tracking
CREATE TABLE IF NOT EXISTS lounge_voice_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  seconds_used INTEGER NOT NULL DEFAULT 0,
  UNIQUE(community_id, user_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_lounge_subs_community ON lounge_subscriptions(community_id);
CREATE INDEX IF NOT EXISTS idx_lounge_subs_user ON lounge_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_lounge_usage_lookup ON lounge_voice_usage(community_id, user_id, usage_date);
