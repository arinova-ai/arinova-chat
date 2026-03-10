-- Add archive support to kanban_cards
ALTER TABLE kanban_cards
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- Index for efficient archived card queries
CREATE INDEX IF NOT EXISTS idx_kanban_cards_archived
  ON kanban_cards (archived, column_id);
