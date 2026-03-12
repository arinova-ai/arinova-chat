-- Note User-Level Ownership + Conversation Linking (Phase 1)

-- 1. Add owner_id to conversation_notes
ALTER TABLE conversation_notes ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conv_notes_owner ON conversation_notes(owner_id, created_at DESC);

-- 2. Backfill owner_id from existing data
-- User-created notes: owner_id = creator_id
UPDATE conversation_notes
SET owner_id = creator_id
WHERE creator_type = 'user' AND owner_id IS NULL;

-- Agent-created notes: owner_id = conversation's user (owner)
UPDATE conversation_notes n
SET owner_id = c.user_id
FROM conversations c
WHERE n.conversation_id = c.id
  AND n.creator_type = 'agent'
  AND n.owner_id IS NULL;

-- 3. Create note_conversation_links table
CREATE TABLE IF NOT EXISTS note_conversation_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id         UUID NOT NULL REFERENCES conversation_notes(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(note_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_note_conv_links_note ON note_conversation_links(note_id);
CREATE INDEX IF NOT EXISTS idx_note_conv_links_conv ON note_conversation_links(conversation_id);

-- 4. Backfill: create links for all existing notes (note_id + conversation_id)
INSERT INTO note_conversation_links (note_id, conversation_id)
SELECT id, conversation_id FROM conversation_notes
ON CONFLICT (note_id, conversation_id) DO NOTHING;
