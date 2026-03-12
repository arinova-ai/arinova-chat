-- Add h2h and h2a conversation types, backfill existing direct conversations
ALTER TYPE conversation_type ADD VALUE IF NOT EXISTS 'h2h';
ALTER TYPE conversation_type ADD VALUE IF NOT EXISTS 'h2a';

-- Backfill: direct + agent_id → h2a, direct + no agent → h2h
UPDATE conversations SET type = 'h2a' WHERE type = 'direct' AND agent_id IS NOT NULL;
UPDATE conversations SET type = 'h2h' WHERE type = 'direct' AND agent_id IS NULL;

-- New default
ALTER TABLE conversations ALTER COLUMN type SET DEFAULT 'h2h';
