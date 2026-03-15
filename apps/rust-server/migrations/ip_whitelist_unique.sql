-- Add UNIQUE constraint to prevent duplicate IPs per user
ALTER TABLE user_ip_whitelist
  ADD CONSTRAINT uq_user_ip_whitelist_user_ip UNIQUE (user_id, ip_address);
