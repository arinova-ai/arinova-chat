-- Allow wiki_pages without conversation_id (community wikis only have community_id)
ALTER TABLE wiki_pages ALTER COLUMN conversation_id DROP NOT NULL;

-- Ensure at least one owner reference is set
ALTER TABLE wiki_pages ADD CONSTRAINT wiki_pages_owner_check
  CHECK (conversation_id IS NOT NULL OR community_id IS NOT NULL);
