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

-- #89 bio column
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS bio TEXT;

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

-- Backfill model from existing model_provider + model_id (only if BOTH old columns still exist)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_listings' AND column_name = 'model_provider'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agent_listings' AND column_name = 'model_id'
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

-- Rename community type 'hub' → 'club'
UPDATE communities SET type = 'club' WHERE type = 'hub';
ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_type_check;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'communities_type_check'
  ) THEN
    ALTER TABLE communities ADD CONSTRAINT communities_type_check
      CHECK (type IN ('lounge', 'club'));
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

-- #105 User cover image
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS cover_image TEXT;

-- #114 OAuth2 Provider
CREATE TABLE IF NOT EXISTS oauth_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id TEXT UNIQUE NOT NULL,
  client_secret TEXT NOT NULL,
  name TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  description TEXT,
  icon_url TEXT,
  created_by TEXT REFERENCES "user"(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  user_id TEXT NOT NULL REFERENCES "user"(id),
  app_id UUID NOT NULL REFERENCES oauth_apps(id),
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'profile',
  state TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id),
  app_id UUID NOT NULL REFERENCES oauth_apps(id),
  access_token TEXT UNIQUE NOT NULL,
  scope TEXT NOT NULL DEFAULT 'profile',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- #114 step 5: Economy — extend coin_transaction_type for OAuth apps
DO $$ BEGIN
  ALTER TYPE coin_transaction_type ADD VALUE IF NOT EXISTS 'charge';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE coin_transaction_type ADD VALUE IF NOT EXISTS 'award';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE coin_transaction_type ADD VALUE IF NOT EXISTS 'platform_fee';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- OAuth App: who-is-killer
INSERT INTO oauth_apps (client_id, client_secret, name, redirect_uri, description)
VALUES (
  'who-is-killer',
  'wik-secret-v1',
  'Who Is Killer?',
  'https://who-is-killer-cyan.vercel.app/callback',
  'AI Mystery Game — 3 detectives find the killer'
) ON CONFLICT (client_id) DO NOTHING;

-- Sticker Store
CREATE TABLE IF NOT EXISTS sticker_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_zh TEXT,
  description TEXT,
  character_name TEXT,
  category TEXT NOT NULL DEFAULT 'cute',
  price INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  downloads INTEGER NOT NULL DEFAULT 0,
  cover_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES sticker_packs(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  emoji TEXT,
  description_en TEXT,
  description_zh TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  pack_id UUID NOT NULL REFERENCES sticker_packs(id),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, pack_id)
);

-- Fix push_subscriptions: add UNIQUE constraint for ON CONFLICT clause
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_sub_user_endpoint
  ON push_subscriptions(user_id, endpoint);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions(user_id);

-- Seed: paid sticker packs
INSERT INTO sticker_packs (id, creator_id, name, name_zh, description, character_name, category, price, cover_image, status)
VALUES
  ('a1b2c3d4-0001-4000-8000-000000000001', 'system', 'Pixel Cat Pack', '像素貓咪貼圖包', 'Adorable pixel-art cat stickers for every mood', 'Pixel Cat', 'cute', 100, '/stickers/pixel-cat-01/01-hello.png', 'active'),
  ('a1b2c3d4-0002-4000-8000-000000000002', 'system', 'Ito Ghost Pack', '伊藤潤二風女鬼貼圖包', 'Junji Ito inspired ghost stickers — creepy yet charming', 'Ito Ghost', 'anime', 100, '/stickers/ito-ghost-01/01-sinister-smile.png', 'active'),
  ('a1b2c3d4-0003-4000-8000-000000000003', 'system', 'Shinkai Girl Pack', '新海誠風女高校生貼圖包', 'Makoto Shinkai style high school girl stickers', 'Shinkai Girl', 'anime', 100, '/stickers/shinkai-girl-01/01-hello.png', 'active')
ON CONFLICT (id) DO NOTHING;

-- Seed: pixel-cat-01 stickers
INSERT INTO stickers (pack_id, filename, emoji, description_en, description_zh, sort_order) VALUES
  ('a1b2c3d4-0001-4000-8000-000000000001', '01-hello.png', '👋', 'Hello wave', '嗨', 1),
  ('a1b2c3d4-0001-4000-8000-000000000001', '02-thumbsup.png', '👍', 'Thumbs up', '讚', 2),
  ('a1b2c3d4-0001-4000-8000-000000000001', '03-love.png', '😍', 'Love hearts', '愛心', 3),
  ('a1b2c3d4-0001-4000-8000-000000000001', '04-happy.png', '😊', 'Happy', '開心', 4),
  ('a1b2c3d4-0001-4000-8000-000000000001', '05-sad.png', '😢', 'Sad', '傷心', 5),
  ('a1b2c3d4-0001-4000-8000-000000000001', '06-angry.png', '😠', 'Angry', '生氣', 6),
  ('a1b2c3d4-0001-4000-8000-000000000001', '07-surprised.png', '😮', 'Surprised', '驚訝', 7),
  ('a1b2c3d4-0001-4000-8000-000000000001', '08-thinking.png', '🤔', 'Thinking', '思考', 8),
  ('a1b2c3d4-0001-4000-8000-000000000001', '09-sleepy.png', '😴', 'Sleepy', '想睡', 9),
  ('a1b2c3d4-0001-4000-8000-000000000001', '10-celebrate.png', '🎉', 'Celebrate', '慶祝', 10),
  ('a1b2c3d4-0001-4000-8000-000000000001', '11-fighting.png', '💪', 'Fighting', '加油', 11),
  ('a1b2c3d4-0001-4000-8000-000000000001', '12-please.png', '🙏', 'Please', '拜託', 12),
  ('a1b2c3d4-0001-4000-8000-000000000001', '13-ok.png', '👌', 'OK', '好的', 13),
  ('a1b2c3d4-0001-4000-8000-000000000001', '14-awkward.png', '😅', 'Awkward', '尷尬', 14),
  ('a1b2c3d4-0001-4000-8000-000000000001', '15-hug.png', '🤗', 'Hug', '擁抱', 15),
  ('a1b2c3d4-0001-4000-8000-000000000001', '16-sparkle.png', '✨', 'Sparkle', '閃亮', 16),
  ('a1b2c3d4-0001-4000-8000-000000000001', '17-busy.png', '💼', 'Busy', '忙碌', 17),
  ('a1b2c3d4-0001-4000-8000-000000000001', '18-coffee.png', '☕', 'Coffee time', '喝咖啡', 18),
  ('a1b2c3d4-0001-4000-8000-000000000001', '19-goodnight.png', '🌙', 'Good night', '晚安', 19),
  ('a1b2c3d4-0001-4000-8000-000000000001', '20-eating.png', '🍽️', 'Eating', '吃東西', 20)
ON CONFLICT DO NOTHING;

-- Seed: ito-ghost-01 stickers
INSERT INTO stickers (pack_id, filename, emoji, description_en, description_zh, sort_order) VALUES
  ('a1b2c3d4-0002-4000-8000-000000000002', '01-sinister-smile.png', '😈', 'Sinister smile', '陰險微笑', 1),
  ('a1b2c3d4-0002-4000-8000-000000000002', '02-hollow-stare.png', '👁️', 'Hollow stare', '空洞凝視', 2),
  ('a1b2c3d4-0002-4000-8000-000000000002', '03-hair-cover.png', '🙈', 'Hair covering face', '頭髮遮臉', 3),
  ('a1b2c3d4-0002-4000-8000-000000000002', '04-screaming.png', '😱', 'Screaming', '尖叫', 4),
  ('a1b2c3d4-0002-4000-8000-000000000002', '05-crawling.png', '🕷️', 'Crawling', '爬行', 5),
  ('a1b2c3d4-0002-4000-8000-000000000002', '06-spiral-eyes.png', '🌀', 'Spiral eyes', '漩渦眼', 6),
  ('a1b2c3d4-0002-4000-8000-000000000002', '07-melting.png', '🫠', 'Melting', '融化', 7),
  ('a1b2c3d4-0002-4000-8000-000000000002', '08-eerie-wave.png', '👋', 'Eerie wave', '詭異揮手', 8),
  ('a1b2c3d4-0002-4000-8000-000000000002', '09-thumbsup.png', '👍', 'Creepy thumbs up', '詭異讚', 9),
  ('a1b2c3d4-0002-4000-8000-000000000002', '10-crying.png', '😭', 'Crying blood', '哭泣', 10),
  ('a1b2c3d4-0002-4000-8000-000000000002', '11-love.png', '❤️', 'Twisted love', '扭曲的愛', 11),
  ('a1b2c3d4-0002-4000-8000-000000000002', '12-sleeping.png', '😴', 'Sleeping', '沉睡', 12),
  ('a1b2c3d4-0002-4000-8000-000000000002', '13-angry.png', '😡', 'Angry', '憤怒', 13),
  ('a1b2c3d4-0002-4000-8000-000000000002', '14-thinking.png', '🤔', 'Thinking', '思考', 14),
  ('a1b2c3d4-0002-4000-8000-000000000002', '15-bow.png', '🙏', 'Bowing', '鞠躬', 15),
  ('a1b2c3d4-0002-4000-8000-000000000002', '16-peeking.png', '👀', 'Peeking', '偷看', 16),
  ('a1b2c3d4-0002-4000-8000-000000000002', '17-dancing.png', '💃', 'Dancing', '跳舞', 17),
  ('a1b2c3d4-0002-4000-8000-000000000002', '18-sick.png', '🤒', 'Sick', '不舒服', 18),
  ('a1b2c3d4-0002-4000-8000-000000000002', '19-pointing.png', '👉', 'Pointing', '指向', 19),
  ('a1b2c3d4-0002-4000-8000-000000000002', '20-goodbye.png', '👋', 'Goodbye', '再見', 20)
ON CONFLICT DO NOTHING;

-- Seed: shinkai-girl-01 stickers
INSERT INTO stickers (pack_id, filename, emoji, description_en, description_zh, sort_order) VALUES
  ('a1b2c3d4-0003-4000-8000-000000000003', '01-hello.png', '👋', 'Hello', '嗨', 1),
  ('a1b2c3d4-0003-4000-8000-000000000003', '02-thumbsup.png', '👍', 'Thumbs up', '讚', 2),
  ('a1b2c3d4-0003-4000-8000-000000000003', '03-love.png', '😍', 'Love', '愛心', 3),
  ('a1b2c3d4-0003-4000-8000-000000000003', '04-happy.png', '😊', 'Happy', '開心', 4),
  ('a1b2c3d4-0003-4000-8000-000000000003', '05-sad.png', '😢', 'Sad', '傷心', 5),
  ('a1b2c3d4-0003-4000-8000-000000000003', '06-angry.png', '😠', 'Angry', '生氣', 6),
  ('a1b2c3d4-0003-4000-8000-000000000003', '07-surprised.png', '😮', 'Surprised', '驚訝', 7),
  ('a1b2c3d4-0003-4000-8000-000000000003', '08-thinking.png', '🤔', 'Thinking', '思考', 8),
  ('a1b2c3d4-0003-4000-8000-000000000003', '09-sleepy.png', '😴', 'Sleepy', '想睡', 9),
  ('a1b2c3d4-0003-4000-8000-000000000003', '10-celebrate.png', '🎉', 'Celebrate', '慶祝', 10),
  ('a1b2c3d4-0003-4000-8000-000000000003', '11-running.png', '🏃', 'Running', '奔跑', 11),
  ('a1b2c3d4-0003-4000-8000-000000000003', '12-blushing.png', '😊', 'Blushing', '臉紅', 12),
  ('a1b2c3d4-0003-4000-8000-000000000003', '13-studying.png', '📖', 'Studying', '讀書', 13),
  ('a1b2c3d4-0003-4000-8000-000000000003', '14-waving-goodbye.png', '👋', 'Waving goodbye', '揮手道別', 14),
  ('a1b2c3d4-0003-4000-8000-000000000003', '15-eating-lunch.png', '🍱', 'Eating lunch', '吃午餐', 15),
  ('a1b2c3d4-0003-4000-8000-000000000003', '16-peace-sign.png', '✌️', 'Peace sign', '比耶', 16),
  ('a1b2c3d4-0003-4000-8000-000000000003', '17-umbrella-rain.png', '☂️', 'Umbrella in rain', '撐傘', 17),
  ('a1b2c3d4-0003-4000-8000-000000000003', '18-looking-at-phone.png', '📱', 'Looking at phone', '看手機', 18),
  ('a1b2c3d4-0003-4000-8000-000000000003', '19-stargazing.png', '⭐', 'Stargazing', '看星星', 19),
  ('a1b2c3d4-0003-4000-8000-000000000003', '20-goodnight.png', '🌙', 'Good night', '晚安', 20)
ON CONFLICT DO NOTHING;

COMMIT;
