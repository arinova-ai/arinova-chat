use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, patch, post},
    Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::auth::middleware::AuthAdmin;
use crate::services::message_seq;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/broadcast", post(broadcast))
        .route("/api/admin/stats", get(stats))
        .route("/api/admin/users", get(list_users))
        .route("/api/admin/users/{id}/verify", patch(set_verify))
        .route("/api/admin/users/{id}/ban", post(ban_user))
        .route("/api/admin/users/{id}/unban", post(unban_user))
        .route("/api/admin/backfill-embeddings", post(backfill_embeddings))
        .route("/api/admin/users/{id}", get(get_user_detail))
        .route("/api/admin/stats/trends", get(stats_trends))
        .route("/api/admin/messages", get(search_messages))
        .route("/api/admin/messages/{id}", delete(delete_message_admin))
        .route("/api/admin/audit-logs", get(list_audit_logs))
        .route("/api/admin/maintenance", get(get_maintenance).post(toggle_maintenance))
        .route("/api/admin/agents", get(list_agents))
        .route("/api/admin/agents/{id}/ban", post(ban_agent))
        .route("/api/admin/agents/{id}/unban", post(unban_agent))
        .route("/api/admin/content-filters", get(list_content_filters).post(create_content_filter))
        .route("/api/admin/content-filters/{id}", delete(delete_content_filter))
        .route("/api/admin/feature-flags", get(list_feature_flags).post(upsert_feature_flag))
        .route("/api/admin/health", get(server_health))
        .route("/api/admin/stats/revenue", get(stats_revenue))
        .route("/api/admin/support-tickets", get(list_support_tickets))
        .route("/api/admin/support-tickets/{id}/reply", post(reply_support_ticket))
        .route("/api/admin/data-requests", get(list_data_requests))
        .route("/api/admin/data-requests/{id}/approve", post(approve_data_request))
        .route("/api/admin/email-templates", get(list_email_templates).post(upsert_email_template))
        .route("/api/admin/ip-blacklist", get(list_ip_blacklist).post(add_ip_blacklist))
        .route("/api/admin/ip-blacklist/{id}", delete(delete_ip_blacklist))
        .route("/api/admin/2fa-policy", get(get_2fa_policy).post(set_2fa_policy))
        // App review stubs (planned feature)
        .route("/api/admin/review/apps", get(review_apps_stub))
        .route("/api/admin/review/apps/{id}/{action}", post(review_app_action_stub))
}

async fn review_apps_stub(_admin: AuthAdmin) -> Json<serde_json::Value> {
    Json(json!({ "apps": [] }))
}

async fn review_app_action_stub(_admin: AuthAdmin) -> (StatusCode, Json<serde_json::Value>) {
    (StatusCode::NOT_IMPLEMENTED, Json(json!({ "error": "App review not yet implemented" })))
}

// ── Audit helper ──────────────────────────────────────────────────────

async fn audit(db: &sqlx::PgPool, admin_email: &str, action: &str, target_id: Option<&str>, details: Option<serde_json::Value>) {
    let _ = sqlx::query(
        "INSERT INTO audit_logs (admin_email, action, target_id, details) VALUES ($1, $2, $3, $4)",
    )
    .bind(admin_email)
    .bind(action)
    .bind(target_id)
    .bind(details)
    .execute(db)
    .await;
}

// ── Broadcast ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct BroadcastBody {
    content: String,
}

/// POST /api/admin/broadcast — Send announcement to all users via Arinova official account
async fn broadcast(
    State(state): State<AppState>,
    admin: AuthAdmin,
    Json(body): Json<BroadcastBody>,
) -> Response {
    if body.content.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Content must not be empty"})),
        )
            .into_response();
    }

    let content = body.content.trim().to_string();
    let official_id = "arinova-official";

    // Get all human users (excluding the official account itself)
    let users = match sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "user" WHERE id != $1"#,
    )
    .bind(official_id)
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    };

    let total = users.len();
    let mut sent = 0u64;

    // Use a transaction for the entire broadcast
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    };

    for (user_id,) in &users {
        // Find existing direct conversation between official and this user
        let conv_id: Option<(uuid::Uuid,)> = sqlx::query_as(
            r#"SELECT c.id FROM conversations c
               JOIN conversation_user_members m1 ON m1.conversation_id = c.id AND m1.user_id = $1
               JOIN conversation_user_members m2 ON m2.conversation_id = c.id AND m2.user_id = $2
               WHERE c.type IN ('direct', 'h2h')"#,
        )
        .bind(official_id)
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .unwrap_or(None);

        let conversation_id = if let Some((id,)) = conv_id {
            id
        } else {
            // Create new direct conversation
            let (new_id,): (uuid::Uuid,) = match sqlx::query_as(
                r#"INSERT INTO conversations (user_id, type) VALUES ($1, 'h2h') RETURNING id"#,
            )
            .bind(official_id)
            .fetch_one(&mut *tx)
            .await
            {
                Ok(row) => row,
                Err(e) => {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({"error": e.to_string()})),
                    )
                        .into_response();
                }
            };

            // Add both users as members
            let _ = sqlx::query(
                r#"INSERT INTO conversation_user_members (conversation_id, user_id, role)
                   VALUES ($1, $2, 'admin'), ($1, $3, 'member')
                   ON CONFLICT (conversation_id, user_id) DO NOTHING"#,
            )
            .bind(new_id)
            .bind(official_id)
            .bind(user_id)
            .execute(&mut *tx)
            .await;

            new_id
        };

        // Get next seq for this conversation
        let conv_id_str = conversation_id.to_string();
        let seq = match message_seq::get_next_seq(&state.db, &conv_id_str).await {
            Ok(s) => s,
            Err(_) => 1,
        };

        // Insert the broadcast message
        let _ = sqlx::query(
            r#"INSERT INTO messages (conversation_id, role, content, status, sender_user_id, seq)
               VALUES ($1, 'user', $2, 'completed', $3, $4)"#,
        )
        .bind(conversation_id)
        .bind(&content)
        .bind(official_id)
        .bind(seq)
        .execute(&mut *tx)
        .await;

        // Update conversation timestamp
        let _ = sqlx::query(
            r#"UPDATE conversations SET updated_at = NOW() WHERE id = $1"#,
        )
        .bind(conversation_id)
        .execute(&mut *tx)
        .await;

        sent += 1;
    }

    if let Err(e) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response();
    }

    audit(&state.db, &admin.email, "broadcast", None, Some(json!({"sent": sent}))).await;

    Json(json!({
        "success": true,
        "totalUsers": total,
        "sent": sent,
    }))
    .into_response()
}

// ── Stats ──────────────────────────────────────────────────────────────

/// GET /api/admin/stats — Dashboard statistics
async fn stats(
    State(state): State<AppState>,
    _admin: AuthAdmin,
) -> Response {
    let total_users = sqlx::query_as::<_, (i64,)>(r#"SELECT COUNT(*) FROM "user""#)
        .fetch_one(&state.db)
        .await
        .map(|r| r.0)
        .unwrap_or(0);

    let total_conversations = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM conversations")
        .fetch_one(&state.db)
        .await
        .map(|r| r.0)
        .unwrap_or(0);

    let total_messages = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM messages")
        .fetch_one(&state.db)
        .await
        .map(|r| r.0)
        .unwrap_or(0);

    let total_agents = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM agents")
        .fetch_one(&state.db)
        .await
        .map(|r| r.0)
        .unwrap_or(0);

    let recent_users = sqlx::query_as::<_, (i64,)>(
        r#"SELECT COUNT(*) FROM "user" WHERE created_at > NOW() - INTERVAL '7 days'"#,
    )
    .fetch_one(&state.db)
    .await
    .map(|r| r.0)
    .unwrap_or(0);

    Json(json!({
        "totalUsers": total_users,
        "totalConversations": total_conversations,
        "totalMessages": total_messages,
        "totalAgents": total_agents,
        "recentUsers": recent_users,
    }))
    .into_response()
}

// ── User list ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ListUsersQuery {
    page: Option<i64>,
    limit: Option<i64>,
    search: Option<String>,
}

/// GET /api/admin/users — Paginated user list with optional search
async fn list_users(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Query(params): Query<ListUsersQuery>,
) -> Response {
    let page = params.page.unwrap_or(1).max(1);
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = (page - 1) * limit;

    let (rows, total) = if let Some(ref search) = params.search {
        let pattern = format!("%{}%", search.to_lowercase());
        let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, Option<String>, bool, bool, chrono::NaiveDateTime)>(
            r#"SELECT id, name, email, username, image, is_verified, banned, created_at
               FROM "user"
               WHERE LOWER(name) LIKE $1 OR LOWER(email) LIKE $1 OR LOWER(username) LIKE $1
               ORDER BY created_at DESC
               LIMIT $2 OFFSET $3"#,
        )
        .bind(&pattern)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await;

        let total = sqlx::query_as::<_, (i64,)>(
            r#"SELECT COUNT(*) FROM "user"
               WHERE LOWER(name) LIKE $1 OR LOWER(email) LIKE $1 OR LOWER(username) LIKE $1"#,
        )
        .bind(&pattern)
        .fetch_one(&state.db)
        .await
        .map(|r| r.0)
        .unwrap_or(0);

        (rows, total)
    } else {
        let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, Option<String>, bool, bool, chrono::NaiveDateTime)>(
            r#"SELECT id, name, email, username, image, is_verified, banned, created_at
               FROM "user"
               ORDER BY created_at DESC
               LIMIT $1 OFFSET $2"#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await;

        let total = sqlx::query_as::<_, (i64,)>(r#"SELECT COUNT(*) FROM "user""#)
            .fetch_one(&state.db)
            .await
            .map(|r| r.0)
            .unwrap_or(0);

        (rows, total)
    };

    match rows {
        Ok(rows) => {
            let users: Vec<serde_json::Value> = rows
                .into_iter()
                .map(|(id, name, email, username, image, is_verified, banned, created_at)| {
                    json!({
                        "id": id,
                        "name": name,
                        "email": email,
                        "username": username,
                        "image": image,
                        "isVerified": is_verified,
                        "isBanned": banned,
                        "createdAt": created_at.and_utc().to_rfc3339(),
                    })
                })
                .collect();

            Json(json!({
                "users": users,
                "total": total,
                "page": page,
                "limit": limit,
            }))
            .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ── Verify toggle ──────────────────────────────────────────────────────

#[derive(Deserialize)]
struct SetVerifyBody {
    verified: bool,
}

/// PATCH /api/admin/users/:id/verify — Toggle verified badge
async fn set_verify(
    State(state): State<AppState>,
    admin: AuthAdmin,
    Path(user_id): Path<String>,
    Json(body): Json<SetVerifyBody>,
) -> Response {
    let result = sqlx::query(
        r#"UPDATE "user" SET is_verified = $1, updated_at = NOW() WHERE id = $2"#,
    )
    .bind(body.verified)
    .bind(&user_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => {
            audit(&state.db, &admin.email, if body.verified { "verify_user" } else { "unverify_user" }, Some(&user_id), None).await;
            Json(json!({"success": true, "isVerified": body.verified})).into_response()
        }
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "User not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ── Ban / Unban ───────────────────────────────────────────────────────

/// POST /api/admin/users/:id/ban — Ban a user
async fn ban_user(
    State(state): State<AppState>,
    admin: AuthAdmin,
    Path(user_id): Path<String>,
) -> Response {
    // Prevent self-ban
    if admin.id == user_id {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Cannot ban yourself"})),
        )
            .into_response();
    }
    let res = set_banned(&state, &user_id, true).await;
    audit(&state.db, &admin.email, "ban_user", Some(&user_id), None).await;
    res
}

/// POST /api/admin/users/:id/unban — Unban a user
async fn unban_user(
    State(state): State<AppState>,
    admin: AuthAdmin,
    Path(user_id): Path<String>,
) -> Response {
    let res = set_banned(&state, &user_id, false).await;
    audit(&state.db, &admin.email, "unban_user", Some(&user_id), None).await;
    res
}

async fn set_banned(state: &AppState, user_id: &str, banned: bool) -> Response {
    let result = sqlx::query(
        r#"UPDATE "user" SET banned = $1, updated_at = NOW() WHERE id = $2"#,
    )
    .bind(banned)
    .bind(user_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => {
            Json(json!({"success": true, "isBanned": banned})).into_response()
        }
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "User not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ── Backfill agent memory embeddings ──────────────────────────────────

/// POST /api/admin/backfill-embeddings
/// Generate embeddings for all agent_memories rows with embedding IS NULL.
async fn backfill_embeddings(
    State(state): State<AppState>,
    _admin: AuthAdmin,
) -> Response {
    let api_key = match state.config.openai_api_key.as_deref() {
        Some(k) if !k.is_empty() => k.to_string(),
        _ => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "OPENAI_API_KEY not configured"})),
            )
                .into_response();
        }
    };

    let rows = sqlx::query_as::<_, (uuid::Uuid, String, Option<String>)>(
        "SELECT id, summary, detail FROM agent_memories WHERE embedding IS NULL ORDER BY created_at",
    )
    .fetch_all(&state.db)
    .await;

    let rows = match rows {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    if rows.is_empty() {
        return Json(json!({"processed": 0, "message": "No memories need embedding"})).into_response();
    }

    let total = rows.len();
    let texts: Vec<String> = rows
        .iter()
        .map(|(_, summary, detail)| match detail {
            Some(d) if !d.is_empty() => format!("{}\n{}", summary, d),
            _ => summary.clone(),
        })
        .collect();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .unwrap_or_default();

    let mut updated = 0usize;
    for batch_start in (0..texts.len()).step_by(100) {
        let batch_end = (batch_start + 100).min(texts.len());
        let batch: Vec<String> = texts[batch_start..batch_end].to_vec();

        let embeddings = match crate::services::embedding::generate_embeddings(
            &client,
            &api_key,
            &batch,
            crate::services::embedding::EMBEDDING_MODEL,
        )
        .await
        {
            Ok(e) => e,
            Err(e) => {
                return Json(json!({
                    "processed": updated,
                    "total": total,
                    "error": format!("Embedding API failed at batch {}: {}", batch_start / 100, e),
                }))
                .into_response();
            }
        };

        for (i, emb) in embeddings.into_iter().enumerate() {
            let mem_id = rows[batch_start + i].0;
            let vec = pgvector::Vector::from(emb);
            if sqlx::query("UPDATE agent_memories SET embedding = $1::vector WHERE id = $2")
                .bind(vec)
                .bind(mem_id)
                .execute(&state.db)
                .await
                .is_ok()
            {
                updated += 1;
            }
        }
    }

    Json(json!({"processed": updated, "total": total})).into_response()
}

// ── User detail ───────────────────────────────────────────────────────

/// GET /api/admin/users/:id — Full user detail
async fn get_user_detail(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Path(id): Path<String>,
) -> Response {
    let row = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, Option<String>, bool, bool, Option<String>, chrono::NaiveDateTime)>(
        r#"SELECT id, name, email, username, image, is_verified, banned, bio, created_at FROM "user" WHERE id = $1"#,
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(u)) => {
            let conv_count = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM conversation_user_members WHERE user_id = $1",
            ).bind(&id).fetch_one(&state.db).await.map(|r| r.0).unwrap_or(0);

            let msg_count = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM messages WHERE sender_user_id = $1",
            ).bind(&id).fetch_one(&state.db).await.map(|r| r.0).unwrap_or(0);

            let agent_count = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM agents WHERE owner_id = $1",
            ).bind(&id).fetch_one(&state.db).await.map(|r| r.0).unwrap_or(0);

            Json(json!({
                "id": u.0, "name": u.1, "email": u.2, "username": u.3, "image": u.4,
                "isVerified": u.5, "isBanned": u.6, "bio": u.7, "createdAt": u.8.to_string(),
                "conversationCount": conv_count, "messageCount": msg_count, "agentCount": agent_count,
            })).into_response()
        }
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({"error": "User not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ── Stats trends (DAU/MAU) ────────────────────────────────────────────

#[derive(Deserialize)]
struct TrendsQuery {
    days: Option<i32>,
}

/// GET /api/admin/stats/trends?days=30 — Daily active users trend
async fn stats_trends(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Query(q): Query<TrendsQuery>,
) -> Response {
    let days = q.days.unwrap_or(30).min(90).max(1);

    let rows = sqlx::query_as::<_, (chrono::NaiveDate, i64)>(
        r#"SELECT DATE(created_at) as day, COUNT(DISTINCT sender_user_id) as dau
           FROM messages
           WHERE created_at > NOW() - ($1 || ' days')::interval
             AND sender_user_id IS NOT NULL
           GROUP BY DATE(created_at)
           ORDER BY day"#,
    )
    .bind(days)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let data: Vec<serde_json::Value> = rows.iter().map(|(day, dau)| json!({"date": day.to_string(), "dau": dau})).collect();

    let mau = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(DISTINCT sender_user_id) FROM messages WHERE created_at > NOW() - INTERVAL '30 days' AND sender_user_id IS NOT NULL",
    ).fetch_one(&state.db).await.map(|r| r.0).unwrap_or(0);

    Json(json!({"trend": data, "mau": mau})).into_response()
}

// ── Message search + delete (moderation) ──────────────────────────────

#[derive(Deserialize)]
struct SearchMessagesQuery {
    q: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

/// GET /api/admin/messages?q=keyword&page=1&limit=20
async fn search_messages(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Query(params): Query<SearchMessagesQuery>,
) -> Response {
    let page = params.page.unwrap_or(1).max(1);
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = (page - 1) * limit;

    let (rows, total) = if let Some(ref q) = params.q {
        let pattern = format!("%{}%", q);
        let rows = sqlx::query_as::<_, (uuid::Uuid, uuid::Uuid, String, Option<String>, Option<String>, chrono::NaiveDateTime)>(
            r#"SELECT m.id, m.conversation_id, m.content,
                      COALESCE(u.name, 'Agent') as sender_name,
                      m.sender_user_id,
                      m.created_at
               FROM messages m
               LEFT JOIN "user" u ON m.sender_user_id = u.id
               WHERE m.content ILIKE $1
               ORDER BY m.created_at DESC LIMIT $2 OFFSET $3"#,
        ).bind(&pattern).bind(limit).bind(offset).fetch_all(&state.db).await.unwrap_or_default();
        let total = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM messages WHERE content ILIKE $1").bind(&pattern).fetch_one(&state.db).await.map(|r| r.0).unwrap_or(0);
        (rows, total)
    } else {
        let rows = sqlx::query_as::<_, (uuid::Uuid, uuid::Uuid, String, Option<String>, Option<String>, chrono::NaiveDateTime)>(
            r#"SELECT m.id, m.conversation_id, m.content,
                      COALESCE(u.name, 'Agent') as sender_name,
                      m.sender_user_id,
                      m.created_at
               FROM messages m
               LEFT JOIN "user" u ON m.sender_user_id = u.id
               ORDER BY m.created_at DESC LIMIT $1 OFFSET $2"#,
        ).bind(limit).bind(offset).fetch_all(&state.db).await.unwrap_or_default();
        let total = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM messages").fetch_one(&state.db).await.map(|r| r.0).unwrap_or(0);
        (rows, total)
    };

    let messages: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.0, "conversationId": r.1, "content": r.2,
        "senderName": r.3, "senderUserId": r.4, "createdAt": r.5.to_string(),
    })).collect();

    Json(json!({"messages": messages, "total": total, "page": page, "limit": limit})).into_response()
}

/// DELETE /api/admin/messages/:id
async fn delete_message_admin(
    State(state): State<AppState>,
    admin: AuthAdmin,
    Path(id): Path<uuid::Uuid>,
) -> Response {
    let result = sqlx::query("DELETE FROM messages WHERE id = $1").bind(id).execute(&state.db).await;
    match result {
        Ok(r) if r.rows_affected() > 0 => {
            audit(&state.db, &admin.email, "delete_message", Some(&id.to_string()), None).await;
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Message not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ── Audit logs ────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct AuditQuery {
    page: Option<i64>,
    limit: Option<i64>,
}

/// GET /api/admin/audit-logs
async fn list_audit_logs(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Query(q): Query<AuditQuery>,
) -> Response {
    let page = q.page.unwrap_or(1).max(1);
    let limit = q.limit.unwrap_or(50).min(100);
    let offset = (page - 1) * limit;

    let rows = sqlx::query_as::<_, (uuid::Uuid, String, String, Option<String>, Option<serde_json::Value>, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, admin_email, action, target_id, details, created_at FROM audit_logs ORDER BY created_at DESC LIMIT $1 OFFSET $2",
    ).bind(limit).bind(offset).fetch_all(&state.db).await.unwrap_or_default();

    let total = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM audit_logs").fetch_one(&state.db).await.map(|r| r.0).unwrap_or(0);

    let logs: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.0, "adminEmail": r.1, "action": r.2, "targetId": r.3, "details": r.4, "createdAt": r.5.to_string(),
    })).collect();

    Json(json!({"logs": logs, "total": total, "page": page, "limit": limit})).into_response()
}

// ── Maintenance mode ──────────────────────────────────────────────────

#[derive(Deserialize)]
struct MaintenanceBody {
    enabled: bool,
    message: Option<String>,
}

/// POST /api/admin/maintenance — toggle maintenance mode
async fn toggle_maintenance(
    State(state): State<AppState>,
    admin: AuthAdmin,
    Json(body): Json<MaintenanceBody>,
) -> Response {
    let _ = sqlx::query(
        r#"INSERT INTO system_settings (key, value) VALUES ('maintenance', $1)
           ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()"#,
    )
    .bind(json!({"enabled": body.enabled, "message": body.message}))
    .execute(&state.db)
    .await;

    audit(&state.db, &admin.email, "toggle_maintenance", None, Some(json!({"enabled": body.enabled}))).await;

    Json(json!({"enabled": body.enabled})).into_response()
}

/// GET /api/admin/maintenance — get maintenance status
async fn get_maintenance(
    State(state): State<AppState>,
    _admin: AuthAdmin,
) -> Response {
    let row = sqlx::query_as::<_, (serde_json::Value,)>(
        "SELECT value FROM system_settings WHERE key = 'maintenance'",
    ).fetch_optional(&state.db).await;

    match row {
        Ok(Some(r)) => Json(r.0).into_response(),
        _ => Json(json!({"enabled": false})).into_response(),
    }
}

// ── Agent management ──────────────────────────────────────────────────

#[derive(Deserialize)]
struct AgentListQuery {
    page: Option<i64>,
    limit: Option<i64>,
    search: Option<String>,
}

/// GET /api/admin/agents
async fn list_agents(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Query(params): Query<AgentListQuery>,
) -> Response {
    let page = params.page.unwrap_or(1).max(1);
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = (page - 1) * limit;

    let rows = if let Some(ref s) = params.search {
        let pattern = format!("%{}%", s.to_lowercase());
        sqlx::query_as::<_, (uuid::Uuid, String, Option<String>, String, bool, chrono::NaiveDateTime)>(
            r#"SELECT a.id, a.name, a.description, a.owner_id, COALESCE(a.banned, false), a.created_at
               FROM agents a WHERE LOWER(a.name) LIKE $1 ORDER BY a.created_at DESC LIMIT $2 OFFSET $3"#,
        ).bind(&pattern).bind(limit).bind(offset).fetch_all(&state.db).await.unwrap_or_default()
    } else {
        sqlx::query_as::<_, (uuid::Uuid, String, Option<String>, String, bool, chrono::NaiveDateTime)>(
            r#"SELECT a.id, a.name, a.description, a.owner_id, COALESCE(a.banned, false), a.created_at
               FROM agents a ORDER BY a.created_at DESC LIMIT $1 OFFSET $2"#,
        ).bind(limit).bind(offset).fetch_all(&state.db).await.unwrap_or_default()
    };

    let agents: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.0, "name": r.1, "description": r.2, "ownerId": r.3, "isBanned": r.4, "createdAt": r.5.to_string(),
    })).collect();

    Json(json!({"agents": agents, "page": page, "limit": limit})).into_response()
}

/// POST /api/admin/agents/:id/ban
async fn ban_agent(State(state): State<AppState>, admin: AuthAdmin, Path(id): Path<uuid::Uuid>) -> Response {
    let _ = sqlx::query("UPDATE agents SET banned = true WHERE id = $1").bind(id).execute(&state.db).await;
    audit(&state.db, &admin.email, "ban_agent", Some(&id.to_string()), None).await;
    Json(json!({"banned": true})).into_response()
}

/// POST /api/admin/agents/:id/unban
async fn unban_agent(State(state): State<AppState>, admin: AuthAdmin, Path(id): Path<uuid::Uuid>) -> Response {
    let _ = sqlx::query("UPDATE agents SET banned = false WHERE id = $1").bind(id).execute(&state.db).await;
    audit(&state.db, &admin.email, "unban_agent", Some(&id.to_string()), None).await;
    Json(json!({"banned": false})).into_response()
}

// ── Content filters ───────────────────────────────────────────────────

/// GET /api/admin/content-filters
async fn list_content_filters(
    State(state): State<AppState>,
    _admin: AuthAdmin,
) -> Response {
    let rows = sqlx::query_as::<_, (uuid::Uuid, String, String, bool, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, pattern, action, enabled, created_at FROM content_filter_rules ORDER BY created_at DESC",
    ).fetch_all(&state.db).await.unwrap_or_default();

    let rules: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.0, "pattern": r.1, "action": r.2, "enabled": r.3, "createdAt": r.4.to_string(),
    })).collect();

    Json(json!({"rules": rules})).into_response()
}

#[derive(Deserialize)]
struct CreateFilterBody {
    pattern: String,
    action: Option<String>,
}

/// POST /api/admin/content-filters
async fn create_content_filter(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Json(body): Json<CreateFilterBody>,
) -> Response {
    let action = body.action.unwrap_or_else(|| "block".to_string());
    let id = uuid::Uuid::new_v4();
    let _ = sqlx::query("INSERT INTO content_filter_rules (id, pattern, action, enabled) VALUES ($1, $2, $3, true)")
        .bind(id).bind(&body.pattern).bind(&action).execute(&state.db).await;
    Json(json!({"id": id, "pattern": body.pattern, "action": action})).into_response()
}

/// DELETE /api/admin/content-filters/:id
async fn delete_content_filter(State(state): State<AppState>, _admin: AuthAdmin, Path(id): Path<uuid::Uuid>) -> Response {
    let _ = sqlx::query("DELETE FROM content_filter_rules WHERE id = $1").bind(id).execute(&state.db).await;
    StatusCode::NO_CONTENT.into_response()
}

// ── Feature flags ─────────────────────────────────────────────────────

/// GET /api/admin/feature-flags
async fn list_feature_flags(
    State(state): State<AppState>,
    _admin: AuthAdmin,
) -> Response {
    let rows = sqlx::query_as::<_, (uuid::Uuid, String, bool, Option<String>, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, name, enabled, description, updated_at FROM feature_flags ORDER BY name",
    ).fetch_all(&state.db).await.unwrap_or_default();

    let flags: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.0, "name": r.1, "enabled": r.2, "description": r.3, "updatedAt": r.4.to_string(),
    })).collect();

    Json(json!({"flags": flags})).into_response()
}

#[derive(Deserialize)]
struct UpsertFlagBody {
    name: String,
    enabled: bool,
    description: Option<String>,
}

/// POST /api/admin/feature-flags — create or update
async fn upsert_feature_flag(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Json(body): Json<UpsertFlagBody>,
) -> Response {
    let _ = sqlx::query(
        r#"INSERT INTO feature_flags (id, name, enabled, description) VALUES (gen_random_uuid(), $1, $2, $3)
           ON CONFLICT (name) DO UPDATE SET enabled = $2, description = $3, updated_at = NOW()"#,
    ).bind(&body.name).bind(body.enabled).bind(&body.description).execute(&state.db).await;

    Json(json!({"name": body.name, "enabled": body.enabled})).into_response()
}

// ── Server health ─────────────────────────────────────────────────────

/// GET /api/admin/health — Server monitoring
async fn server_health(
    State(state): State<AppState>,
    _admin: AuthAdmin,
) -> Response {
    let online_users = state.ws.user_connections.len();
    let active_streams = state.ws.active_streams.len();

    let db_ok = sqlx::query("SELECT 1").execute(&state.db).await.is_ok();

    let msg_1h = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*) FROM messages WHERE created_at > NOW() - INTERVAL '1 hour'",
    ).fetch_one(&state.db).await.map(|r| r.0).unwrap_or(0);

    Json(json!({
        "status": if db_ok { "ok" } else { "degraded" },
        "onlineUsers": online_users,
        "activeStreams": active_streams,
        "messagesLastHour": msg_1h,
        "dbConnected": db_ok,
    })).into_response()
}

// ── Revenue analytics ─────────────────────────────────────────────────

/// GET /api/admin/stats/revenue — Revenue analytics
async fn stats_revenue(
    State(state): State<AppState>,
    _admin: AuthAdmin,
) -> Response {
    let total_revenue = sqlx::query_as::<_, (i64,)>(
        "SELECT COALESCE(SUM(amount), 0) FROM coin_transactions WHERE type = 'topup'",
    ).fetch_one(&state.db).await.map(|r| r.0).unwrap_or(0);

    let total_purchases = sqlx::query_as::<_, (i64,)>(
        "SELECT COALESCE(ABS(SUM(amount)), 0) FROM coin_transactions WHERE type = 'purchase'",
    ).fetch_one(&state.db).await.map(|r| r.0).unwrap_or(0);

    let platform_fees = sqlx::query_as::<_, (i64,)>(
        "SELECT COALESCE(ABS(SUM(amount)), 0) FROM coin_transactions WHERE type = 'platform_fee'",
    ).fetch_one(&state.db).await.map(|r| r.0).unwrap_or(0);

    let daily = sqlx::query_as::<_, (chrono::NaiveDate, i64, i64)>(
        r#"SELECT DATE(created_at),
                  COALESCE(SUM(CASE WHEN type = 'topup' THEN amount ELSE 0 END), 0),
                  COALESCE(ABS(SUM(CASE WHEN type IN ('purchase', 'charge') THEN amount ELSE 0 END)), 0)
           FROM coin_transactions
           WHERE created_at > NOW() - INTERVAL '30 days'
           GROUP BY DATE(created_at)
           ORDER BY 1"#,
    ).fetch_all(&state.db).await.unwrap_or_default();

    let trend: Vec<serde_json::Value> = daily.iter().map(|(d, topup, spend)| json!({
        "date": d.to_string(), "topup": topup, "spend": spend,
    })).collect();

    Json(json!({
        "totalRevenue": total_revenue,
        "totalPurchases": total_purchases,
        "platformFees": platform_fees,
        "trend": trend,
    })).into_response()
}

// ── Support tickets ───────────────────────────────────────────────────

/// GET /api/admin/support-tickets
async fn list_support_tickets(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Query(q): Query<AuditQuery>,
) -> Response {
    let page = q.page.unwrap_or(1).max(1);
    let limit = q.limit.unwrap_or(20).min(100);
    let offset = (page - 1) * limit;

    let rows = sqlx::query_as::<_, (uuid::Uuid, String, String, String, String, Option<String>, chrono::DateTime<chrono::Utc>)>(
        r#"SELECT t.id, t.user_id, COALESCE(u.name, 'Unknown'), t.subject, t.status, t.admin_reply, t.created_at
           FROM support_tickets t LEFT JOIN "user" u ON t.user_id = u.id
           ORDER BY t.created_at DESC LIMIT $1 OFFSET $2"#,
    ).bind(limit).bind(offset).fetch_all(&state.db).await.unwrap_or_default();

    let total = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM support_tickets")
        .fetch_one(&state.db).await.map(|r| r.0).unwrap_or(0);

    let tickets: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.0, "userId": r.1, "userName": r.2, "subject": r.3,
        "status": r.4, "adminReply": r.5, "createdAt": r.6.to_string(),
    })).collect();

    Json(json!({"tickets": tickets, "total": total, "page": page})).into_response()
}

#[derive(Deserialize)]
struct ReplyBody {
    reply: String,
}

/// POST /api/admin/support-tickets/:id/reply
async fn reply_support_ticket(
    State(state): State<AppState>,
    admin: AuthAdmin,
    Path(id): Path<uuid::Uuid>,
    Json(body): Json<ReplyBody>,
) -> Response {
    let _ = sqlx::query(
        "UPDATE support_tickets SET admin_reply = $1, status = 'resolved', updated_at = NOW() WHERE id = $2",
    ).bind(&body.reply).bind(id).execute(&state.db).await;
    audit(&state.db, &admin.email, "reply_ticket", Some(&id.to_string()), None).await;
    Json(json!({"status": "resolved"})).into_response()
}

// ── GDPR data requests ────────────────────────────────────────────────

/// GET /api/admin/data-requests
async fn list_data_requests(
    State(state): State<AppState>,
    _admin: AuthAdmin,
) -> Response {
    let rows = sqlx::query_as::<_, (uuid::Uuid, String, String, String, chrono::DateTime<chrono::Utc>)>(
        r#"SELECT dr.id, dr.user_id, COALESCE(u.name, 'Unknown'), dr.request_type, dr.created_at
           FROM data_requests dr LEFT JOIN "user" u ON dr.user_id = u.id
           WHERE dr.status = 'pending'
           ORDER BY dr.created_at"#,
    ).fetch_all(&state.db).await.unwrap_or_default();

    let requests: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.0, "userId": r.1, "userName": r.2, "type": r.3, "createdAt": r.4.to_string(),
    })).collect();

    Json(json!({"requests": requests})).into_response()
}

/// POST /api/admin/data-requests/:id/approve
async fn approve_data_request(
    State(state): State<AppState>,
    admin: AuthAdmin,
    Path(id): Path<uuid::Uuid>,
) -> Response {
    let _ = sqlx::query(
        "UPDATE data_requests SET status = 'approved', updated_at = NOW() WHERE id = $1",
    ).bind(id).execute(&state.db).await;
    audit(&state.db, &admin.email, "approve_data_request", Some(&id.to_string()), None).await;
    Json(json!({"status": "approved"})).into_response()
}

// ── Email templates ───────────────────────────────────────────────────

/// GET /api/admin/email-templates
async fn list_email_templates(
    State(state): State<AppState>,
    _admin: AuthAdmin,
) -> Response {
    let rows = sqlx::query_as::<_, (uuid::Uuid, String, String, String, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, name, subject, body_html, updated_at FROM email_templates ORDER BY name",
    ).fetch_all(&state.db).await.unwrap_or_default();

    let templates: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.0, "name": r.1, "subject": r.2, "bodyHtml": r.3, "updatedAt": r.4.to_string(),
    })).collect();

    Json(json!({"templates": templates})).into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EmailTemplateBody {
    name: String,
    subject: String,
    body_html: String,
}

/// POST /api/admin/email-templates — create or update
async fn upsert_email_template(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Json(body): Json<EmailTemplateBody>,
) -> Response {
    let _ = sqlx::query(
        r#"INSERT INTO email_templates (id, name, subject, body_html) VALUES (gen_random_uuid(), $1, $2, $3)
           ON CONFLICT (name) DO UPDATE SET subject = $2, body_html = $3, updated_at = NOW()"#,
    ).bind(&body.name).bind(&body.subject).bind(&body.body_html).execute(&state.db).await;
    Json(json!({"name": body.name})).into_response()
}

// ── IP blacklist ──────────────────────────────────────────────────────

/// GET /api/admin/ip-blacklist
async fn list_ip_blacklist(
    State(state): State<AppState>,
    _admin: AuthAdmin,
) -> Response {
    let rows = sqlx::query_as::<_, (uuid::Uuid, String, Option<String>, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, ip, reason, created_at FROM ip_blacklist ORDER BY created_at DESC",
    ).fetch_all(&state.db).await.unwrap_or_default();

    let ips: Vec<serde_json::Value> = rows.iter().map(|r| json!({
        "id": r.0, "ip": r.1, "reason": r.2, "createdAt": r.3.to_string(),
    })).collect();

    Json(json!({"entries": ips})).into_response()
}

#[derive(Deserialize)]
struct IpBlacklistBody {
    ip: String,
    reason: Option<String>,
}

/// POST /api/admin/ip-blacklist
async fn add_ip_blacklist(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Json(body): Json<IpBlacklistBody>,
) -> Response {
    let id = uuid::Uuid::new_v4();
    let _ = sqlx::query("INSERT INTO ip_blacklist (id, ip, reason) VALUES ($1, $2, $3)")
        .bind(id).bind(&body.ip).bind(&body.reason).execute(&state.db).await;
    Json(json!({"id": id, "ip": body.ip})).into_response()
}

/// DELETE /api/admin/ip-blacklist/:id
async fn delete_ip_blacklist(State(state): State<AppState>, _admin: AuthAdmin, Path(id): Path<uuid::Uuid>) -> Response {
    let _ = sqlx::query("DELETE FROM ip_blacklist WHERE id = $1").bind(id).execute(&state.db).await;
    StatusCode::NO_CONTENT.into_response()
}

// ── 2FA Policy ────────────────────────────────────────────────────────

/// GET /api/admin/2fa-policy
async fn get_2fa_policy(State(state): State<AppState>, _admin: AuthAdmin) -> Response {
    let row = sqlx::query_as::<_, (serde_json::Value,)>(
        "SELECT value FROM system_settings WHERE key = '2fa_policy'",
    ).fetch_optional(&state.db).await;

    let enrolled = sqlx::query_as::<_, (i64,)>(
        r#"SELECT COUNT(*) FROM "user" WHERE totp_secret IS NOT NULL"#,
    ).fetch_one(&state.db).await.map(|r| r.0).unwrap_or(0);

    let total = sqlx::query_as::<_, (i64,)>(
        r#"SELECT COUNT(*) FROM "user""#,
    ).fetch_one(&state.db).await.map(|r| r.0).unwrap_or(0);

    match row {
        Ok(Some(r)) => {
            let mut val = r.0;
            val["enrolledUsers"] = json!(enrolled);
            val["totalUsers"] = json!(total);
            Json(val).into_response()
        }
        _ => Json(json!({"enforced": false, "enrolledUsers": enrolled, "totalUsers": total})).into_response(),
    }
}

#[derive(Deserialize)]
struct TwoFaPolicyBody {
    enforced: bool,
}

/// POST /api/admin/2fa-policy — toggle 2FA enforcement
async fn set_2fa_policy(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Json(body): Json<TwoFaPolicyBody>,
) -> Response {
    let _ = sqlx::query(
        r#"INSERT INTO system_settings (key, value) VALUES ('2fa_policy', $1)
           ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()"#,
    )
    .bind(json!({"enforced": body.enforced}))
    .execute(&state.db)
    .await;

    Json(json!({"enforced": body.enforced})).into_response()
}
