-- Notebook restructure: Notes no longer require a conversation
-- Phase 1: Make conversation_id nullable + add conversation_notebook_preference

-- 1. Make conversation_id nullable (notes can exist without a conversation)
ALTER TABLE conversation_notes ALTER COLUMN conversation_id DROP NOT NULL;

-- 2. Conversation-level notebook preference (which notebook to show per conversation)
CREATE TABLE IF NOT EXISTS conversation_notebook_preference (
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, conversation_id)
);
