use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post},
    Router,
};
use serde_json::json;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/conversations/{convId}/pin/{messageId}",
            post(pin_message),
        )
        .route(
            "/api/conversations/{convId}/pin/{messageId}",
            delete(unpin_message),
        )
        .route("/api/conversations/{convId}/pins", get(list_pins))
}

/// POST /api/conversations/:convId/pin/:messageId — Pin a message
async fn pin_message(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, message_id)): Path<(String, String)>,
) -> Response {
    // Verify user is a member of this conversation
    let is_member = sqlx::query_as::<_, (i64,)>(
        r#"SELECT COUNT(*) FROM conversation_user_members
           WHERE conversation_id = $1::uuid AND user_id = $2"#,
    )
    .bind(&conv_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .map(|(c,)| c > 0)
    .unwrap_or(false);

    // Also check if it's a direct conversation owned by this user
    let is_owner = if !is_member {
        sqlx::query_as::<_, (i64,)>(
            r#"SELECT COUNT(*) FROM conversations
               WHERE id = $1::uuid AND user_id = $2"#,
        )
        .bind(&conv_id)
        .bind(&user.id)
        .fetch_one(&state.db)
        .await
        .map(|(c,)| c > 0)
        .unwrap_or(false)
    } else {
        true
    };

    if !is_owner {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    // For community conversations, check pin_message permission
    let conv_type = sqlx::query_scalar::<_, String>(
        r#"SELECT type::text FROM conversations WHERE id = $1::uuid"#,
    )
    .bind(&conv_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    if conv_type.as_deref() == Some("community") {
        let community_id = sqlx::query_scalar::<_, uuid::Uuid>(
            "SELECT id FROM communities WHERE conversation_id = $1::uuid",
        )
        .bind(&conv_id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        if let Some(cid) = community_id {
            if !crate::routes::community::has_community_permission(&state.db, cid, &user.id, "pin_message").await {
                return (StatusCode::FORBIDDEN, Json(json!({"error": "No permission to pin messages"}))).into_response();
            }
        }
    }

    // Verify message belongs to this conversation
    let msg_exists = sqlx::query_as::<_, (i64,)>(
        r#"SELECT COUNT(*) FROM messages
           WHERE id = $1::uuid AND conversation_id = $2::uuid"#,
    )
    .bind(&message_id)
    .bind(&conv_id)
    .fetch_one(&state.db)
    .await
    .map(|(c,)| c > 0)
    .unwrap_or(false);

    if !msg_exists {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Message not found in this conversation"})),
        )
            .into_response();
    }

    let result = sqlx::query(
        r#"INSERT INTO pinned_messages (conversation_id, message_id, pinned_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (conversation_id, message_id) DO NOTHING"#,
    )
    .bind(&conv_id)
    .bind(&message_id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            // Resolve operator name: anonymous for communities, real name for groups
            let operator_name = if conv_type.as_deref() == Some("community") {
                // Try display_name from community_members first
                let community_id = sqlx::query_scalar::<_, uuid::Uuid>(
                    "SELECT id FROM communities WHERE conversation_id = $1::uuid",
                )
                .bind(&conv_id)
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten();

                if let Some(cid) = community_id {
                    sqlx::query_scalar::<_, String>(
                        "SELECT COALESCE(display_name, '') FROM community_members WHERE community_id = $1 AND user_id = $2",
                    )
                    .bind(cid)
                    .bind(&user.id)
                    .fetch_optional(&state.db)
                    .await
                    .ok()
                    .flatten()
                    .filter(|n| !n.is_empty())
                    .unwrap_or_else(|| {
                        use sha2::{Sha256, Digest};
                        let mut hasher = Sha256::new();
                        hasher.update(conv_id.as_bytes());
                        hasher.update(user.id.as_bytes());
                        format!("anon-{}", hex::encode(&hasher.finalize()[..8]))
                    })
                } else {
                    "Someone".to_string()
                }
            } else {
                // Group or direct: use real name
                sqlx::query_scalar::<_, String>(
                    r#"SELECT name FROM "user" WHERE id = $1"#,
                )
                .bind(&user.id)
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten()
                .unwrap_or_else(|| "Someone".to_string())
            };

            // Broadcast pin event to conversation members via system message
            let _ = sqlx::query(
                r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_user_id)
                   VALUES (gen_random_uuid(), $1::uuid, 0, 'system', $2, 'completed', $3)"#,
            )
            .bind(&conv_id)
            .bind(serde_json::to_string(&serde_json::json!({"key": "system.pinnedMessage", "params": {"name": operator_name}})).unwrap())
            .bind(&user.id)
            .execute(&state.db)
            .await;

            Json(json!({"pinned": true})).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// DELETE /api/conversations/:convId/pin/:messageId — Unpin a message
async fn unpin_message(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, message_id)): Path<(String, String)>,
) -> Response {
    // Verify membership (same as pin)
    let is_member = sqlx::query_as::<_, (i64,)>(
        r#"SELECT COUNT(*) FROM conversation_user_members
           WHERE conversation_id = $1::uuid AND user_id = $2
           UNION ALL
           SELECT COUNT(*) FROM conversations
           WHERE id = $1::uuid AND user_id = $2"#,
    )
    .bind(&conv_id)
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .map(|rows| rows.iter().any(|(c,)| *c > 0))
    .unwrap_or(false);

    if !is_member {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    let result = sqlx::query(
        r#"DELETE FROM pinned_messages
           WHERE conversation_id = $1 AND message_id = $2"#,
    )
    .bind(&conv_id)
    .bind(&message_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Json(json!({"pinned": false})).into_response(),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Pin not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/conversations/:convId/pins — List pinned messages
async fn list_pins(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conv_id): Path<String>,
) -> Response {
    // Verify membership: conversation_user_members OR conversation owner
    let is_member = sqlx::query_as::<_, (i64,)>(
        r#"SELECT COUNT(*) FROM conversation_user_members
           WHERE conversation_id = $1::uuid AND user_id = $2
           UNION ALL
           SELECT COUNT(*) FROM conversations
           WHERE id = $1::uuid AND user_id = $2"#,
    )
    .bind(&conv_id)
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .map(|rows| rows.iter().any(|(c,)| *c > 0))
    .unwrap_or(false);

    if !is_member {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    let results = sqlx::query_as::<_, (String, String, String, String, chrono::NaiveDateTime, String)>(
        r#"SELECT pm.message_id, m.content, m.role::text, pm.pinned_by,
                  pm.pinned_at, COALESCE(u.name, 'Unknown')
           FROM pinned_messages pm
           JOIN messages m ON m.id = pm.message_id::uuid
           LEFT JOIN "user" u ON u.id = pm.pinned_by
           WHERE pm.conversation_id = $1
           ORDER BY pm.pinned_at DESC"#,
    )
    .bind(&conv_id)
    .fetch_all(&state.db)
    .await;

    match results {
        Ok(rows) => {
            let pins: Vec<serde_json::Value> = rows
                .into_iter()
                .map(|(message_id, content, role, pinned_by, pinned_at, pinned_by_name)| {
                    json!({
                        "messageId": message_id,
                        "content": content,
                        "role": role,
                        "pinnedBy": pinned_by,
                        "pinnedByName": pinned_by_name,
                        "pinnedAt": pinned_at.and_utc().to_rfc3339(),
                    })
                })
                .collect();
            Json(json!(pins)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
