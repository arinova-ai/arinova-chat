-- Agent security logs for tracking unauthorized access attempts
CREATE TABLE IF NOT EXISTS agent_security_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_security_logs_agent_id ON agent_security_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_security_logs_created_at ON agent_security_logs(created_at);

-- Add token_refreshed_at column to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS token_refreshed_at TIMESTAMP;
