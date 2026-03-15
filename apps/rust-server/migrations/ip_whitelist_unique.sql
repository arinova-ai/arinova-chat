-- Remove duplicate IPs (keep earliest entry per user+ip)
DELETE FROM user_ip_whitelist a
USING user_ip_whitelist b
WHERE a.user_id = b.user_id
  AND a.ip_address = b.ip_address
  AND a.created_at > b.created_at;

-- Add UNIQUE constraint if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_user_ip_whitelist_user_ip'
  ) THEN
    ALTER TABLE user_ip_whitelist
      ADD CONSTRAINT uq_user_ip_whitelist_user_ip UNIQUE (user_id, ip_address);
  END IF;
END $$;
