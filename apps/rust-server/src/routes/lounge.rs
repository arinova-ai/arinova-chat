use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/lounge", post(create_lounge))
        .route("/api/lounge/{id}", get(get_lounge))
        .route("/api/lounge/{id}/start-chat", post(start_chat))
        .route("/api/lounge/{id}/join", post(join_lounge))
        .route("/api/lounge/{id}/dashboard", get(dashboard))
}

// ---------------------------------------------------------------------------
// POST /api/lounge — Create a lounge community
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct CreateLoungeBody {
    name: String,
    description: Option<String>,
    #[serde(rename = "avatarUrl")]
    avatar_url: Option<String>,
    #[serde(rename = "voiceSamplesUrl")]
    voice_samples_url: Option<String>,
    #[serde(rename = "freeMinutesPerDay")]
    free_minutes_per_day: Option<i32>,
    #[serde(rename = "subscriptionPriceCents")]
    subscription_price_cents: Option<i32>,
    #[serde(rename = "defaultAgentListingId")]
    default_agent_listing_id: Option<Uuid>,
}

async fn create_lounge(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateLoungeBody>,
) -> (StatusCode, Json<Value>) {
    let name = body.name.trim();
    if name.is_empty() || name.len() > 100 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Name is required (max 100 chars)" })),
        );
    }

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("create_lounge: begin tx failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Insert community (shared columns only)
    let community_id = match sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO communities (creator_id, name, description, type, avatar_url)
           VALUES ($1, $2, $3, 'lounge', $4)
           RETURNING id"#,
    )
    .bind(&user.id)
    .bind(name)
    .bind(body.description.as_deref())
    .bind(body.avatar_url.as_deref())
    .fetch_one(&mut *tx)
    .await
    {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("create_lounge: insert community failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Insert lounge-specific columns
    if let Err(e) = sqlx::query(
        r#"INSERT INTO lounges (community_id, voice_samples_url, free_minutes_per_day,
             subscription_price_cents, default_agent_listing_id)
           VALUES ($1, $2, $3, $4, $5)"#,
    )
    .bind(community_id)
    .bind(body.voice_samples_url.as_deref())
    .bind(body.free_minutes_per_day.unwrap_or(5))
    .bind(body.subscription_price_cents.unwrap_or(0))
    .bind(body.default_agent_listing_id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("create_lounge: insert lounges failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    // Add creator as member
    if let Err(e) = sqlx::query(
        r#"INSERT INTO community_members (community_id, user_id, role)
           VALUES ($1, $2, 'creator')"#,
    )
    .bind(community_id)
    .bind(&user.id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("create_lounge: insert member failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("create_lounge: commit failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    (
        StatusCode::CREATED,
        Json(json!({ "id": community_id })),
    )
}

// ---------------------------------------------------------------------------
// GET /api/lounge/:id — Get lounge details
// ---------------------------------------------------------------------------

async fn get_lounge(
    State(state): State<AppState>,
    _user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let row = sqlx::query_as::<_, LoungeRow>(
        r#"SELECT c.id, c.creator_id, c.name, c.description, c.avatar_url,
                  c.member_count, l.voice_model_id, l.voice_model_status,
                  l.voice_samples_url, l.free_minutes_per_day,
                  l.subscription_price_cents, l.default_agent_listing_id,
                  c.created_at,
                  u.name AS creator_name, u.image AS creator_image
           FROM communities c
           JOIN "user" u ON c.creator_id = u.id
           JOIN lounges l ON l.community_id = c.id
           WHERE c.id = $1 AND c.type = 'lounge' AND c.status = 'active'"#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(r)) => (
            StatusCode::OK,
            Json(json!({
                "id": r.id,
                "creatorId": r.creator_id,
                "name": r.name,
                "description": r.description,
                "avatarUrl": r.avatar_url,
                "memberCount": r.member_count,
                "voiceModelId": r.voice_model_id,
                "voiceModelStatus": r.voice_model_status,
                "voiceSamplesUrl": r.voice_samples_url,
                "freeMinutesPerDay": r.free_minutes_per_day,
                "subscriptionPriceCents": r.subscription_price_cents,
                "defaultAgentListingId": r.default_agent_listing_id,
                "createdAt": r.created_at.to_rfc3339(),
                "creatorName": r.creator_name,
                "creatorImage": r.creator_image,
            })),
        ),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Lounge not found" })),
        ),
        Err(e) => {
            tracing::error!("get_lounge: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

#[derive(sqlx::FromRow)]
struct LoungeRow {
    id: Uuid,
    creator_id: String,
    name: String,
    description: Option<String>,
    avatar_url: Option<String>,
    member_count: i32,
    voice_model_id: Option<String>,
    voice_model_status: Option<String>,
    voice_samples_url: Option<String>,
    free_minutes_per_day: i32,
    subscription_price_cents: i32,
    default_agent_listing_id: Option<Uuid>,
    created_at: chrono::DateTime<chrono::Utc>,
    creator_name: String,
    creator_image: Option<String>,
}

// ---------------------------------------------------------------------------
// POST /api/lounge/:id/start-chat — Start 1-on-1 conversation with voice agent
// ---------------------------------------------------------------------------

async fn start_chat(
    State(state): State<AppState>,
    user: AuthUser,
    Path(lounge_id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Verify lounge exists
    let lounge = sqlx::query_as::<_, (String, Option<Uuid>)>(
        r#"SELECT c.name, l.default_agent_listing_id
           FROM communities c
           LEFT JOIN lounges l ON l.community_id = c.id
           WHERE c.id = $1 AND c.type = 'lounge' AND c.status = 'active'"#,
    )
    .bind(lounge_id)
    .fetch_optional(&state.db)
    .await;

    let (lounge_name, default_agent_id) = match lounge {
        Ok(Some(c)) => c,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Lounge not found" })),
            );
        }
        Err(e) => {
            tracing::error!("lounge start_chat: fetch failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Check if conversation already exists (reuse existing)
    let existing = sqlx::query_scalar::<_, Uuid>(
        r#"SELECT conversation_id FROM official_conversations
           WHERE community_id = $1 AND user_id = $2"#,
    )
    .bind(lounge_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    if let Ok(Some(conv_id)) = existing {
        return (
            StatusCode::OK,
            Json(json!({ "conversationId": conv_id, "existing": true })),
        );
    }

    // Create conversation
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("lounge start_chat: begin tx failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    let conv_id = match sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO conversations (title, type, user_id, agent_id, mention_only)
           VALUES ($1, 'lounge', $2, $3, FALSE)
           RETURNING id"#,
    )
    .bind(&lounge_name)
    .bind(&user.id)
    .bind(default_agent_id)
    .fetch_one(&mut *tx)
    .await
    {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("lounge start_chat: create conversation failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Track via official_conversations (reuse existing table for lounge 1-on-1 tracking)
    if let Err(e) = sqlx::query(
        r#"INSERT INTO official_conversations (community_id, user_id, conversation_id, status)
           VALUES ($1, $2, $3, 'ai_active')"#,
    )
    .bind(lounge_id)
    .bind(&user.id)
    .bind(conv_id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("lounge start_chat: insert tracking failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    // Auto-join community if not already a member
    let _ = sqlx::query(
        r#"INSERT INTO community_members (community_id, user_id, role)
           VALUES ($1, $2, 'member')
           ON CONFLICT (community_id, user_id) DO NOTHING"#,
    )
    .bind(lounge_id)
    .bind(&user.id)
    .execute(&mut *tx)
    .await;

    if let Err(e) = tx.commit().await {
        tracing::error!("lounge start_chat: commit failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    (
        StatusCode::CREATED,
        Json(json!({
            "conversationId": conv_id,
            "existing": false,
        })),
    )
}

// ---------------------------------------------------------------------------
// GET /api/lounge/:id/dashboard — Creator dashboard
// ---------------------------------------------------------------------------

async fn dashboard(
    State(state): State<AppState>,
    user: AuthUser,
    Path(lounge_id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Verify creator
    let creator_id = sqlx::query_scalar::<_, String>(
        "SELECT creator_id FROM communities WHERE id = $1 AND type = 'lounge'",
    )
    .bind(lounge_id)
    .fetch_optional(&state.db)
    .await;

    match &creator_id {
        Ok(Some(cid)) if cid == &user.id => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Only the creator can view the dashboard" })),
            );
        }
    }

    // Stats
    let member_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM community_members WHERE community_id = $1",
    )
    .bind(lounge_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let active_subs = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM lounge_subscriptions WHERE community_id = $1 AND status = 'active'",
    )
    .bind(lounge_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let total_conversations = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM official_conversations WHERE community_id = $1",
    )
    .bind(lounge_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let today_usage_seconds = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(seconds_used), 0) FROM lounge_voice_usage WHERE community_id = $1 AND usage_date = CURRENT_DATE",
    )
    .bind(lounge_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    (
        StatusCode::OK,
        Json(json!({
            "memberCount": member_count,
            "activeSubscriptions": active_subs,
            "totalConversations": total_conversations,
            "todayUsageMinutes": today_usage_seconds / 60,
        })),
    )
}

// ---------------------------------------------------------------------------
// POST /api/lounge/:id/join — Join lounge + auto welcome message
// ---------------------------------------------------------------------------

async fn join_lounge(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Get the community's conversation_id
    let conv = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT conversation_id, name FROM communities WHERE id = $1 AND type = 'lounge'",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let (conversation_id, lounge_name) = match conv {
        Ok(Some(c)) => c,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Lounge not found"}))),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))),
    };

    // Check if already a member
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $2)",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !is_member {
        // Join the community
        let _ = sqlx::query(
            "INSERT INTO community_members (community_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING",
        )
        .bind(id)
        .bind(&user.id)
        .execute(&state.db)
        .await;

        // Add to conversation_user_members
        let _ = sqlx::query(
            "INSERT INTO conversation_user_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(conversation_id)
        .bind(&user.id)
        .execute(&state.db)
        .await;

        // Send welcome message from creator
        let creator_id = sqlx::query_scalar::<_, String>(
            "SELECT user_id FROM community_members WHERE community_id = $1 AND role = 'creator' LIMIT 1",
        )
        .bind(id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        if let Some(cid) = creator_id {
            let welcome = format!("Welcome to {}! 🎉", lounge_name);
            let seq = sqlx::query_scalar::<_, i32>(
                "SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE conversation_id = $1",
            )
            .bind(conversation_id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(1);

            let _ = sqlx::query(
                r#"INSERT INTO messages (conversation_id, role, content, status, sender_user_id, seq)
                   VALUES ($1, 'user', $2, 'completed', $3, $4)"#,
            )
            .bind(conversation_id)
            .bind(&welcome)
            .bind(&cid)
            .bind(seq)
            .execute(&state.db)
            .await;
        }
    }

    (StatusCode::OK, Json(json!({"conversationId": conversation_id})))
}
