-- Kanban card commits: link git commits to kanban cards
CREATE TABLE IF NOT EXISTS kanban_card_commits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id UUID NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
    commit_hash VARCHAR(40) NOT NULL,
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(card_id, commit_hash)
);

CREATE INDEX IF NOT EXISTS idx_kanban_card_commits_card_id ON kanban_card_commits(card_id);
