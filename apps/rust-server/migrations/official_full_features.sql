-- Official Account Full Features: Dashboard, Broadcast, Auto-reply, Knowledge Base, Subscriber Tags

-- Extend accounts table for official-specific settings
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS category VARCHAR(50),
  ADD COLUMN IF NOT EXISTS welcome_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS welcome_message TEXT,
  ADD COLUMN IF NOT EXISTS auto_reply_mode VARCHAR(20) DEFAULT 'none'
    CHECK (auto_reply_mode IN ('none', 'ai', 'webhook')),
  ADD COLUMN IF NOT EXISTS auto_reply_system_prompt TEXT,
  ADD COLUMN IF NOT EXISTS auto_reply_webhook_url TEXT;

-- Broadcast system
CREATE TABLE IF NOT EXISTS official_broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sent', 'failed')),
    target_filter JSONB DEFAULT '{}',
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    total_recipients INTEGER DEFAULT 0,
    delivered_count INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_official_broadcasts_account ON official_broadcasts(account_id, created_at DESC);

-- Subscriber tags
CREATE TABLE IF NOT EXISTS official_subscriber_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(20) DEFAULT 'gray',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, name)
);

CREATE TABLE IF NOT EXISTS official_subscriber_tag_assignments (
    subscriber_id UUID NOT NULL REFERENCES account_subscribers(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES official_subscriber_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (subscriber_id, tag_id)
);

-- Knowledge base for official accounts
CREATE TABLE IF NOT EXISTS official_knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('file', 'faq', 'url')),
    title VARCHAR(255) NOT NULL,
    content TEXT,
    file_url TEXT,
    source_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
    chunk_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_official_kb_account ON official_knowledge_base(account_id);

-- Knowledge embeddings (pgvector)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS official_knowledge_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_id UUID NOT NULL REFERENCES official_knowledge_base(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    embedding vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_official_kb_embeddings_account ON official_knowledge_embeddings(account_id);
CREATE INDEX IF NOT EXISTS idx_official_kb_embeddings_knowledge ON official_knowledge_embeddings(knowledge_id);

-- Add blocked_at to account_subscribers for block feature
ALTER TABLE account_subscribers
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
