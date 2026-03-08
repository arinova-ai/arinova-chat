-- Activity logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  activity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_owner_time ON activity_logs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_agent ON activity_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_logs(activity_type);

-- Agent usage hourly aggregates
CREATE TABLE IF NOT EXISTS agent_usage_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  model TEXT,
  hour TIMESTAMPTZ NOT NULL,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cache_read_tokens BIGINT NOT NULL DEFAULT 0,
  cache_write_tokens BIGINT NOT NULL DEFAULT 0,
  request_count INT NOT NULL DEFAULT 0,
  session_duration_ms BIGINT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10,6) DEFAULT 0,
  UNIQUE(owner_id, agent_id, model, hour)
);
CREATE INDEX IF NOT EXISTS idx_usage_owner_hour ON agent_usage_hourly(owner_id, hour DESC);

-- Model pricing reference
CREATE TABLE IF NOT EXISTS model_pricing (
  model TEXT PRIMARY KEY,
  input_per_mtok NUMERIC(10,4) NOT NULL,
  output_per_mtok NUMERIC(10,4) NOT NULL,
  cache_read_per_mtok NUMERIC(10,4) DEFAULT 0,
  cache_write_per_mtok NUMERIC(10,4) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO model_pricing (model, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok)
VALUES
  ('claude-opus-4-6', 15.0, 75.0, 1.5, 18.75),
  ('claude-sonnet-4-6', 3.0, 15.0, 0.3, 3.75),
  ('claude-haiku-4-5-20251001', 0.8, 4.0, 0.08, 1.0),
  ('gemini-2.0-flash', 0.1, 0.4, 0.025, 0.1),
  ('gpt-4o', 2.5, 10.0, 1.25, 2.5)
ON CONFLICT (model) DO NOTHING;
