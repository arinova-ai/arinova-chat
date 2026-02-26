-- Arinova Chat - Full Database Schema
-- Includes multi-user social features (username, friends, group admin, agent permissions, blocking)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- ===== Enum Types =====

CREATE TYPE conversation_type AS ENUM ('direct', 'group');
CREATE TYPE message_role AS ENUM ('user', 'agent', 'assistant', 'system');
CREATE TYPE message_status AS ENUM ('pending', 'streaming', 'completed', 'cancelled', 'error');
CREATE TYPE community_role AS ENUM ('owner', 'admin', 'member', 'creator', 'moderator');
CREATE TYPE friendship_status AS ENUM ('pending', 'accepted', 'blocked');
CREATE TYPE conversation_user_role AS ENUM ('admin', 'vice_admin', 'member');
CREATE TYPE agent_listen_mode AS ENUM ('owner_only', 'allowed_users', 'all_mentions');

-- App/Marketplace enums
CREATE TYPE app_status AS ENUM ('draft', 'submitted', 'scanning', 'in_review', 'published', 'rejected', 'suspended');
CREATE TYPE app_version_status AS ENUM ('submitted', 'scanning', 'in_review', 'published', 'rejected');
CREATE TYPE coin_transaction_type AS ENUM ('topup', 'purchase', 'refund', 'payout', 'earning', 'kb_upload', 'community_join', 'community_subscription', 'community_agent_call');
CREATE TYPE purchase_status AS ENUM ('completed', 'refunded');

-- Playground enums
CREATE TYPE playground_category AS ENUM ('game', 'strategy', 'social', 'puzzle', 'roleplay', 'other');
CREATE TYPE playground_control_mode AS ENUM ('agent', 'human', 'copilot');
CREATE TYPE playground_currency AS ENUM ('free', 'play', 'arinova');
CREATE TYPE playground_message_type AS ENUM ('chat', 'action', 'system', 'phase_transition');
CREATE TYPE playground_session_status AS ENUM ('waiting', 'active', 'paused', 'finished');
CREATE TYPE playground_transaction_type AS ENUM ('entry_fee', 'bet', 'win', 'refund', 'commission');

-- ===== Auth Tables (Better Auth compatible) =====

CREATE TABLE "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    image TEXT,
    username VARCHAR(32) UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_user_username_lower ON "user" (LOWER(username));

CREATE TABLE session (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE account (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    access_token_expires_at TIMESTAMP,
    refresh_token_expires_at TIMESTAMP,
    scope TEXT,
    id_token TEXT,
    password TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE verification (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ===== Business Tables =====

CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    avatar_url TEXT,
    a2a_endpoint TEXT,
    owner_id TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    category VARCHAR(50),
    usage_count INTEGER NOT NULL DEFAULT 0,
    system_prompt TEXT,
    welcome_message TEXT,
    quick_replies JSONB,
    notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    secret_token VARCHAR(64) UNIQUE,
    voice_capable BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200),
    user_id TEXT NOT NULL,
    agent_id UUID,
    pinned_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    type conversation_type NOT NULL DEFAULT 'direct',
    mention_only BOOLEAN NOT NULL DEFAULT TRUE
);

-- Agent members in conversations (existing, extended with owner_user_id and listen_mode)
CREATE TABLE conversation_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    owner_user_id TEXT REFERENCES "user"(id),
    listen_mode agent_listen_mode NOT NULL DEFAULT 'owner_only',
    added_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- User members in conversations (NEW for multi-user)
CREATE TABLE conversation_user_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    role conversation_user_role NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    hidden_at TIMESTAMP,
    UNIQUE(conversation_id, user_id)
);

-- Agent listen mode whitelist (NEW)
CREATE TABLE agent_listen_allowed_users (
    agent_id UUID NOT NULL,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    PRIMARY KEY (agent_id, conversation_id, user_id)
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role message_role NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    status message_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    seq INTEGER NOT NULL,
    sender_agent_id UUID,
    sender_user_id TEXT,
    reply_to_id UUID,
    thread_id UUID
);

CREATE TABLE thread_summaries (
    thread_id UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    reply_count INTEGER NOT NULL DEFAULT 0,
    last_reply_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_reply_user_id TEXT,
    last_reply_agent_id UUID,
    participant_ids TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE thread_reads (
    user_id TEXT NOT NULL,
    thread_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    last_read_seq INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, thread_id)
);

CREATE TABLE conversation_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    conversation_id UUID NOT NULL,
    last_read_seq INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    muted BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(user_id, conversation_id)
);

CREATE TABLE message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    emoji VARCHAR(32) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ===== Friendships (NEW) =====

CREATE TABLE friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id TEXT NOT NULL REFERENCES "user"(id),
    addressee_id TEXT NOT NULL REFERENCES "user"(id),
    status friendship_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(requester_id, addressee_id)
);

CREATE INDEX idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX idx_friendships_status ON friendships(status);

-- ===== Group Settings (NEW) =====

CREATE TABLE group_settings (
    conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
    history_visible BOOLEAN NOT NULL DEFAULT FALSE,
    max_users INTEGER NOT NULL DEFAULT 50,
    max_agents INTEGER NOT NULL DEFAULT 10,
    invite_link VARCHAR(32) UNIQUE,
    invite_enabled BOOLEAN NOT NULL DEFAULT TRUE
);

-- ===== Push Notification Tables =====

CREATE TABLE push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    device_info TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,
    global_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    message_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    playground_invite_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    playground_turn_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    playground_result_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    quiet_hours_start VARCHAR(5),
    quiet_hours_end VARCHAR(5)
);

-- ===== Community Tables (Lounge + Hub) =====

CREATE TABLE communities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id TEXT NOT NULL REFERENCES "user"(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type TEXT NOT NULL DEFAULT 'lounge' CHECK (type IN ('lounge', 'hub')),
    -- Pricing (credits)
    join_fee INTEGER NOT NULL DEFAULT 0,
    monthly_fee INTEGER NOT NULL DEFAULT 0,
    agent_call_fee INTEGER NOT NULL DEFAULT 0,
    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
    member_count INTEGER NOT NULL DEFAULT 0,
    -- Metadata
    avatar_url TEXT,
    cover_image_url TEXT,
    category TEXT,
    tags TEXT[],
    tts_voice TEXT DEFAULT 'alloy',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE community_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES "user"(id),
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('creator', 'moderator', 'member')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Subscription
    subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'expired', 'cancelled')),
    subscription_expires_at TIMESTAMPTZ,
    UNIQUE(community_id, user_id)
);

CREATE TABLE community_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES agent_listings(id),
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(community_id, listing_id)
);

CREATE TABLE community_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id TEXT,
    agent_listing_id UUID REFERENCES agent_listings(id),
    content TEXT NOT NULL,
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'system')),
    tts_audio_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_community_messages_community ON community_messages(community_id, created_at);
CREATE INDEX idx_community_members_community ON community_members(community_id);
CREATE INDEX idx_community_members_user ON community_members(user_id);
CREATE INDEX idx_community_agents_community ON community_agents(community_id);

-- ===== Agent Marketplace Tables =====

CREATE TYPE agent_listing_status AS ENUM ('draft', 'pending_review', 'active', 'suspended', 'archived');

CREATE TABLE agent_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id TEXT NOT NULL,
    agent_name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    avatar_url TEXT,
    system_prompt TEXT NOT NULL,
    welcome_message TEXT,
    model TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
    input_char_limit INTEGER NOT NULL DEFAULT 2000,
    price INTEGER NOT NULL DEFAULT 0,
    price_per_message INTEGER NOT NULL DEFAULT 1,
    free_trial_messages INTEGER NOT NULL DEFAULT 3,
    status agent_listing_status NOT NULL DEFAULT 'draft',
    sales_count INTEGER NOT NULL DEFAULT 0,
    avg_rating NUMERIC(3,2),
    review_count INTEGER NOT NULL DEFAULT 0,
    total_messages INTEGER NOT NULL DEFAULT 0,
    total_revenue INTEGER NOT NULL DEFAULT 0,
    example_conversations JSONB NOT NULL DEFAULT '[]',
    tts_voice TEXT DEFAULT 'alloy',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);


CREATE TABLE agent_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES agent_listings(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(listing_id, user_id)
);

CREATE TABLE marketplace_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES agent_listings(id),
    user_id TEXT NOT NULL,
    title VARCHAR(200),
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE marketplace_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES marketplace_conversations(id) ON DELETE CASCADE,
    role message_role NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    tts_audio_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ===== App Marketplace Tables =====

CREATE TABLE developer_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    payout_info TEXT,
    terms_accepted_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id TEXT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    status app_status NOT NULL DEFAULT 'draft',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    external_url TEXT NOT NULL,
    icon_url TEXT
);

CREATE TABLE app_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    manifest_json JSONB NOT NULL,
    package_path TEXT NOT NULL,
    status app_version_status NOT NULL DEFAULT 'submitted',
    review_notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE coin_balances (
    user_id TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE coin_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    type coin_transaction_type NOT NULL,
    amount INTEGER NOT NULL,
    related_app_id UUID,
    related_product_id VARCHAR(100),
    receipt_id VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE app_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    app_version_id UUID NOT NULL REFERENCES app_versions(id),
    product_id VARCHAR(100) NOT NULL,
    amount INTEGER NOT NULL,
    status purchase_status NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE agent_api_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL,
    user_id TEXT NOT NULL,
    agent_id UUID NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE app_oauth_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
    client_id VARCHAR(100) NOT NULL UNIQUE,
    client_secret TEXT NOT NULL,
    redirect_uris JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE oauth_access_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token VARCHAR(128) NOT NULL UNIQUE,
    client_id VARCHAR(100) NOT NULL,
    user_id TEXT NOT NULL,
    app_id UUID NOT NULL,
    scope TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE oauth_authorization_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(128) NOT NULL UNIQUE,
    client_id VARCHAR(100) NOT NULL,
    user_id TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    scope TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ===== Playground Tables =====

CREATE TABLE playgrounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id TEXT NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    category playground_category NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]',
    definition JSONB NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE playground_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playground_id UUID NOT NULL REFERENCES playgrounds(id) ON DELETE CASCADE,
    status playground_session_status NOT NULL DEFAULT 'waiting',
    state JSONB NOT NULL DEFAULT '{}',
    current_phase VARCHAR(100),
    prize_pool INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP,
    finished_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE playground_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES playground_sessions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    agent_id UUID,
    role VARCHAR(100),
    "controlMode" playground_control_mode NOT NULL DEFAULT 'human',
    is_connected BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE playground_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES playground_sessions(id) ON DELETE CASCADE,
    participant_id UUID,
    type playground_message_type NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE play_coin_balances (
    user_id TEXT PRIMARY KEY,
    balance INTEGER NOT NULL DEFAULT 0,
    last_granted_at TIMESTAMP
);

CREATE TABLE playground_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    session_id UUID,
    type playground_transaction_type NOT NULL,
    currency playground_currency NOT NULL,
    amount INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ===== Indexes =====

CREATE INDEX idx_messages_conversation_seq ON messages(conversation_id, seq);
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_conversation_reads_user_conv ON conversation_reads(user_id, conversation_id);
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_conversation_user_members_conv ON conversation_user_members(conversation_id);
CREATE INDEX idx_conversation_user_members_user ON conversation_user_members(user_id);
CREATE INDEX idx_conversation_members_conv ON conversation_members(conversation_id);
CREATE INDEX idx_agent_listings_creator ON agent_listings(creator_id);
CREATE INDEX idx_agent_listings_status ON agent_listings(status);
CREATE INDEX idx_agent_reviews_listing ON agent_reviews(listing_id);
CREATE INDEX idx_marketplace_conversations_user ON marketplace_conversations(user_id);
CREATE INDEX idx_marketplace_conversations_listing ON marketplace_conversations(listing_id);
CREATE INDEX idx_marketplace_messages_conv ON marketplace_messages(conversation_id, created_at);

-- ===== Knowledge Base Tables (RAG) =====

CREATE TABLE agent_knowledge_bases (
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
    raw_content TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE knowledge_base_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kb_id UUID NOT NULL REFERENCES agent_knowledge_bases(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    embedding vector(1536),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kb_listing ON agent_knowledge_bases(listing_id);
CREATE INDEX idx_kb_creator ON agent_knowledge_bases(creator_id);
CREATE INDEX idx_kb_chunks_kb_id ON knowledge_base_chunks(kb_id);
CREATE INDEX idx_kb_chunks_embedding ON knowledge_base_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
