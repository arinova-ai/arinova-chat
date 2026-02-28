-- Migration: Multi-user social features for Rust server
-- Run against production: postgresql://postgres:***@interchange.proxy.rlwy.net:49660/railway

-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction, so enum changes come first

-- Add 'system' to message_role (existing: 'user', 'agent')
ALTER TYPE message_role ADD VALUE IF NOT EXISTS 'system';
-- Add 'assistant' for marketplace chat (Rust uses 'assistant' instead of 'agent')
ALTER TYPE message_role ADD VALUE IF NOT EXISTS 'assistant';

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
  CREATE TYPE agent_listing_status AS ENUM ('draft', 'pending_review', 'active', 'suspended', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- pgvector extension for RAG embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Add 'kb_upload' to coin_transaction_type (for KB file upload billing)
ALTER TYPE coin_transaction_type ADD VALUE IF NOT EXISTS 'kb_upload';

-- Community billing transaction types
ALTER TYPE coin_transaction_type ADD VALUE IF NOT EXISTS 'community_join';
ALTER TYPE coin_transaction_type ADD VALUE IF NOT EXISTS 'community_subscription';
ALTER TYPE coin_transaction_type ADD VALUE IF NOT EXISTS 'community_agent_call';

-- Community role enum: add 'creator' and 'moderator' (Rust code uses these instead of 'owner'/'admin')
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'creator' AND enumtypid = 'community_role'::regtype) THEN
    ALTER TYPE community_role ADD VALUE 'creator';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'moderator' AND enumtypid = 'community_role'::regtype) THEN
    ALTER TYPE community_role ADD VALUE 'moderator';
  END IF;
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

-- ===== 5b. Column renames for TS→Rust name alignment =====
-- Existing deployments where TS created agent_listings use different column names.
-- IF EXISTS guards ensure these are no-ops on fresh installs (schema.sql already correct).

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_listings' AND column_name='name') THEN
    ALTER TABLE agent_listings RENAME COLUMN name TO agent_name;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_listings' AND column_name='encrypted_api_key') THEN
    ALTER TABLE agent_listings RENAME COLUMN encrypted_api_key TO api_key_encrypted;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_listings' AND column_name='total_conversations') THEN
    ALTER TABLE agent_listings RENAME COLUMN total_conversations TO sales_count;
  END IF;
END $$;

ALTER TABLE agent_listings ADD COLUMN IF NOT EXISTS price INTEGER NOT NULL DEFAULT 0;

-- agent_reviews: rename agent_listing_id → listing_id
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_reviews' AND column_name='agent_listing_id') THEN
    ALTER TABLE agent_reviews RENAME COLUMN agent_listing_id TO listing_id;
  END IF;
END $$;

-- marketplace_conversations: rename agent_listing_id → listing_id, add title
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='marketplace_conversations' AND column_name='agent_listing_id') THEN
    ALTER TABLE marketplace_conversations RENAME COLUMN agent_listing_id TO listing_id;
  END IF;
END $$;

ALTER TABLE marketplace_conversations ADD COLUMN IF NOT EXISTS title VARCHAR(255);

-- ===== 6. Billing columns for per-message pricing =====

ALTER TABLE agent_listings ADD COLUMN IF NOT EXISTS price_per_message INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agent_listings ADD COLUMN IF NOT EXISTS free_trial_messages INTEGER NOT NULL DEFAULT 3;
ALTER TABLE agent_listings ADD COLUMN IF NOT EXISTS total_messages INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agent_listings ADD COLUMN IF NOT EXISTS total_revenue INTEGER NOT NULL DEFAULT 0;

ALTER TABLE marketplace_conversations ADD COLUMN IF NOT EXISTS message_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE agent_listings ADD COLUMN IF NOT EXISTS welcome_message TEXT;
ALTER TABLE agent_listings ADD COLUMN IF NOT EXISTS model_provider VARCHAR(50) NOT NULL DEFAULT 'openai';

-- ===== 7. Knowledge Base Tables (RAG) =====

CREATE TABLE IF NOT EXISTS agent_knowledge_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES agent_listings(id) ON DELETE CASCADE,
    creator_id TEXT NOT NULL REFERENCES "user"(id),
    file_name VARCHAR(255) NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    file_type VARCHAR(50),
    status VARCHAR(50) NOT NULL DEFAULT 'processing',
    chunk_count INTEGER NOT NULL DEFAULT 0,
    total_chars INTEGER NOT NULL DEFAULT 0,
    embedding_model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-small',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_base_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kb_id UUID NOT NULL REFERENCES agent_knowledge_bases(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    embedding vector(1536),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE agent_knowledge_bases ADD COLUMN IF NOT EXISTS raw_content TEXT;

CREATE INDEX IF NOT EXISTS idx_kb_listing ON agent_knowledge_bases(listing_id);
CREATE INDEX IF NOT EXISTS idx_kb_creator ON agent_knowledge_bases(creator_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_kb_id ON knowledge_base_chunks(kb_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding ON knowledge_base_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ===== 8. Marketplace OpenRouter migration =====
-- Replace per-creator API keys with platform-managed OpenRouter
-- Re-entrant: safe to run multiple times

-- Add model column (OpenRouter model ID format: 'provider/model-name')
ALTER TABLE agent_listings ADD COLUMN IF NOT EXISTS model TEXT;

-- Backfill model from existing model_provider + model_id (only if old columns still exist)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_listings' AND column_name = 'model_provider'
  ) THEN
    UPDATE agent_listings
    SET model = model_provider || '/' || model_id
    WHERE model IS NULL;
  END IF;
END $$;

-- Fill any remaining NULLs with default (covers fresh installs or re-runs)
UPDATE agent_listings SET model = 'openai/gpt-4o-mini' WHERE model IS NULL;

-- Set NOT NULL + default after backfill
ALTER TABLE agent_listings ALTER COLUMN model SET NOT NULL;
ALTER TABLE agent_listings ALTER COLUMN model SET DEFAULT 'openai/gpt-4o-mini';

-- Add input character limit
ALTER TABLE agent_listings ADD COLUMN IF NOT EXISTS input_char_limit INTEGER NOT NULL DEFAULT 2000;

-- Drop deprecated columns
ALTER TABLE agent_listings DROP COLUMN IF EXISTS api_key_encrypted;
ALTER TABLE agent_listings DROP COLUMN IF EXISTS model_provider;
ALTER TABLE agent_listings DROP COLUMN IF EXISTS model_id;

-- ===== 9. Community Lounge + Hub tables =====

-- Expand existing communities table with type, pricing, status, metadata
ALTER TABLE communities ADD COLUMN IF NOT EXISTS creator_id TEXT;

-- Backfill creator_id from owner_id if it exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'communities' AND column_name = 'owner_id'
  ) THEN
    UPDATE communities SET creator_id = owner_id WHERE creator_id IS NULL;
  END IF;
END $$;

ALTER TABLE communities ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'lounge';
ALTER TABLE communities ADD COLUMN IF NOT EXISTS join_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS monthly_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS agent_call_fee INTEGER NOT NULL DEFAULT 0;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE communities ADD COLUMN IF NOT EXISTS member_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Drop old columns no longer needed
ALTER TABLE communities DROP COLUMN IF EXISTS owner_id;
ALTER TABLE communities DROP COLUMN IF EXISTS is_public;

-- Set creator_id NOT NULL after backfill
ALTER TABLE communities ALTER COLUMN creator_id SET NOT NULL;

-- Add FK constraint for communities.creator_id → user(id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'communities_creator_id_fkey'
  ) THEN
    ALTER TABLE communities ADD CONSTRAINT communities_creator_id_fkey
      FOREIGN KEY (creator_id) REFERENCES "user"(id);
  END IF;
END $$;

-- Add CHECK constraints matching schema.sql
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'communities_type_check'
  ) THEN
    ALTER TABLE communities ADD CONSTRAINT communities_type_check
      CHECK (type IN ('lounge', 'hub'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'communities_status_check'
  ) THEN
    ALTER TABLE communities ADD CONSTRAINT communities_status_check
      CHECK (status IN ('active', 'suspended', 'archived'));
  END IF;
END $$;

-- Expand community_members with subscription fields + unique constraint
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- Add FK constraint for community_members.user_id → user(id)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_members_user_id_fkey'
  ) THEN
    ALTER TABLE community_members ADD CONSTRAINT community_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES "user"(id);
  END IF;
END $$;

-- Add CHECK constraints for community_members
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_members_role_check'
  ) THEN
    ALTER TABLE community_members ADD CONSTRAINT community_members_role_check
      CHECK (role IN ('creator', 'moderator', 'member'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_members_subscription_status_check'
  ) THEN
    ALTER TABLE community_members ADD CONSTRAINT community_members_subscription_status_check
      CHECK (subscription_status IN ('active', 'expired', 'cancelled'));
  END IF;
END $$;

-- Add unique constraint if not present
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'community_members_community_id_user_id_key'
  ) THEN
    ALTER TABLE community_members ADD CONSTRAINT community_members_community_id_user_id_key
      UNIQUE (community_id, user_id);
  END IF;
END $$;

-- community_agents
CREATE TABLE IF NOT EXISTS community_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES agent_listings(id),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(community_id, listing_id)
);

-- community_messages (Lounge chat)
CREATE TABLE IF NOT EXISTS community_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id TEXT,
    agent_listing_id UUID REFERENCES agent_listings(id),
    content TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add CHECK constraint for community_messages.message_type
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_messages_message_type_check'
  ) THEN
    ALTER TABLE community_messages ADD CONSTRAINT community_messages_message_type_check
      CHECK (message_type IN ('text', 'system'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_community_messages_community ON community_messages(community_id, created_at);
CREATE INDEX IF NOT EXISTS idx_community_members_community ON community_members(community_id);
CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members(user_id);
CREATE INDEX IF NOT EXISTS idx_community_agents_community ON community_agents(community_id);

-- Fix communities timestamp columns: TIMESTAMP → TIMESTAMPTZ (Rust uses DateTime<Utc>)
ALTER TABLE communities ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE communities ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

-- ===== 10. Voice L2: TTS columns =====

-- TTS voice per agent/community
ALTER TABLE agent_listings ADD COLUMN IF NOT EXISTS tts_voice TEXT DEFAULT 'alloy';
ALTER TABLE communities ADD COLUMN IF NOT EXISTS tts_voice TEXT DEFAULT 'alloy';

-- TTS audio URL on messages
ALTER TABLE marketplace_messages ADD COLUMN IF NOT EXISTS tts_audio_url TEXT;
ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS tts_audio_url TEXT;

-- ============================================================
-- 11. Thread (討論串) support
-- ============================================================

-- thread_id 指向討論串的原始訊息（開啟 thread 的那則 message）
-- thread_id IS NULL = 主對話訊息（不在任何 thread 內）
ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id UUID;

-- Thread 統計快取（避免每次都 COUNT）
CREATE TABLE IF NOT EXISTS thread_summaries (
  thread_id UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
  reply_count INTEGER NOT NULL DEFAULT 0,
  last_reply_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reply_user_id TEXT,
  last_reply_agent_id UUID,
  participant_ids TEXT[] NOT NULL DEFAULT '{}'
);

-- Thread 已讀追蹤
CREATE TABLE IF NOT EXISTS thread_reads (
  user_id TEXT NOT NULL,
  thread_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  last_read_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, thread_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_thread_summaries_last ON thread_summaries(last_reply_at DESC);

-- #41 Voice recording duration
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- #54 Office slot bindings (server-synced agent↔slot mapping)
CREATE TABLE IF NOT EXISTS office_slot_bindings (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  theme_id TEXT NOT NULL,
  slot_index INT NOT NULL,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, theme_id, slot_index),
  UNIQUE (user_id, theme_id, agent_id)
);

COMMIT;
