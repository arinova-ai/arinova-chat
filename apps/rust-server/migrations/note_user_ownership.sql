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

-- 3. Drop note_conversation_links table (no longer needed — use notes.conversation_id directly)
DROP TABLE IF EXISTS note_conversation_links;
