use axum::extract::DefaultBodyLimit;
use axum::Router;
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

    // Ensure required tables/columns exist (idempotent startup migration)
    let startup_migration = r#"
        CREATE TABLE IF NOT EXISTS pinned_messages (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            pinned_by TEXT NOT NULL,
            pinned_at TIMESTAMP NOT NULL DEFAULT NOW(),
            UNIQUE(conversation_id, message_id)
        );
        CREATE INDEX IF NOT EXISTS idx_pinned_messages_conv ON pinned_messages(conversation_id);

        CREATE TABLE IF NOT EXISTS link_previews (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            url TEXT NOT NULL UNIQUE,
            title TEXT,
            description TEXT,
            image_url TEXT,
            favicon_url TEXT,
            domain TEXT,
            fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_link_previews_url ON link_previews(url);

        CREATE TABLE IF NOT EXISTS message_link_previews (
            message_id UUID NOT NULL,
            preview_id UUID NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (message_id, preview_id)
        );
        CREATE INDEX IF NOT EXISTS idx_message_link_previews_msg ON message_link_previews(message_id);

        ALTER TABLE community_members ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
        ALTER TABLE community_members ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

        CREATE TABLE IF NOT EXISTS conversation_notes (
            id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            conversation_id UUID NOT NULL,
            creator_id      TEXT NOT NULL,
            creator_type    TEXT NOT NULL DEFAULT 'user',
            agent_id        UUID,
            title           VARCHAR(200) NOT NULL,
            content         TEXT NOT NULL DEFAULT '',
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_conv_notes_conversation ON conversation_notes(conversation_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_conv_notes_creator ON conversation_notes(creator_id);

        ALTER TABLE conversation_notes ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL;
        ALTER TABLE conversation_notes ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

        ALTER TABLE conversation_user_members ADD COLUMN IF NOT EXISTS agent_notes_enabled BOOLEAN NOT NULL DEFAULT true;

        ALTER TABLE messages ADD COLUMN IF NOT EXISTS thread_id UUID;

        CREATE TABLE IF NOT EXISTS thread_summaries (
            thread_id UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
            reply_count INTEGER NOT NULL DEFAULT 0,
            last_reply_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_reply_user_id TEXT,
            last_reply_agent_id UUID,
            participant_ids TEXT[] NOT NULL DEFAULT '{}'
        );
        CREATE INDEX IF NOT EXISTS idx_thread_summaries_last ON thread_summaries(last_reply_at DESC);
        CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id) WHERE thread_id IS NOT NULL;

        INSERT INTO thread_summaries (thread_id, reply_count, last_reply_at, participant_ids)
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
        ON CONFLICT (thread_id) DO NOTHING;

        CREATE TABLE IF NOT EXISTS themes (
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
        );

        INSERT INTO themes (id, name, version, description, renderer, preview, max_agents, tags, author_id, author_name, license)
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
          tags = EXCLUDED.tags;

        CREATE TABLE IF NOT EXISTS theme_purchases (
            user_id TEXT NOT NULL,
            theme_id TEXT NOT NULL,
            price INT NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, theme_id)
        );

        CREATE TABLE IF NOT EXISTS office_slot_bindings (
            user_id TEXT NOT NULL,
            theme_id TEXT NOT NULL,
            slot_index INT NOT NULL,
            agent_id UUID NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, theme_id, slot_index)
        );

        DO $$ BEGIN
            CREATE TYPE playground_category AS ENUM ('board_game', 'card_game', 'rpg', 'strategy', 'puzzle', 'trivia', 'social', 'other');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;

        DO $$ BEGIN
            CREATE TYPE session_status AS ENUM ('waiting', 'active', 'paused', 'finished', 'cancelled');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;

        CREATE TABLE IF NOT EXISTS playgrounds (
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
        );
        CREATE INDEX IF NOT EXISTS idx_playgrounds_owner ON playgrounds(owner_id);

        CREATE TABLE IF NOT EXISTS playground_sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            playground_id UUID NOT NULL REFERENCES playgrounds(id) ON DELETE CASCADE,
            status session_status NOT NULL DEFAULT 'waiting',
            state JSONB NOT NULL DEFAULT '{}'::jsonb,
            current_phase TEXT,
            prize_pool INT NOT NULL DEFAULT 0,
            started_at TIMESTAMP,
            finished_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_playground_sessions_pg ON playground_sessions(playground_id);

        CREATE TABLE IF NOT EXISTS playground_participants (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES playground_sessions(id) ON DELETE CASCADE,
            user_id TEXT,
            agent_id UUID,
            role TEXT,
            "controlMode" TEXT NOT NULL DEFAULT 'human',
            is_connected BOOLEAN NOT NULL DEFAULT true,
            joined_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_playground_participants_session ON playground_participants(session_id);

        CREATE TABLE IF NOT EXISTS notification_preferences (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id TEXT NOT NULL UNIQUE,
            global_enabled BOOLEAN NOT NULL DEFAULT true,
            message_enabled BOOLEAN NOT NULL DEFAULT true,
            playground_invite_enabled BOOLEAN NOT NULL DEFAULT true,
            playground_turn_enabled BOOLEAN NOT NULL DEFAULT true,
            playground_result_enabled BOOLEAN NOT NULL DEFAULT true,
            quiet_hours_start TEXT,
            quiet_hours_end TEXT
        );

        CREATE TABLE IF NOT EXISTS voice_calls (
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
        );
        CREATE INDEX IF NOT EXISTS idx_voice_calls_conv ON voice_calls(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_voice_calls_caller ON voice_calls(caller_id);
        CREATE INDEX IF NOT EXISTS idx_voice_calls_callee ON voice_calls(callee_id);

        CREATE TABLE IF NOT EXISTS kanban_card_notes (
            card_id UUID NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
            note_id UUID NOT NULL REFERENCES conversation_notes(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (card_id, note_id)
        );

        CREATE TABLE IF NOT EXISTS note_links (
            source_note_id UUID NOT NULL REFERENCES conversation_notes(id) ON DELETE CASCADE,
            target_note_id UUID NOT NULL REFERENCES conversation_notes(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (source_note_id, target_note_id)
        );
    "#;
    match sqlx::raw_sql(startup_migration).execute(&db).await {
        Ok(_) => tracing::info!("Startup migration completed"),
        Err(e) => tracing::warn!("Startup migration warning: {}", e),
    }

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

    // Build router
    let app = Router::new()
        .merge(routes::health::router())
        .merge(routes::auth::router())
        .merge(routes::agents::router())
        .merge(routes::conversations::router())
        .merge(routes::messages::router())
        .merge(routes::groups::router())
        .merge(routes::reactions::router())
        .merge(routes::pins::router())
        .merge(routes::uploads::router())
        .merge(routes::push::router())
        .merge(routes::notifications::router())
        .merge(routes::sandbox::router())
        .merge(routes::agent_health::router())
        .merge(routes::agent_messages::router())
        .merge(routes::agent_send::router())
        .merge(routes::agent_uploads::router())
        .merge(routes::office::router())
        .merge(routes::users::router())
        .merge(routes::friends::router())
        .merge(routes::blocking::router())
        .merge(routes::wallet::router())
        .merge(routes::agent_hub::router())
        .merge(routes::agent_hub_chat::router())
        .merge(routes::creator::router())
        .merge(routes::knowledge_base::router())
        .merge(routes::community::router())
        .merge(routes::oauth::router())
        .merge(routes::api_v1::router())
        .merge(routes::themes::router())
        .merge(routes::stickers::router())
        .merge(routes::admin::router())
        .merge(routes::reports::router())
        .merge(routes::notes::router())
        .merge(routes::agent_notes::router())
        .merge(routes::link_preview::router())
        .merge(routes::spaces::router())
        .merge(routes::shortcuts::router())
        .merge(routes::official::router())
        .merge(routes::lounge::router())
        .merge(routes::api_keys::router())
        .merge(routes::memory::router())
        .merge(routes::media::router())
        .merge(routes::kanban::router())
        .merge(routes::activity::router())
        .merge(routes::dashboard::router())
        .merge(routes::voice::router())
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
