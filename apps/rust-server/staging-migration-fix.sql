-- Staging migration for #18 (pinned_messages) and #19 (community_members)
-- Run this against the staging DB to fix 404/500 errors

-- #18: Pin API returns 404 because pinned_messages table is missing
CREATE TABLE IF NOT EXISTS pinned_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    pinned_by TEXT NOT NULL,
    pinned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(conversation_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_pinned_messages_conv ON pinned_messages(conversation_id);

-- Link preview tables (required by message queries)
CREATE TABLE IF NOT EXISTS link_previews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL UNIQUE,
    title TEXT,
    description TEXT,
    image_url TEXT,
    favicon_url TEXT,
    domain TEXT,
    fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_link_previews_url ON link_previews(url);

CREATE TABLE IF NOT EXISTS message_link_previews (
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    preview_id UUID NOT NULL REFERENCES link_previews(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (message_id, preview_id)
);
CREATE INDEX IF NOT EXISTS idx_message_link_previews_msg ON message_link_previews(message_id);

-- #19: Members API returns 500 because community_members may be missing subscription_status
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
