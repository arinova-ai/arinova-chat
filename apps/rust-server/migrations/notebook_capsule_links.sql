-- Per-notebook capsule selection: which memory capsules a notebook's notes feed into
CREATE TABLE IF NOT EXISTS notebook_capsule_links (
    notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    capsule_id UUID NOT NULL REFERENCES memory_capsules(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (notebook_id, capsule_id)
);
