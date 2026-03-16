-- Per-conversation watermark for agent memory auto-extraction
CREATE TABLE IF NOT EXISTS agent_memory_watermarks (
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    last_extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (agent_id, conversation_id)
);
