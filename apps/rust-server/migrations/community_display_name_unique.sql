-- Enforce display_name uniqueness per community (case-insensitive) to prevent race conditions
CREATE UNIQUE INDEX IF NOT EXISTS uq_community_members_display_name
    ON community_members (community_id, LOWER(display_name))
    WHERE display_name IS NOT NULL;
