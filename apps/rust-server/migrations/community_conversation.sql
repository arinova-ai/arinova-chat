ALTER TABLE communities ADD COLUMN conversation_id UUID REFERENCES conversations(id);
