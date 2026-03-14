-- Rename conversation_type enum value 'club' → 'community' (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'club'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'conversation_type')
  ) THEN
    ALTER TYPE conversation_type RENAME VALUE 'club' TO 'community';
  END IF;
END
$$;

-- Update communities table type CHECK constraint
ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_type_check;
ALTER TABLE communities ADD CONSTRAINT communities_type_check CHECK (type IN ('official', 'community', 'lounge'));

-- Update existing data
UPDATE communities SET type = 'community' WHERE type = 'club';
