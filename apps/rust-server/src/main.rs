use axum::extract::DefaultBodyLimit;
use std::net::SocketAddr;
use tower_http::cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use arinova_server::{config, db, services, routes, ws, AppState};

#[tokio::main(worker_threads = 4)]
async fn main() {
    // Load .env
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    // Load config
    let config = config::Config::from_env();
    let port = config.port;

    // Initialize database pool
    let db = db::create_pool(&config.database_url).await;
    tracing::info!("PostgreSQL connected");

    // Run startup migrations (each statement individually so one failure doesn't block the rest)
    tracing::info!("Running startup migrations...");

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS pinned_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        pinned_by TEXT NOT NULL,
        pinned_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(conversation_id, message_id)
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_pinned_messages_conv ON pinned_messages(conversation_id)").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS link_previews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        url TEXT NOT NULL UNIQUE,
        title TEXT,
        description TEXT,
        image_url TEXT,
        favicon_url TEXT,
        domain TEXT,
        fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_link_previews_url ON link_previews(url)").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS message_link_previews (
        message_id UUID NOT NULL,
        preview_id UUID NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (message_id, preview_id)
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_message_link_previews_msg ON message_link_previews(message_id)").execute(&db).await.ok();

    sqlx::query("ALTER TABLE community_members ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active'").execute(&db).await.ok();
    sqlx::query("ALTER TABLE community_members ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ").execute(&db).await.ok();

    sqlx::query("ALTER TABLE IF EXISTS conversation_notes RENAME TO notes").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS notes (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL,
        creator_id      TEXT NOT NULL,
        creator_type    TEXT NOT NULL DEFAULT 'user',
        agent_id        UUID,
        title           VARCHAR(200) NOT NULL,
        content         TEXT NOT NULL DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_conv_notes_conversation ON notes(conversation_id, created_at DESC)").execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_conv_notes_creator ON notes(creator_id)").execute(&db).await.ok();

    sqlx::query("ALTER TABLE notes ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL").execute(&db).await.ok();
    sqlx::query("ALTER TABLE notes ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'").execute(&db).await.ok();

    sqlx::query("ALTER TABLE conversation_user_members ADD COLUMN IF NOT EXISTS agent_notes_enabled BOOLEAN NOT NULL DEFAULT true").execute(&db).await.ok();

    sqlx::query("ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id UUID").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS thread_summaries (
        thread_id UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
        reply_count INTEGER NOT NULL DEFAULT 0,
        last_reply_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_reply_user_id TEXT,
        last_reply_agent_id UUID,
        participant_ids TEXT[] NOT NULL DEFAULT '{}'
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_thread_summaries_last ON thread_summaries(last_reply_at DESC)").execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id) WHERE thread_id IS NOT NULL").execute(&db).await.ok();

    sqlx::query(r#"INSERT INTO thread_summaries (thread_id, reply_count, last_reply_at, participant_ids)
        SELECT
            m.thread_id,
            COUNT(*),
            MAX(m.created_at),
            ARRAY_AGG(DISTINCT COALESCE(m.sender_user_id, m.sender_agent_id::text))
                FILTER (WHERE m.sender_user_id IS NOT NULL OR m.sender_agent_id IS NOT NULL)
        FROM messages m
        WHERE m.thread_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM thread_summaries ts WHERE ts.thread_id = m.thread_id)
        GROUP BY m.thread_id
        ON CONFLICT (thread_id) DO NOTHING"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS themes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '1.0.0',
        description TEXT NOT NULL DEFAULT '',
        renderer TEXT NOT NULL DEFAULT 'pixi',
        preview TEXT NOT NULL DEFAULT 'preview.png',
        price INT NOT NULL DEFAULT 0,
        max_agents INT NOT NULL DEFAULT 1,
        tags TEXT[] NOT NULL DEFAULT '{}',
        author_id TEXT NOT NULL DEFAULT '',
        author_name TEXT NOT NULL DEFAULT '',
        license TEXT NOT NULL DEFAULT 'standard',
        published BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query(r#"INSERT INTO themes (id, name, version, description, renderer, preview, max_agents, tags, author_id, author_name, license)
        VALUES
          ('default', 'Arinova Default', '1.0.0', 'Built-in safe fallback theme — the Arinova mascot in a clean workspace', 'iframe', 'preview.png', 1, '{"default","safe","builtin"}', 'arinova-official', 'Arinova Official', 'standard'),
          ('cozy-studio-v2', 'Cozy Studio', '5.0.0', '溫馨工作室 — 你的 AI 夥伴在舒適的房間裡工作', 'iframe', 'preview.png', 1, '{"cozy","studio","room"}', 'arinova-official', 'Arinova Official', 'standard'),
          ('avg-classroom-v2', 'AVG Classroom', '1.1.0', 'Anime-style classroom with 6 agent seats — PixiJS', 'iframe', 'preview.png', 6, '{"anime","classroom","office","pixi"}', 'arinova-official', 'Arinova Official', 'standard')
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          version = EXCLUDED.version,
          description = EXCLUDED.description,
          renderer = EXCLUDED.renderer,
          preview = EXCLUDED.preview,
          max_agents = EXCLUDED.max_agents,
          tags = EXCLUDED.tags"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS theme_purchases (
        user_id TEXT NOT NULL,
        theme_id TEXT NOT NULL,
        price INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, theme_id)
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS office_slot_bindings (
        user_id TEXT NOT NULL,
        theme_id TEXT NOT NULL,
        slot_index INT NOT NULL,
        agent_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, theme_id, slot_index)
    )"#).execute(&db).await.ok();

    sqlx::query(r#"DO $$ BEGIN
        CREATE TYPE playground_category AS ENUM ('board_game', 'card_game', 'rpg', 'strategy', 'puzzle', 'trivia', 'social', 'other');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$"#).execute(&db).await.ok();

    sqlx::query(r#"DO $$ BEGIN
        CREATE TYPE session_status AS ENUM ('waiting', 'active', 'paused', 'finished', 'cancelled');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS playgrounds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        category playground_category NOT NULL DEFAULT 'other',
        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
        definition JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_public BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_playgrounds_owner ON playgrounds(owner_id)").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS playground_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        playground_id UUID NOT NULL REFERENCES playgrounds(id) ON DELETE CASCADE,
        status session_status NOT NULL DEFAULT 'waiting',
        state JSONB NOT NULL DEFAULT '{}'::jsonb,
        current_phase TEXT,
        prize_pool INT NOT NULL DEFAULT 0,
        started_at TIMESTAMP,
        finished_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_playground_sessions_pg ON playground_sessions(playground_id)").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS playground_participants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES playground_sessions(id) ON DELETE CASCADE,
        user_id TEXT,
        agent_id UUID,
        role TEXT,
        "controlMode" TEXT NOT NULL DEFAULT 'human',
        is_connected BOOLEAN NOT NULL DEFAULT true,
        joined_at TIMESTAMP NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_playground_participants_session ON playground_participants(session_id)").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS notification_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL UNIQUE,
        global_enabled BOOLEAN NOT NULL DEFAULT true,
        message_enabled BOOLEAN NOT NULL DEFAULT true,
        playground_invite_enabled BOOLEAN NOT NULL DEFAULT true,
        playground_turn_enabled BOOLEAN NOT NULL DEFAULT true,
        playground_result_enabled BOOLEAN NOT NULL DEFAULT true,
        quiet_hours_start TEXT,
        quiet_hours_end TEXT
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS voice_calls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL,
        caller_id TEXT NOT NULL,
        callee_id TEXT,
        agent_id UUID,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        started_at TIMESTAMPTZ,
        ended_at TIMESTAMPTZ,
        duration_seconds INTEGER,
        end_reason VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_voice_calls_conv ON voice_calls(conversation_id)").execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_voice_calls_caller ON voice_calls(caller_id)").execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_voice_calls_callee ON voice_calls(callee_id)").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS board_members (
        board_id UUID NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit', 'admin')),
        invited_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (board_id, user_id)
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS kanban_card_notes (
        card_id UUID NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
        note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (card_id, note_id)
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS note_links (
        source_note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        target_note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (source_note_id, target_note_id)
    )"#).execute(&db).await.ok();

    sqlx::query("ALTER TABLE notes ADD COLUMN IF NOT EXISTS summary TEXT DEFAULT NULL").execute(&db).await.ok();

    sqlx::query("ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'").execute(&db).await.ok();

    sqlx::query("ALTER TABLE memory_capsules ADD COLUMN IF NOT EXISTS note_count INTEGER NOT NULL DEFAULT 0").execute(&db).await.ok();

    sqlx::query("UPDATE memory_capsules SET status = 'failed' WHERE status = 'aborted'").execute(&db).await.ok();

    sqlx::query("ALTER TABLE memory_capsules DROP CONSTRAINT IF EXISTS memory_capsules_status_check").execute(&db).await.ok();
    sqlx::query(r#"ALTER TABLE memory_capsules ADD CONSTRAINT memory_capsules_status_check
        CHECK (status = ANY (ARRAY['pending', 'extracting', 'ready', 'failed']))"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        gemini_api_key TEXT,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query(r#"ALTER TABLE notes ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES "user"(id) ON DELETE SET NULL"#).execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_conv_notes_owner ON notes(owner_id, created_at DESC)").execute(&db).await.ok();

    sqlx::query("UPDATE notes SET owner_id = creator_id WHERE creator_type = 'user' AND owner_id IS NULL").execute(&db).await.ok();
    sqlx::query("UPDATE notes n SET owner_id = c.user_id FROM conversations c WHERE n.conversation_id = c.id AND n.creator_type = 'agent' AND n.owner_id IS NULL").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS note_conversation_links (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        note_id         UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(note_id, conversation_id)
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_note_conv_links_note ON note_conversation_links(note_id)").execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_note_conv_links_conv ON note_conversation_links(conversation_id)").execute(&db).await.ok();

    sqlx::query(r#"INSERT INTO note_conversation_links (note_id, conversation_id)
        SELECT id, conversation_id FROM notes
        ON CONFLICT (note_id, conversation_id) DO NOTHING"#).execute(&db).await.ok();

    sqlx::query("ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS source_start TIMESTAMPTZ").execute(&db).await.ok();
    sqlx::query("ALTER TABLE memory_entries ADD COLUMN IF NOT EXISTS source_end TIMESTAMPTZ").execute(&db).await.ok();

    sqlx::query("ALTER TABLE notes ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE").execute(&db).await.ok();
    sqlx::query("ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE").execute(&db).await.ok();

    sqlx::query("ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE").execute(&db).await.ok();
    sqlx::query("ALTER TABLE kanban_cards ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS conversation_user_settings (
        user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        chat_bg_url TEXT,
        pinned_buttons TEXT[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, conversation_id)
    )"#).execute(&db).await.ok();

    sqlx::query("ALTER TABLE conversation_user_settings ADD COLUMN IF NOT EXISTS pinned_buttons TEXT[]").execute(&db).await.ok();
    sqlx::query("ALTER TABLE conversation_user_settings ADD COLUMN IF NOT EXISTS kanban_board_id UUID REFERENCES kanban_boards(id) ON DELETE SET NULL").execute(&db).await.ok();
    sqlx::query("ALTER TABLE kanban_boards ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE").execute(&db).await.ok();
    sqlx::query("ALTER TABLE memory_capsules ADD COLUMN IF NOT EXISTS progress JSONB").execute(&db).await.ok();

    sqlx::query("ALTER TABLE memory_capsules ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'owner_only'").execute(&db).await.ok();
    sqlx::query("ALTER TABLE memory_capsules ADD COLUMN IF NOT EXISTS group_conversation_id UUID").execute(&db).await.ok();

    sqlx::query(r#"DO $$ BEGIN
        ALTER TYPE agent_listen_mode ADD VALUE IF NOT EXISTS 'allowlist_mentions';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS agent_capsule_access (
        agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        capsule_id UUID NOT NULL REFERENCES memory_capsules(id) ON DELETE CASCADE,
        granted_by TEXT NOT NULL,
        granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (agent_id, capsule_id)
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS notebooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        is_default BOOLEAN NOT NULL DEFAULT false,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_notebooks_owner ON notebooks(owner_id, sort_order)").execute(&db).await.ok();
    sqlx::query("CREATE UNIQUE INDEX IF NOT EXISTS idx_notebooks_owner_default ON notebooks (owner_id) WHERE is_default = true").execute(&db).await.ok();

    sqlx::query("ALTER TABLE notes ADD COLUMN IF NOT EXISTS notebook_id UUID REFERENCES notebooks(id) ON DELETE SET NULL").execute(&db).await.ok();
    sqlx::query("ALTER TABLE notes ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES notes(id) ON DELETE SET NULL").execute(&db).await.ok();
    sqlx::query("ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false").execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_conv_notes_notebook ON notes(notebook_id) WHERE notebook_id IS NOT NULL").execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_conv_notes_parent ON notes(parent_id) WHERE parent_id IS NOT NULL").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS notebook_agent_permissions (
        notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
        agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        granted_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (notebook_id, agent_id)
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS skills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        category VARCHAR(50) NOT NULL DEFAULT 'general',
        icon_url TEXT,
        version VARCHAR(20) NOT NULL DEFAULT '1.0.0',
        slash_command VARCHAR(50),
        prompt_template TEXT NOT NULL DEFAULT '',
        prompt_content TEXT NOT NULL DEFAULT '',
        parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_official BOOLEAN NOT NULL DEFAULT false,
        is_public BOOLEAN NOT NULL DEFAULT true,
        created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
        install_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category)").execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug)").execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_skills_public ON skills(is_public, category)").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS agent_skills (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        installed_by TEXT REFERENCES "user"(id) ON DELETE SET NULL,
        is_enabled BOOLEAN NOT NULL DEFAULT true,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(agent_id, skill_id)
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_agent_skills_agent ON agent_skills(agent_id)").execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_agent_skills_skill ON agent_skills(skill_id)").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS user_favorite_skills (
        user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, skill_id)
    )"#).execute(&db).await.ok();

    sqlx::query("ALTER TABLE oauth_apps ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other'").execute(&db).await.ok();
    sqlx::query("ALTER TABLE oauth_apps ADD COLUMN IF NOT EXISTS external_url TEXT").execute(&db).await.ok();
    sqlx::query("ALTER TABLE oauth_apps ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'").execute(&db).await.ok();
    sqlx::query("ALTER TABLE oauth_apps ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT TRUE").execute(&db).await.ok();
    sqlx::query("ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS code_challenge TEXT").execute(&db).await.ok();
    sqlx::query("ALTER TABLE oauth_codes ADD COLUMN IF NOT EXISTS code_challenge_method TEXT").execute(&db).await.ok();
    sqlx::query("ALTER TABLE oauth_tokens ALTER COLUMN app_id DROP NOT NULL").execute(&db).await.ok();

    sqlx::query("CREATE EXTENSION IF NOT EXISTS vector").execute(&db).await.ok();
    sqlx::query("ALTER TABLE agent_memories ADD COLUMN IF NOT EXISTS embedding vector(1536)").execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_agent_memories_embedding ON agent_memories USING hnsw (embedding vector_cosine_ops)").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS message_read_receipts (
        message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (message_id, user_id)
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_message_read_receipts_conv ON message_read_receipts (message_id)").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_email TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT,
        details JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query("ALTER TABLE agents ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT FALSE").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS content_filter_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pattern TEXT NOT NULL,
        action TEXT NOT NULL DEFAULT 'block',
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS feature_flags (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        description TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS support_tickets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        admin_reply TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS data_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        request_type TEXT NOT NULL DEFAULT 'export',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS email_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT UNIQUE NOT NULL,
        subject TEXT NOT NULL DEFAULT '',
        body_html TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS ip_blacklist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ip TEXT NOT NULL,
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query(r#"ALTER TABLE "user" ADD COLUMN IF NOT EXISTS totp_secret TEXT"#).execute(&db).await.ok();
    sqlx::query("ALTER TABLE conversations ADD COLUMN IF NOT EXISTS history_limit INTEGER NOT NULL DEFAULT 5").execute(&db).await.ok();

    sqlx::query("UPDATE notebooks SET name = 'My Notebook' WHERE name = 'My Notes' AND is_default = true").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        max_notebooks INTEGER NOT NULL DEFAULT 1,
        max_boards INTEGER NOT NULL DEFAULT 1,
        price_cents INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query(r#"INSERT INTO plans (id, name, max_notebooks, max_boards, price_cents) VALUES
        ('free', 'Free', 1, 1, 0),
        ('hobby', 'Hobby', 5, 5, 499),
        ('pro', 'Pro', -1, -1, 1499)
    ON CONFLICT (id) DO NOTHING"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS user_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL REFERENCES "user"(id),
        plan_id TEXT NOT NULL REFERENCES plans(id),
        status TEXT NOT NULL DEFAULT 'active',
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(user_id)
    )"#).execute(&db).await.ok();

    sqlx::query("ALTER TABLE board_members DROP CONSTRAINT IF EXISTS board_members_permission_check").execute(&db).await.ok();
    sqlx::query("ALTER TABLE board_members ADD CONSTRAINT board_members_permission_check CHECK (permission IN ('view', 'edit', 'admin'))").execute(&db).await.ok();
    sqlx::query(r#"ALTER TABLE "user" ADD COLUMN IF NOT EXISTS office_visits_enabled BOOLEAN NOT NULL DEFAULT FALSE"#).execute(&db).await.ok();
    sqlx::query("ALTER TABLE notes ALTER COLUMN conversation_id DROP NOT NULL").execute(&db).await.ok();
    sqlx::query(r#"ALTER TABLE "user" ADD COLUMN IF NOT EXISTS office_theme_id TEXT"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS notebook_members (
        notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit', 'admin')),
        invited_by TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (notebook_id, user_id)
    )"#).execute(&db).await.ok();

    sqlx::query("DROP TABLE IF EXISTS note_conversation_links").execute(&db).await.ok();
    sqlx::query("ALTER TABLE notes DROP COLUMN IF EXISTS conversation_id").execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS experts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        avatar_url TEXT,
        category TEXT NOT NULL DEFAULT 'general',
        price_per_ask INT NOT NULL DEFAULT 10,
        mode TEXT NOT NULL DEFAULT 'managed' CHECK (mode IN ('managed', 'webhook')),
        webhook_url TEXT,
        is_published BOOLEAN NOT NULL DEFAULT FALSE,
        free_trial_count INT NOT NULL DEFAULT 0,
        total_asks INT NOT NULL DEFAULT 0,
        total_revenue INT NOT NULL DEFAULT 0,
        avg_rating FLOAT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS expert_knowledge (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        expert_id UUID NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
        raw_content TEXT NOT NULL,
        processed_content TEXT,
        embedding vector(1536),
        chunk_index INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS expert_asks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        expert_id UUID NOT NULL REFERENCES experts(id),
        user_id TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT,
        cost INT NOT NULL,
        rating INT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )"#).execute(&db).await.ok();

    sqlx::query(r#"CREATE TABLE IF NOT EXISTS expert_examples (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        expert_id UUID NOT NULL REFERENCES experts(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        sort_order INT NOT NULL DEFAULT 0
    )"#).execute(&db).await.ok();

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_experts_owner ON experts(owner_id)").execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_experts_published ON experts(is_published)").execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_expert_knowledge_expert ON expert_knowledge(expert_id)").execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_expert_asks_expert ON expert_asks(expert_id)").execute(&db).await.ok();
    sqlx::query("CREATE INDEX IF NOT EXISTS idx_expert_asks_user ON expert_asks(user_id)").execute(&db).await.ok();

    // Community hidden users + member avatar
    sqlx::query(r#"CREATE TABLE IF NOT EXISTS community_hidden_users (
        community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        hidden_user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (community_id, user_id, hidden_user_id)
    )"#).execute(&db).await.ok();
    sqlx::query("ALTER TABLE community_members ADD COLUMN IF NOT EXISTS avatar_url TEXT").execute(&db).await.ok();

    tracing::info!("Startup migrations completed");

    // Backfill Backlog + Review columns for existing kanban boards
    let kanban_backfill = r#"
        -- Ensure unique constraint on (board_id, name) to prevent duplicates
        CREATE UNIQUE INDEX IF NOT EXISTS idx_kanban_columns_board_name
            ON kanban_columns (board_id, name);

        -- Add Backlog column to boards that don't have it
        INSERT INTO kanban_columns (board_id, name, sort_order)
        SELECT b.id, 'Backlog', 0
        FROM kanban_boards b
        WHERE NOT EXISTS (
            SELECT 1 FROM kanban_columns c WHERE c.board_id = b.id AND c.name = 'Backlog'
        )
        ON CONFLICT (board_id, name) DO NOTHING;

        -- Add Review column to boards that don't have it
        INSERT INTO kanban_columns (board_id, name, sort_order)
        SELECT b.id, 'Review', 3
        FROM kanban_boards b
        WHERE NOT EXISTS (
            SELECT 1 FROM kanban_columns c WHERE c.board_id = b.id AND c.name = 'Review'
        )
        ON CONFLICT (board_id, name) DO NOTHING;

        -- Update sort_order for existing columns
        UPDATE kanban_columns SET sort_order = 1 WHERE name = 'To Do' AND sort_order = 0;
        UPDATE kanban_columns SET sort_order = 2 WHERE name = 'In Progress' AND sort_order = 1;
        UPDATE kanban_columns SET sort_order = 4 WHERE name = 'Done' AND sort_order = 2;
    "#;
    match sqlx::raw_sql(kanban_backfill).execute(&db).await {
        Ok(_) => tracing::info!("Kanban column backfill completed"),
        Err(e) => tracing::warn!("Kanban column backfill warning: {}", e),
    }

    // Clean up stuck streaming messages from previous run
    match sqlx::query(
        r#"UPDATE messages SET status = 'error', content = CASE WHEN content = '' THEN 'Stream interrupted by server restart' ELSE content END, updated_at = NOW()
           WHERE status = 'streaming'"#,
    )
    .execute(&db)
    .await
    {
        Ok(result) => {
            if result.rows_affected() > 0 {
                tracing::info!("Cleaned up {} stuck streaming messages", result.rows_affected());
            }
        }
        Err(e) => tracing::warn!("Failed to clean up stuck streaming messages: {}", e),
    }

    // Reset stuck extracting capsules from previous run
    match sqlx::query(
        "UPDATE memory_capsules SET status = 'ready' WHERE status = 'extracting'"
    )
    .execute(&db)
    .await
    {
        Ok(result) => {
            if result.rows_affected() > 0 {
                tracing::info!("Reset {} stuck extracting capsules", result.rows_affected());
            }
        }
        Err(e) => tracing::warn!("Failed to reset stuck extracting capsules: {}", e),
    }

    // Initialize Redis pool
    let redis = db::redis::create_redis_pool(&config.redis_url);
    tracing::info!("Redis pool created");

    // Initialize S3 client for R2
    let s3 = services::r2::create_s3_client(&config);
    if s3.is_some() {
        tracing::info!("R2 storage configured");
    }

    // Create WebSocket state
    let ws_state = ws::state::WsState::new();

    // Create Office state + start periodic tick loop
    let office_state = services::office::OfficeState::new();
    {
        let office = office_state.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
            loop {
                interval.tick().await;
                office.tick();
            }
        });
    }
    tracing::info!("Office state initialized");

    // Build application state
    let state = AppState {
        db,
        redis,
        config: config.clone(),
        ws: ws_state,
        s3,
        office: office_state,
        extraction_tokens: std::sync::Arc::new(dashmap::DashMap::new()),
    };

    // Build CORS layer
    let cors_origins: Vec<String> = config.cors_origins();
    let is_wildcard = cors_origins.len() == 1 && cors_origins[0] == "*";

    let cors = if is_wildcard {
        // Mirror everything back so credentials (cookies) work with any origin
        CorsLayer::new()
            .allow_origin(AllowOrigin::mirror_request())
            .allow_methods(AllowMethods::mirror_request())
            .allow_headers(AllowHeaders::mirror_request())
            .allow_credentials(true)
    } else {
        let origins: Vec<axum::http::HeaderValue> = cors_origins
            .iter()
            .filter_map(|o| o.parse().ok())
            .collect();
        CorsLayer::new()
            .allow_origin(AllowOrigin::list(origins))
            .allow_methods(AllowMethods::mirror_request())
            .allow_headers(AllowHeaders::mirror_request())
            .allow_credentials(true)
    };

    // Build router — API routes are defined in routes/mod.rs (single source of truth)
    let app = routes::api_router()
        .merge(ws::handler::router())
        .merge(ws::agent_handler::router())
        .merge(ws::voice_handler::router())
        .with_state(state)
        .layer(DefaultBodyLimit::max(config.max_file_size))
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap_or_else(|e| panic!("Failed to bind TCP listener on {addr}: {e}"));
    axum::serve(listener, app)
        .await
        .unwrap_or_else(|e| panic!("Server error: {e}"));
}
