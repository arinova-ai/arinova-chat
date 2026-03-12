-- Add new listen mode enum values (cannot be in a transaction)
ALTER TYPE agent_listen_mode ADD VALUE IF NOT EXISTS 'all';
ALTER TYPE agent_listen_mode ADD VALUE IF NOT EXISTS 'owner_unmention_others_mention';
ALTER TYPE agent_listen_mode ADD VALUE IF NOT EXISTS 'owner_and_allowlist';
ALTER TYPE agent_listen_mode ADD VALUE IF NOT EXISTS 'muted';

-- Migrate existing allowed_users → owner_and_allowlist
UPDATE conversation_members SET listen_mode = 'owner_and_allowlist' WHERE listen_mode = 'allowed_users';

-- Change default for new agents joining groups
ALTER TABLE conversation_members ALTER COLUMN listen_mode SET DEFAULT 'owner_unmention_others_mention';
