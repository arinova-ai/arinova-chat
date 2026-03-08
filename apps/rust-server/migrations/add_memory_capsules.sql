-- Memory Capsule V1
-- pgvector extension already exists from schema.sql

CREATE TABLE IF NOT EXISTS memory_capsules (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id                TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name                    VARCHAR(255) NOT NULL,
    source_conversation_id  UUID REFERENCES conversations(id) ON DELETE SET NULL,
    message_count           INT NOT NULL DEFAULT 0,
    status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'extracting', 'ready', 'failed')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_capsules_owner ON memory_capsules(owner_id, created_at DESC);

-- Extracted memory entries with vector embeddings
CREATE TABLE IF NOT EXISTS memory_entries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capsule_id  UUID NOT NULL REFERENCES memory_capsules(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    embedding   vector(1536),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_entries_capsule ON memory_entries(capsule_id);

-- Grant agent access to a capsule
CREATE TABLE IF NOT EXISTS memory_capsule_grants (
    capsule_id  UUID NOT NULL REFERENCES memory_capsules(id) ON DELETE CASCADE,
    agent_id    UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    granted_by  TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (capsule_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_memory_grants_agent ON memory_capsule_grants(agent_id);

-- Daily usage tracking
CREATE TABLE IF NOT EXISTS memory_usage_daily (
    user_id        TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    date           DATE NOT NULL DEFAULT CURRENT_DATE,
    extract_count  INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, date)
);
