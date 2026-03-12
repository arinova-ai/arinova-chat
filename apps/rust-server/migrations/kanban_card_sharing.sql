-- Kanban card external sharing
ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE;
ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_kanban_cards_share_token ON kanban_cards(share_token) WHERE share_token IS NOT NULL;
