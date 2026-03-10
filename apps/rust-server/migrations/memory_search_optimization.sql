-- Full-text search index for hybrid search
ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX IF NOT EXISTS idx_memory_entries_search ON memory_entries USING gin(search_vector);

-- Importance weight column
ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS importance FLOAT NOT NULL DEFAULT 0.5;

-- Timestamp index for time-decay sorting
CREATE INDEX IF NOT EXISTS idx_memory_entries_created ON memory_entries(created_at DESC);
