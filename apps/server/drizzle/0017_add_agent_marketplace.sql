-- 0017: Add Agent Marketplace tables (agent_listings + agent_reviews)

DO $$ BEGIN
  CREATE TYPE agent_listing_status AS ENUM ('draft', 'pending_review', 'active', 'suspended', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS agent_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id TEXT NOT NULL REFERENCES "user"(id),
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    avatar_url TEXT,
    category VARCHAR(50) NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]',
    system_prompt TEXT NOT NULL,
    welcome_message TEXT,
    example_conversations JSONB DEFAULT '[]',
    model_provider VARCHAR(50) NOT NULL,
    model_id VARCHAR(100) NOT NULL,
    encrypted_api_key TEXT NOT NULL,
    price_per_message INTEGER NOT NULL DEFAULT 1,
    free_trial_messages INTEGER NOT NULL DEFAULT 3,
    status agent_listing_status NOT NULL DEFAULT 'draft',
    total_conversations INTEGER NOT NULL DEFAULT 0,
    total_messages INTEGER NOT NULL DEFAULT 0,
    total_revenue INTEGER NOT NULL DEFAULT 0,
    avg_rating REAL,
    review_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_listing_id UUID NOT NULL REFERENCES agent_listings(id),
    user_id TEXT NOT NULL REFERENCES "user"(id),
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(agent_listing_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_listings_creator ON agent_listings(creator_id);
CREATE INDEX IF NOT EXISTS idx_agent_listings_status ON agent_listings(status);
CREATE INDEX IF NOT EXISTS idx_agent_listings_category ON agent_listings(category);
CREATE INDEX IF NOT EXISTS idx_agent_reviews_listing ON agent_reviews(agent_listing_id);
