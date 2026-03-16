-- Add include_in_capsule toggle to notebooks
-- Controls whether notes in this notebook are included in memory capsule extraction
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS include_in_capsule BOOLEAN NOT NULL DEFAULT true;
