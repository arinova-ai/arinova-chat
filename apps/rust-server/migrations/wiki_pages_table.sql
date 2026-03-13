-- Separate wiki pages from conversation_notes
CREATE TABLE IF NOT EXISTS wiki_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  owner_id TEXT NOT NULL REFERENCES "user"(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wiki_pages_conversation ON wiki_pages(conversation_id);

-- Migrate existing group conversation notes to wiki_pages
INSERT INTO wiki_pages (id, conversation_id, title, content, tags, is_pinned, owner_id, created_at, updated_at)
SELECT n.id, n.conversation_id, n.title, n.content,
       COALESCE(n.tags, '{}'),
       COALESCE(n.is_pinned, false),
       n.owner_id, n.created_at, n.updated_at
FROM conversation_notes n
JOIN conversations c ON c.id = n.conversation_id
WHERE c.type = 'group'
ON CONFLICT (id) DO NOTHING;
