ALTER TABLE "user" ADD COLUMN IF NOT EXISTS quick_shortcuts JSONB DEFAULT '[]'::jsonb;
