-- 0016: Add multi-user social feature tables
-- Synced from apps/rust-server/migration.sql

-- New enums
DO $$ BEGIN
  CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE conversation_user_role AS ENUM ('admin', 'vice_admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE agent_listen_mode AS ENUM ('owner_only', 'allowed_users', 'all_mentions');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add 'system' to message_role
ALTER TYPE message_role ADD VALUE IF NOT EXISTS 'system';

-- Alter existing tables
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS owner_user_id TEXT REFERENCES "user"(id);
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS listen_mode agent_listen_mode NOT NULL DEFAULT 'owner_only';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_user_id TEXT;

-- New tables
CREATE TABLE IF NOT EXISTS conversation_user_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    role conversation_user_role NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    hidden_at TIMESTAMP,
    UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS agent_listen_allowed_users (
    agent_id UUID NOT NULL,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    PRIMARY KEY (agent_id, conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id TEXT NOT NULL REFERENCES "user"(id),
    addressee_id TEXT NOT NULL REFERENCES "user"(id),
    status friendship_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(requester_id, addressee_id)
);

CREATE TABLE IF NOT EXISTS group_settings (
    conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
    history_visible BOOLEAN NOT NULL DEFAULT FALSE,
    max_users INTEGER NOT NULL DEFAULT 50,
    max_agents INTEGER NOT NULL DEFAULT 10,
    invite_link VARCHAR(32) UNIQUE,
    invite_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_user_members_conv ON conversation_user_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_user_members_user ON conversation_user_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_conv ON conversation_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);

-- Backfill: add hidden_at if table was created without it
ALTER TABLE conversation_user_members ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP;
