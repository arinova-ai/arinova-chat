-- Conversation Notes (Notebook Phase 1)
CREATE TABLE IF NOT EXISTS conversation_notes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    creator_id      TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    creator_type    TEXT NOT NULL DEFAULT 'user' CHECK (creator_type IN ('user', 'agent')),
    agent_id        UUID REFERENCES agents(id) ON DELETE SET NULL,
    title           VARCHAR(200) NOT NULL,
    content         TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conv_notes_conversation ON conversation_notes(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_notes_creator ON conversation_notes(creator_id);

-- Per-user toggle for agent note access
ALTER TABLE conversation_user_members ADD COLUMN IF NOT EXISTS agent_notes_enabled BOOLEAN NOT NULL DEFAULT true;
