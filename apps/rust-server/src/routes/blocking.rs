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
        .route("/api/users/{userId}/block", post(block_user))
        .route("/api/users/{userId}/block", delete(unblock_user))
        .route("/api/users/blocked", get(list_blocked))
}

/// POST /api/users/:userId/block — Block a user
async fn block_user(
    State(state): State<AppState>,
    user: AuthUser,
    Path(target_id): Path<String>,
) -> Response {
    if target_id == user.id {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Cannot block yourself"})),
        )
            .into_response();
    }

    // Delete any existing friendship between the two (either direction)
    let _ = sqlx::query(
        r#"DELETE FROM friendships
           WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1)"#,
    )
    .bind(&user.id)
    .bind(&target_id)
    .execute(&state.db)
    .await;

    // Insert block record
    let result = sqlx::query(
        r#"INSERT INTO friendships (requester_id, addressee_id, status)
           VALUES ($1, $2, 'blocked')
           ON CONFLICT (requester_id, addressee_id)
           DO UPDATE SET status = 'blocked', updated_at = NOW()"#,
    )
    .bind(&user.id)
    .bind(&target_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({"blocked": true})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// DELETE /api/users/:userId/block — Unblock a user
async fn unblock_user(
    State(state): State<AppState>,
    user: AuthUser,
    Path(target_id): Path<String>,
) -> Response {
    let result = sqlx::query(
        r#"DELETE FROM friendships
           WHERE requester_id = $1 AND addressee_id = $2 AND status = 'blocked'"#,
    )
    .bind(&user.id)
    .bind(&target_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Json(json!({"blocked": false})).into_response(),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Block record not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/users/blocked — List blocked users
async fn list_blocked(
    State(state): State<AppState>,
    user: AuthUser,
) -> Response {
    let results = sqlx::query_as::<_, (String, String, Option<String>, Option<String>)>(
        r#"SELECT u.id, u.name, u.image, u.username
           FROM friendships f
           JOIN "user" u ON u.id = f.addressee_id
           WHERE f.requester_id = $1 AND f.status = 'blocked'
           ORDER BY f.updated_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    match results {
        Ok(rows) => {
            let blocked: Vec<serde_json::Value> = rows
                .into_iter()
                .map(|(id, name, image, username)| {
                    json!({
                        "id": id,
                        "name": name,
                        "image": image,
                        "username": username,
                    })
                })
                .collect();
            Json(json!(blocked)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
