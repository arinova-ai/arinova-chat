-- Notebooks for hierarchical note organization
CREATE TABLE IF NOT EXISTS notebooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT false,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notebooks_owner ON notebooks(owner_id, sort_order);

-- Add notebook_id, parent_id, is_pinned to conversation_notes
ALTER TABLE conversation_notes ADD COLUMN IF NOT EXISTS notebook_id UUID REFERENCES notebooks(id) ON DELETE SET NULL;
ALTER TABLE conversation_notes ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES conversation_notes(id) ON DELETE SET NULL;
ALTER TABLE conversation_notes ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_conv_notes_notebook ON conversation_notes(notebook_id) WHERE notebook_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conv_notes_parent ON conversation_notes(parent_id) WHERE parent_id IS NOT NULL;
