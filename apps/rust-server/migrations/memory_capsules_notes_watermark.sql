-- Add watermark for incremental notes extraction
ALTER TABLE memory_capsules ADD COLUMN IF NOT EXISTS notes_extracted_through TIMESTAMPTZ;
