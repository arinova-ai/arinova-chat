use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post},
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
        .route("/api/lounge/{id}/posts", get(list_posts).post(create_post))
        .route("/api/lounge/{id}/posts/{postId}", delete(delete_post))
        .route("/api/lounge/{id}/posts/upload", post(upload_post_image))
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
        Ok(None) => {
            // Fallback: try accounts table (lounge might be account-based, not community-based)
            let acc = sqlx::query_as::<_, (Uuid, String, Option<String>, Option<String>, String, String, Option<String>)>(
                r#"SELECT a.id, a.name, a.avatar, a.bio, a.owner_id,
                          u.name AS owner_name, u.image AS owner_image
                   FROM accounts a
                   JOIN "user" u ON u.id = a.owner_id
                   WHERE a.id = $1 AND a.type = 'lounge'"#,
            )
            .bind(id)
            .fetch_optional(&state.db)
            .await;

            match acc {
                Ok(Some((aid, name, avatar, bio, owner_id, owner_name, owner_image))) => {
                    let sub_count = sqlx::query_scalar::<_, i64>(
                        "SELECT COUNT(*) FROM account_subscribers WHERE account_id = $1",
                    ).bind(aid).fetch_one(&state.db).await.unwrap_or(0);

                    (StatusCode::OK, Json(json!({
                        "id": aid,
                        "name": name,
                        "description": bio,
                        "avatarUrl": avatar,
                        "subscriberCount": sub_count,
                        "creatorId": owner_id,
                        "creatorName": owner_name,
                        "creatorImage": owner_image,
                    })))
                }
                _ => (StatusCode::NOT_FOUND, Json(json!({ "error": "Lounge not found" })))
            }
        }
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
    // Try communities first
    let conv = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT conversation_id, name FROM communities WHERE id = $1 AND type = 'lounge'",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    if let Some((conversation_id_inner, lounge_name_inner)) = conv {
        // Community-based lounge — continue with community join flow below
        let conversation_id = conversation_id_inner;
        let lounge_name = lounge_name_inner;

        // Check if already a member
        let is_member = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $2)",
        ).bind(id).bind(&user.id).fetch_one(&state.db).await.unwrap_or(false);

        if !is_member {
            let _ = sqlx::query(
                "INSERT INTO community_members (community_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING",
            ).bind(id).bind(&user.id).execute(&state.db).await;
            let _ = sqlx::query(
                "INSERT INTO conversation_user_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            ).bind(conversation_id).bind(&user.id).execute(&state.db).await;

            // Welcome message
            let creator_id = sqlx::query_scalar::<_, String>(
                "SELECT user_id FROM community_members WHERE community_id = $1 AND role = 'creator' LIMIT 1",
            ).bind(id).fetch_optional(&state.db).await.ok().flatten();
            if let Some(cid) = creator_id {
                let welcome = format!("Welcome to {}! 🎉", lounge_name);
                let seq = sqlx::query_scalar::<_, i32>(
                    "SELECT COALESCE(MAX(seq), 0) + 1 FROM messages WHERE conversation_id = $1",
                ).bind(conversation_id).fetch_one(&state.db).await.unwrap_or(1);
                let _ = sqlx::query(
                    "INSERT INTO messages (conversation_id, role, content, status, sender_user_id, seq) VALUES ($1, 'user', $2, 'completed', $3, $4)",
                ).bind(conversation_id).bind(&welcome).bind(&cid).bind(seq).execute(&state.db).await;
            }
        }
        return (StatusCode::OK, Json(json!({"conversationId": conversation_id})));
    }

    // Fallback: accounts-based lounge
    let acc = sqlx::query_as::<_, (String, Option<Uuid>)>(
        "SELECT name, agent_id FROM accounts WHERE id = $1 AND type = 'lounge'",
    ).bind(id).fetch_optional(&state.db).await;

    match acc {
        Ok(Some((lounge_name, agent_id))) => {
            // Check existing conversation
            let existing = sqlx::query_scalar::<_, Uuid>(
                "SELECT conversation_id FROM official_conversations WHERE community_id = $1 AND user_id = $2",
            ).bind(id).bind(&user.id).fetch_optional(&state.db).await.ok().flatten();

            if let Some(conv_id) = existing {
                return (StatusCode::OK, Json(json!({"conversationId": conv_id})));
            }

            // Create new conversation
            let conv_id = Uuid::new_v4();
            let insert_result = sqlx::query(
                r#"INSERT INTO conversations (id, user_id, agent_id, title, type, lounge_account_id)
                   VALUES ($1, $2, $3, $4, 'lounge', $5)"#,
            ).bind(conv_id).bind(&user.id).bind(agent_id).bind(&lounge_name).bind(id).execute(&state.db).await;

            if let Err(e) = insert_result {
                tracing::error!("join_lounge: INSERT conversation failed: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("Failed to create conversation: {}", e)})));
            }

            // Note: official_conversations has FK to communities(id), so accounts-based lounges
            // can't use it. The conversation is tracked by type='lounge' + title matching.
            // Skip official_conversations INSERT for accounts-based lounges.

            // Add agent as conversation member (if agent exists)
            if let Some(aid) = agent_id {
                let _ = sqlx::query(
                    "INSERT INTO conversation_members (conversation_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                ).bind(conv_id).bind(aid).execute(&state.db).await;
            }

            return (StatusCode::OK, Json(json!({"conversationId": conv_id})));
        }
        _ => return (StatusCode::NOT_FOUND, Json(json!({"error": "Lounge not found"}))),
    }

}

// ---------------------------------------------------------------------------
// Lounge Posts
// ---------------------------------------------------------------------------

/// GET /api/lounge/:id/posts
async fn list_posts(
    State(state): State<AppState>,
    _user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, (Uuid, String, String, Option<String>, chrono::DateTime<chrono::Utc>, Option<String>, Option<String>)>(
        r#"SELECT p.id, p.content, p.author_id, p.image_url, p.created_at,
                  u.name AS author_name, u.image AS author_image
           FROM lounge_posts p
           JOIN "user" u ON u.id = p.author_id
           WHERE p.lounge_id = $1
           ORDER BY p.created_at DESC
           LIMIT 50"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(posts) => {
            let items: Vec<Value> = posts.iter().map(|(pid, content, author_id, image, created, name, avatar)| json!({
                "id": pid,
                "content": content,
                "authorId": author_id,
                "imageUrl": image,
                "createdAt": created.to_rfc3339(),
                "authorName": name,
                "authorImage": avatar,
            })).collect();
            (StatusCode::OK, Json(json!({ "posts": items })))
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))),
    }
}

#[derive(Deserialize)]
struct CreatePostBody {
    content: String,
    #[serde(rename = "imageUrl")]
    image_url: Option<String>,
}

/// POST /api/lounge/:id/posts — admin only
async fn create_post(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreatePostBody>,
) -> (StatusCode, Json<Value>) {
    // Check ownership (account owner)
    let is_owner = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM accounts WHERE id = $1 AND owner_id = $2)",
    ).bind(id).bind(&user.id).fetch_one(&state.db).await.unwrap_or(false);

    if !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Only the lounge owner can post"})));
    }

    let post_id = Uuid::new_v4();
    let _ = sqlx::query(
        "INSERT INTO lounge_posts (id, lounge_id, author_id, content, image_url) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(post_id).bind(id).bind(&user.id).bind(&body.content).bind(&body.image_url)
    .execute(&state.db).await;

    (StatusCode::CREATED, Json(json!({ "id": post_id })))
}

/// DELETE /api/lounge/:id/posts/:postId
async fn delete_post(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, post_id)): Path<(Uuid, Uuid)>,
) -> (StatusCode, Json<Value>) {
    let is_owner = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM accounts WHERE id = $1 AND owner_id = $2)",
    ).bind(id).bind(&user.id).fetch_one(&state.db).await.unwrap_or(false);

    if !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Only the lounge owner can delete posts"})));
    }

    let _ = sqlx::query("DELETE FROM lounge_posts WHERE id = $1 AND lounge_id = $2")
        .bind(post_id).bind(id).execute(&state.db).await;

    (StatusCode::OK, Json(json!({"ok": true})))
}

/// POST /api/lounge/:id/posts/upload — upload post image
async fn upload_post_image(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    mut multipart: Multipart,
) -> Response {
    let is_owner = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM accounts WHERE id = $1 AND owner_id = $2)",
    ).bind(id).bind(&user.id).fetch_one(&state.db).await.unwrap_or(false);
    if !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Only owner"}))).into_response();
    }

    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() != Some("file") { continue; }
        let data = match field.bytes().await {
            Ok(d) => d,
            Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({"error": "Failed to read file"}))).into_response(),
        };
        if data.len() > 10 * 1024 * 1024 {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "Image must be under 10MB"}))).into_response();
        }
        let (ext, content_type) = if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
            ("png", "image/png")
        } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
            ("jpg", "image/jpeg")
        } else if data.len() >= 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WEBP" {
            ("webp", "image/webp")
        } else {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "Only PNG, JPEG, WebP"}))).into_response();
        };

        let stored = format!("lounge_post_{}_{}.{}", id, chrono::Utc::now().timestamp_millis(), ext);
        let r2_key = format!("lounge/{}", stored);
        let url = if let Some(s3) = &state.s3 {
            match crate::services::r2::upload_to_r2(s3, &state.config.r2_bucket, &r2_key, data.to_vec(), content_type, &state.config.r2_public_url).await {
                Ok(url) => url,
                Err(_) => {
                    let dir = std::path::Path::new(&state.config.upload_dir).join("lounge");
                    let _ = tokio::fs::create_dir_all(&dir).await;
                    let _ = tokio::fs::write(dir.join(&stored), &data).await;
                    format!("/uploads/lounge/{}", stored)
                }
            }
        } else {
            let dir = std::path::Path::new(&state.config.upload_dir).join("lounge");
            let _ = tokio::fs::create_dir_all(&dir).await;
            let _ = tokio::fs::write(dir.join(&stored), &data).await;
            format!("/uploads/lounge/{}", stored)
        };

        return Json(json!({"url": url})).into_response();
    }
    (StatusCode::BAD_REQUEST, Json(json!({"error": "No file"}))).into_response()
}
