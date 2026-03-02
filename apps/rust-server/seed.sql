-- Seed: Demo data
-- This file is intentionally empty after the marketplace OpenRouter migration.
-- Agent listings and reviews are no longer seeded as demo data.

-- OAuth Apps
INSERT INTO oauth_apps (client_id, client_secret, name, redirect_uri, description)
VALUES (
  'who-is-killer',
  'wik-secret-v1',
  'Who Is Killer?',
  'https://who-is-killer-cyan.vercel.app/callback',
  'AI Mystery Game — 3 detectives find the killer'
) ON CONFLICT (client_id) DO NOTHING;

-- Arinova Official Account
INSERT INTO "user" (id, name, email, email_verified, username, is_verified, created_at, updated_at)
VALUES ('arinova-official', 'Arinova', 'official@arinova.ai', TRUE, 'arinova', TRUE, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET is_verified = TRUE, name = 'Arinova', username = 'arinova';
