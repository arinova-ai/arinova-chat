-- Add approval and agent policy fields to communities
ALTER TABLE communities ADD COLUMN IF NOT EXISTS require_approval BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS approval_questions TEXT[] DEFAULT '{}';
ALTER TABLE communities ADD COLUMN IF NOT EXISTS agent_join_policy TEXT NOT NULL DEFAULT 'owner_only'
  CHECK (agent_join_policy IN ('owner_only', 'admin_agents', 'member_agents'));

-- Join applications table
CREATE TABLE IF NOT EXISTS community_join_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    answers JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by TEXT REFERENCES "user"(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_join_applications_community_status
    ON community_join_applications(community_id, status);
