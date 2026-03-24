-- Add archived column to kanban_boards (for board archive/unarchive support)
ALTER TABLE kanban_boards
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_kanban_boards_archived
  ON kanban_boards (owner_id, archived);
