-- Rename conversation_type enum value 'club' → 'community'
ALTER TYPE conversation_type RENAME VALUE 'club' TO 'community';

-- Update communities table type CHECK constraint
ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_type_check;
ALTER TABLE communities ADD CONSTRAINT communities_type_check CHECK (type IN ('official', 'community', 'lounge'));

-- Update existing data
UPDATE communities SET type = 'community' WHERE type = 'club';
