-- Memory entry source message time range
ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS source_start TIMESTAMPTZ;
ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS source_end TIMESTAMPTZ;
