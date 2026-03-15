-- Fix community_members.joined_at to TIMESTAMPTZ if it is not already
ALTER TABLE community_members
  ALTER COLUMN joined_at TYPE TIMESTAMPTZ
  USING joined_at AT TIME ZONE 'UTC';
