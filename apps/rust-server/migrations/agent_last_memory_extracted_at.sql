-- Track when memories were last auto-extracted for each agent
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_memory_extracted_at TIMESTAMPTZ;
