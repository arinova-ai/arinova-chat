-- Add owner_protection column to agents table (default TRUE)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_protection BOOLEAN NOT NULL DEFAULT TRUE;
