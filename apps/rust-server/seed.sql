-- Seed: Demo data
-- This file is intentionally empty after the marketplace OpenRouter migration.
-- Agent listings and reviews are no longer seeded as demo data.

-- OAuth Apps
INSERT INTO oauth_apps (client_id, client_secret, name, redirect_uri, description)
VALUES (
  'who-is-killer',
  'wik-secret-v1',
  'Who Is Killer?',
  'http://192.168.68.83:21010/callback',
  'AI Mystery Game — 3 detectives find the killer'
) ON CONFLICT (client_id) DO NOTHING;
