-- Per-notebook agent access control: which agents can access a notebook's notes
CREATE TABLE IF NOT EXISTS notebook_agent_permissions (
    notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    granted_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (notebook_id, agent_id)
);
