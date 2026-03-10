-- Add callee_id for human-to-human voice calls
ALTER TABLE voice_calls
  ADD COLUMN IF NOT EXISTS callee_id TEXT;

CREATE INDEX IF NOT EXISTS idx_voice_calls_callee ON voice_calls(callee_id);
