-- Note external sharing
ALTER TABLE conversation_notes ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE;
ALTER TABLE conversation_notes ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_conv_notes_share_token ON conversation_notes(share_token) WHERE share_token IS NOT NULL;
