-- Per-board agent access control: which agents can access a kanban board
CREATE TABLE IF NOT EXISTS board_agent_permissions (
    board_id UUID NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    granted_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (board_id, agent_id)
);
