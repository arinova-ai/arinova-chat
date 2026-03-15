-- IP Whitelist: per-user IP allowlist for agent API/WS access
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS ip_whitelist_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS user_ip_whitelist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    ip_address TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_ip_whitelist_user_id ON user_ip_whitelist(user_id);
