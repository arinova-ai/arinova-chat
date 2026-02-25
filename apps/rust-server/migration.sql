-- Migration: Multi-user social features for Rust server
-- Run against production: postgresql://postgres:***@interchange.proxy.rlwy.net:49660/railway

-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction, so enum changes come first

-- Add 'system' to message_role (existing: 'user', 'agent')
ALTER TYPE message_role ADD VALUE IF NOT EXISTS 'system';

-- New enums for multi-user features (DO block checks if they exist first)
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

DO $$ BEGIN
  CREATE TYPE agent_listing_status AS ENUM ('draft', 'published', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

BEGIN;

-- ===== 2. Alter Existing Tables =====

-- user: add username column
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS username VARCHAR(32) UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_username_lower ON "user" (LOWER(username));

-- agents: add voice_capable column
ALTER TABLE agents ADD COLUMN IF NOT EXISTS voice_capable BOOLEAN NOT NULL DEFAULT FALSE;

-- conversation_members: add owner_user_id and listen_mode
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS owner_user_id TEXT REFERENCES "user"(id);
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS listen_mode agent_listen_mode NOT NULL DEFAULT 'owner_only';

-- messages: add sender_user_id
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_user_id TEXT;

-- ===== 3. New Tables =====

-- User members in conversations (multi-user groups)
CREATE TABLE IF NOT EXISTS conversation_user_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    role conversation_user_role NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

-- Agent listen mode whitelist
CREATE TABLE IF NOT EXISTS agent_listen_allowed_users (
    agent_id UUID NOT NULL,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    PRIMARY KEY (agent_id, conversation_id, user_id)
);

-- Friendships
CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id TEXT NOT NULL REFERENCES "user"(id),
    addressee_id TEXT NOT NULL REFERENCES "user"(id),
    status friendship_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(requester_id, addressee_id)
);

-- Group settings
CREATE TABLE IF NOT EXISTS group_settings (
    conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
    history_visible BOOLEAN NOT NULL DEFAULT FALSE,
    max_users INTEGER NOT NULL DEFAULT 50,
    max_agents INTEGER NOT NULL DEFAULT 10,
    invite_link VARCHAR(32) UNIQUE,
    invite_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

-- ===== 4. Indexes =====

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_user_members_conv ON conversation_user_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_user_members_user ON conversation_user_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_conv ON conversation_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);

-- ===== 5. Agent Marketplace Tables =====

CREATE TABLE IF NOT EXISTS agent_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id TEXT NOT NULL,
    agent_name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    avatar_url TEXT,
    system_prompt TEXT NOT NULL,
    api_key_encrypted TEXT,
    model_id VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
    price INTEGER NOT NULL DEFAULT 0,
    status agent_listing_status NOT NULL DEFAULT 'draft',
    sales_count INTEGER NOT NULL DEFAULT 0,
    avg_rating NUMERIC(3,2),
    review_count INTEGER NOT NULL DEFAULT 0,
    example_conversations JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES agent_listings(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(listing_id, user_id)
);

CREATE TABLE IF NOT EXISTS marketplace_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES agent_listings(id),
    user_id TEXT NOT NULL,
    title VARCHAR(200),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES marketplace_conversations(id) ON DELETE CASCADE,
    role message_role NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_listings_creator ON agent_listings(creator_id);
CREATE INDEX IF NOT EXISTS idx_agent_listings_status ON agent_listings(status);
CREATE INDEX IF NOT EXISTS idx_agent_reviews_listing ON agent_reviews(listing_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_conversations_user ON marketplace_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_conversations_listing ON marketplace_conversations(listing_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_conv ON marketplace_messages(conversation_id, created_at);

COMMIT;
