-- Add community_id to wiki_pages so communities can have their own wiki
ALTER TABLE wiki_pages ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_wiki_pages_community ON wiki_pages(community_id) WHERE community_id IS NOT NULL;
