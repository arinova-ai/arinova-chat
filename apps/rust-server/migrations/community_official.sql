-- Community Official + Club redesign migration

-- Archive existing lounges FIRST (before changing type constraint)
UPDATE communities SET type = 'club', status = 'archived' WHERE type = 'lounge';

-- Update type constraint to include 'official'
ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_type_check;
ALTER TABLE communities ADD CONSTRAINT communities_type_check
  CHECK (type IN ('official', 'club'));

-- Official-specific columns
ALTER TABLE communities ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS default_agent_listing_id UUID REFERENCES agent_listings(id);
ALTER TABLE communities ADD COLUMN IF NOT EXISTS cs_mode VARCHAR(20) DEFAULT 'ai_only'
  CHECK (cs_mode IN ('ai_only', 'human_only', 'hybrid'));

-- community_members: add cs_agent to role enum
-- (role column uses community_role enum, not CHECK constraint)
DO $$ BEGIN
  ALTER TYPE community_role ADD VALUE IF NOT EXISTS 'cs_agent';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Official 1-on-1 conversation tracking
-- user_id and assigned_cs_id are TEXT to match "user".id type
CREATE TABLE IF NOT EXISTS official_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'ai_active'
    CHECK (status IN ('ai_active', 'human_active', 'waiting_human', 'resolved', 'closed')),
  assigned_cs_id TEXT REFERENCES "user"(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (community_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_official_conv_community ON official_conversations(community_id);
CREATE INDEX IF NOT EXISTS idx_official_conv_user ON official_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_official_conv_cs ON official_conversations(assigned_cs_id) WHERE assigned_cs_id IS NOT NULL;

-- Verification requests
-- requester_id is TEXT to match "user".id type
CREATE TABLE IF NOT EXISTS official_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  requester_id TEXT NOT NULL REFERENCES "user"(id),
  business_name VARCHAR(255),
  business_registration TEXT,
  documents_url TEXT,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
