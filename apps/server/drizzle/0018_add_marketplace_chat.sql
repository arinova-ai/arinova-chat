-- 0018: Add marketplace chat tables (marketplace_conversations + marketplace_messages)

DO $$ BEGIN
  CREATE TYPE marketplace_message_role AS ENUM ('user', 'assistant');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS marketplace_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES "user"(id),
    agent_listing_id UUID NOT NULL REFERENCES agent_listings(id),
    message_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES marketplace_conversations(id) ON DELETE CASCADE,
    role marketplace_message_role NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS mkt_conv_user_idx ON marketplace_conversations(user_id);
CREATE INDEX IF NOT EXISTS mkt_conv_listing_idx ON marketplace_conversations(agent_listing_id);
CREATE INDEX IF NOT EXISTS mkt_msg_conv_idx ON marketplace_messages(conversation_id);
