-- Migration: Add Accounts System
-- Accounts are a SEPARATE abstraction from communities.
-- They represent user-owned accounts (Official or Lounge type)
-- that can act as identities in the chat system.

-- ============================================================
-- Phase 1: accounts table
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('official', 'lounge')),
  name VARCHAR(100) NOT NULL,
  avatar TEXT,
  bio TEXT,
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_owner_type ON accounts(owner_id, type);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);

-- ============================================================
-- Phase 2: proxy user + subscribers
-- ============================================================
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS proxy_user_id TEXT REFERENCES "user"(id);

CREATE TABLE IF NOT EXISTS account_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_account_subs_account ON account_subscribers(account_id);
CREATE INDEX IF NOT EXISTS idx_account_subs_user ON account_subscribers(user_id);

-- ============================================================
-- Phase 3: AI agent settings on accounts
-- ============================================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS ai_mode VARCHAR(20) DEFAULT 'none' CHECK (ai_mode IN ('none', 'auto_reply', 'stateless')),
  ADD COLUMN IF NOT EXISTS system_prompt TEXT,
  ADD COLUMN IF NOT EXISTS api_key TEXT,
  ADD COLUMN IF NOT EXISTS model VARCHAR(100),
  ADD COLUMN IF NOT EXISTS context_window INTEGER DEFAULT 4096;

-- ============================================================
-- Phase 5: Lounge voice fields
-- ============================================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS voice_sample_url TEXT,
  ADD COLUMN IF NOT EXISTS voice_clone_id TEXT;

-- ============================================================
-- Phase 7: gifts table
-- ============================================================
CREATE TABLE IF NOT EXISTS gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  to_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  gift_type VARCHAR(50) NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gifts_from ON gifts(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gifts_to ON gifts(to_account_id, created_at DESC);
