-- Community Settings Phase 2: permissions, invites, notification preferences

-- Add permission columns to communities
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS invite_permission TEXT NOT NULL DEFAULT 'admin'
    CHECK (invite_permission IN ('admin', 'member')),
  ADD COLUMN IF NOT EXISTS post_permission TEXT NOT NULL DEFAULT 'everyone'
    CHECK (post_permission IN ('everyone', 'admin_only')),
  ADD COLUMN IF NOT EXISTS allow_agents BOOLEAN NOT NULL DEFAULT TRUE;

-- Add notification_preference to community_members
ALTER TABLE community_members
  ADD COLUMN IF NOT EXISTS notification_preference TEXT NOT NULL DEFAULT 'all'
    CHECK (notification_preference IN ('all', 'mentions', 'mute'));

-- Invite system
CREATE TABLE IF NOT EXISTS community_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    created_by TEXT NOT NULL REFERENCES "user"(id),
    code VARCHAR(20) NOT NULL UNIQUE,
    max_uses INTEGER,
    use_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_invites_community ON community_invites(community_id);
CREATE INDEX IF NOT EXISTS idx_community_invites_code ON community_invites(code);
