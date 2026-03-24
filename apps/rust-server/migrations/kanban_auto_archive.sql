-- Add auto_archive_days column to kanban_boards (default 3 days, 0 = disabled)
ALTER TABLE kanban_boards
  ADD COLUMN IF NOT EXISTS auto_archive_days INTEGER NOT NULL DEFAULT 3;
