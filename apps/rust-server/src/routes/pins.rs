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
            // Broadcast pin event to conversation members via system message
            let _ = sqlx::query(
                r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_user_id)
                   VALUES (gen_random_uuid(), $1::uuid, 0, 'system', $2, 'completed', $3)"#,
            )
            .bind(&conv_id)
            .bind(format!("pinned a message"))
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
        r#"SELECT pm.message_id, m.content, m.role, pm.pinned_by,
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
