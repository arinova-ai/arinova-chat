-- Creator API Keys for CLI authentication
-- Key format: ari_cli_<random32hex>, stored as SHA-256 hash

CREATE TABLE IF NOT EXISTS creator_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    key_prefix VARCHAR(10) NOT NULL,
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_creator_api_keys_user ON creator_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_creator_api_keys_hash ON creator_api_keys(key_hash);
