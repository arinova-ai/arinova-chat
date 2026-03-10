-- Kanban boards
CREATE TABLE IF NOT EXISTS kanban_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'My Board',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kanban_boards_owner ON kanban_boards(owner_id);

-- Kanban columns
CREATE TABLE IF NOT EXISTS kanban_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kanban cards
CREATE TABLE IF NOT EXISTS kanban_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id UUID NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Card-agent assignments
CREATE TABLE IF NOT EXISTS kanban_card_agents (
  card_id UUID NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  PRIMARY KEY (card_id, agent_id)
);

-- Labels
CREATE TABLE IF NOT EXISTS kanban_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1'
);

-- Card-label junction
CREATE TABLE IF NOT EXISTS kanban_card_labels (
  card_id UUID NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES kanban_labels(id) ON DELETE CASCADE,
  PRIMARY KEY (card_id, label_id)
);
