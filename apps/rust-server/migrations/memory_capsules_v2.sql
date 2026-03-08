ALTER TABLE memory_capsules ADD COLUMN IF NOT EXISTS extracted_through TIMESTAMPTZ;
ALTER TABLE memory_capsules ADD COLUMN IF NOT EXISTS entry_count INT NOT NULL DEFAULT 0;
-- Backfill existing capsules
UPDATE memory_capsules SET entry_count = (SELECT COUNT(*) FROM memory_entries WHERE capsule_id = memory_capsules.id);
