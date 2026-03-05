-- Expand conversation_type enum with new values
ALTER TYPE conversation_type ADD VALUE IF NOT EXISTS 'official';
ALTER TYPE conversation_type ADD VALUE IF NOT EXISTS 'club';
ALTER TYPE conversation_type ADD VALUE IF NOT EXISTS 'lounge';
