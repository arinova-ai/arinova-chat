use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post},
    Router,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/messages/:messageId/reactions",
            post(add_reaction).get(get_reactions),
        )
        .route(
            "/api/messages/:messageId/reactions/:emoji",
            delete(remove_reaction),
        )
}

#[derive(Deserialize)]
struct AddReactionBody {
    emoji: String,
}

async fn add_reaction(
    State(state): State<AppState>,
    user: AuthUser,
    Path(message_id): Path<Uuid>,
    Json(body): Json<AddReactionBody>,
) -> Response {
    if body.emoji.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Emoji is required"})),
        )
            .into_response();
    }

    // Verify message exists and user has access
    let msg = sqlx::query_as::<_, (Uuid, Uuid)>(
        r#"SELECT m.id, m.conversation_id
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           WHERE m.id = $1 AND c.user_id = $2"#,
    )
    .bind(message_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    if matches!(msg, Ok(None) | Err(_)) {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Message not found"})),
        )
            .into_response();
    }

    let reaction_id = Uuid::new_v4();
    let result = sqlx::query(
        r#"INSERT INTO message_reactions (id, message_id, user_id, emoji)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (message_id, user_id, emoji) DO NOTHING"#,
    )
    .bind(reaction_id)
    .bind(message_id)
    .bind(&user.id)
    .bind(&body.emoji)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::CREATED, Json(json!({"success": true}))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn remove_reaction(
    State(state): State<AppState>,
    user: AuthUser,
    Path((message_id, emoji)): Path<(Uuid, String)>,
) -> Response {
    let result = sqlx::query(
        "DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3",
    )
    .bind(message_id)
    .bind(&user.id)
    .bind(&emoji)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Reaction not found"})),
        )
            .into_response(),
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn get_reactions(
    State(state): State<AppState>,
    user: AuthUser,
    Path(message_id): Path<Uuid>,
) -> Response {
    // Verify message exists and user has access
    let msg = sqlx::query_as::<_, (Uuid,)>(
        r#"SELECT m.id
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           WHERE m.id = $1 AND c.user_id = $2"#,
    )
    .bind(message_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    if matches!(msg, Ok(None) | Err(_)) {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Message not found"})),
        )
            .into_response();
    }

    // Get grouped reactions with count and whether current user reacted
    let reactions = sqlx::query_as::<_, (String, i64, bool)>(
        r#"SELECT
               emoji,
               COUNT(*)::bigint AS count,
               BOOL_OR(user_id = $2) AS user_reacted
           FROM message_reactions
           WHERE message_id = $1
           GROUP BY emoji
           ORDER BY MIN(created_at)"#,
    )
    .bind(message_id)
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    match reactions {
        Ok(rows) => {
            let result: Vec<serde_json::Value> = rows
                .iter()
                .map(|(emoji, count, user_reacted)| {
                    json!({
                        "emoji": emoji,
                        "count": count,
                        "userReacted": user_reacted,
                    })
                })
                .collect();
            Json(json!(result)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
