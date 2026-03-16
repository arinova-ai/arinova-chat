-- Per-conversation board preference (which kanban board to show per conversation per user)
CREATE TABLE IF NOT EXISTS conversation_board_preference (
    user_id TEXT NOT NULL,
    conversation_id UUID NOT NULL,
    board_id UUID NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, conversation_id)
);
