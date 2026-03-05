-- Community Official + Club redesign migration

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

-- community_members: add cs_agent role
ALTER TABLE community_members DROP CONSTRAINT IF EXISTS community_members_role_check;
ALTER TABLE community_members ADD CONSTRAINT community_members_role_check
  CHECK (role IN ('creator', 'moderator', 'member', 'cs_agent'));

-- Official 1-on-1 conversation tracking
CREATE TABLE IF NOT EXISTS official_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES "user"(id),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'ai_active'
    CHECK (status IN ('ai_active', 'human_active', 'waiting_human', 'resolved', 'closed')),
  assigned_cs_id UUID REFERENCES "user"(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (community_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_official_conv_community ON official_conversations(community_id);
CREATE INDEX IF NOT EXISTS idx_official_conv_user ON official_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_official_conv_cs ON official_conversations(assigned_cs_id) WHERE assigned_cs_id IS NOT NULL;

-- Verification requests
CREATE TABLE IF NOT EXISTS official_verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES "user"(id),
  business_name VARCHAR(255),
  business_registration TEXT,
  documents_url TEXT,
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- Archive existing lounges
UPDATE communities SET type = 'club', status = 'archived' WHERE type = 'lounge';
