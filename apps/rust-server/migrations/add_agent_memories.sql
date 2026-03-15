-- Self-improving agent memory system
CREATE TABLE IF NOT EXISTS agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  category TEXT NOT NULL,           -- correction | preference | knowledge | error
  tier TEXT NOT NULL DEFAULT 'hot', -- hot | warm | cold
  summary TEXT NOT NULL,
  detail TEXT,
  pattern_key TEXT,
  hit_count INT NOT NULL DEFAULT 1,
  source_conversation_id UUID,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agent_id, pattern_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_tier ON agent_memories(agent_id, tier);
CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_category ON agent_memories(agent_id, category);
