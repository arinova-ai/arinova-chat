-- Expand conversation_type enum with new values
ALTER TYPE conversation_type ADD VALUE IF NOT EXISTS 'official';
ALTER TYPE conversation_type ADD VALUE IF NOT EXISTS 'club';
ALTER TYPE conversation_type ADD VALUE IF NOT EXISTS 'lounge';

-- Backfill existing official conversations from 'direct' to 'official'
UPDATE conversations SET type = 'official'
WHERE id IN (SELECT conversation_id FROM official_conversations)
AND type = 'direct';
