use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, patch, post},
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
}

// ── Broadcast ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct BroadcastBody {
    content: String,
}

/// POST /api/admin/broadcast — Send announcement to all users via Arinova official account
async fn broadcast(
    State(state): State<AppState>,
    _admin: AuthAdmin,
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
               WHERE c.type = 'direct'"#,
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
                r#"INSERT INTO conversations (user_id, type) VALUES ($1, 'direct') RETURNING id"#,
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
        let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, Option<String>, bool, chrono::NaiveDateTime)>(
            r#"SELECT id, name, email, username, image, is_verified, created_at
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
        let rows = sqlx::query_as::<_, (String, String, Option<String>, Option<String>, Option<String>, bool, chrono::NaiveDateTime)>(
            r#"SELECT id, name, email, username, image, is_verified, created_at
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
                .map(|(id, name, email, username, image, is_verified, created_at)| {
                    json!({
                        "id": id,
                        "name": name,
                        "email": email,
                        "username": username,
                        "image": image,
                        "isVerified": is_verified,
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
    _admin: AuthAdmin,
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
