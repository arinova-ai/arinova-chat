-- Lounge Account Full Features: Persona, Diary, Preview, Gifts, Tokens, Fan Levels

-- Extend accounts table for lounge-specific persona fields
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS persona_catchphrase TEXT,
  ADD COLUMN IF NOT EXISTS persona_tone TEXT,
  ADD COLUMN IF NOT EXISTS persona_personality TEXT,
  ADD COLUMN IF NOT EXISTS persona_template VARCHAR(50),
  ADD COLUMN IF NOT EXISTS persona_age INTEGER,
  ADD COLUMN IF NOT EXISTS persona_interests TEXT,
  ADD COLUMN IF NOT EXISTS persona_backstory TEXT,
  ADD COLUMN IF NOT EXISTS persona_intro TEXT,
  ADD COLUMN IF NOT EXISTS persona_forbidden_topics TEXT,
  ADD COLUMN IF NOT EXISTS pricing_mode VARCHAR(20) DEFAULT 'free'
    CHECK (pricing_mode IN ('free', 'subscription', 'per_message')),
  ADD COLUMN IF NOT EXISTS pricing_amount INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS free_trial_messages INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS voice_model_status VARCHAR(20) DEFAULT 'none'
    CHECK (voice_model_status IN ('none', 'processing', 'ready', 'failed'));

-- Lounge Diaries
CREATE TABLE IF NOT EXISTS lounge_diaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    content TEXT NOT NULL,
    image_url TEXT,
    is_important BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lounge_diaries_account_date ON lounge_diaries(account_id, date DESC);

-- Diary embeddings for RAG
CREATE TABLE IF NOT EXISTS lounge_diary_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diary_id UUID NOT NULL REFERENCES lounge_diaries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    chunk_text TEXT NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    embedding vector(1536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lounge_diary_embeddings_account ON lounge_diary_embeddings(account_id);
CREATE INDEX IF NOT EXISTS idx_lounge_diary_embeddings_diary ON lounge_diary_embeddings(diary_id);

-- Fan levels
CREATE TABLE IF NOT EXISTS lounge_fan_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    level INTEGER NOT NULL DEFAULT 1,
    total_spent INTEGER NOT NULL DEFAULT 0,
    total_messages INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(account_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_lounge_fan_levels_account ON lounge_fan_levels(account_id, level DESC);

-- Voice samples (multiple per account)
CREATE TABLE IF NOT EXISTS lounge_voice_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    duration_seconds INTEGER,
    status VARCHAR(20) NOT NULL DEFAULT 'uploaded'
      CHECK (status IN ('uploaded', 'processing', 'ready', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lounge_voice_samples_account ON lounge_voice_samples(account_id);

-- Gift catalog (platform-wide)
CREATE TABLE IF NOT EXISTS gift_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50) NOT NULL,
    price INTEGER NOT NULL,
    category VARCHAR(50) DEFAULT 'basic',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Gift transactions (detailed records)
CREATE TABLE IF NOT EXISTS gift_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    to_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    gift_id UUID NOT NULL REFERENCES gift_catalog(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    total_price INTEGER NOT NULL,
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gift_transactions_from ON gift_transactions(from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_transactions_to ON gift_transactions(to_account_id, created_at DESC);

-- User token balance
CREATE TABLE IF NOT EXISTS user_token_balance (
    user_id TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Token transactions (topup, spend, withdraw)
CREATE TABLE IF NOT EXISTS token_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('topup', 'spend', 'gift_received', 'withdraw', 'refund')),
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    related_gift_id UUID REFERENCES gift_transactions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_transactions_user ON token_transactions(user_id, created_at DESC);

-- Preview conversations (simulation, separate from fan conversations)
CREATE TABLE IF NOT EXISTS lounge_preview_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lounge_preview_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES lounge_preview_conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lounge_preview_messages_conv ON lounge_preview_messages(conversation_id, created_at);

-- Seed gift catalog
INSERT INTO gift_catalog (name, icon, price, category, sort_order) VALUES
  ('Heart', 'heart', 10, 'basic', 1),
  ('Star', 'star', 50, 'basic', 2),
  ('Gem', 'gem', 100, 'premium', 3),
  ('Sparkle', 'sparkle', 200, 'premium', 4),
  ('Crown', 'crown', 500, 'luxury', 5),
  ('Flame', 'flame', 1000, 'luxury', 6)
ON CONFLICT DO NOTHING;
