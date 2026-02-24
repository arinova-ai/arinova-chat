use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::auth::middleware::AuthUser;
use crate::utils::username::validate_username;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/users/username", post(set_username))
        .route("/api/users/username/check", get(check_username))
        .route("/api/users/search", get(search_users))
        .route("/api/users/me", get(get_me))
}

#[derive(Deserialize)]
struct SetUsernameBody {
    username: String,
}

#[derive(Deserialize)]
struct CheckUsernameQuery {
    username: String,
}

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
    limit: Option<i64>,
}

/// GET /api/users/me — Get current user info including username
async fn get_me(
    State(_state): State<AppState>,
    user: AuthUser,
) -> Response {
    Json(json!({
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "username": user.username,
    }))
    .into_response()
}

/// POST /api/users/username — Set username (one-time)
async fn set_username(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<SetUsernameBody>,
) -> Response {
    // Check if user already has a username
    if user.username.is_some() {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Username cannot be changed"})),
        )
            .into_response();
    }

    // Validate format
    if let Err(msg) = validate_username(&body.username) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": msg})),
        )
            .into_response();
    }

    // Try to set (UNIQUE constraint handles duplicates)
    let result = sqlx::query(
        r#"UPDATE "user" SET username = $1, updated_at = NOW() WHERE id = $2 AND username IS NULL"#,
    )
    .bind(&body.username)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => {
            Json(json!({"username": body.username})).into_response()
        }
        Ok(_) => {
            // No rows affected — user already has a username
            (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Username cannot be changed"})),
            )
                .into_response()
        }
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("unique") || msg.contains("duplicate") || msg.contains("idx_user_username_lower") {
                (
                    StatusCode::CONFLICT,
                    Json(json!({"error": "Username is already taken"})),
                )
                    .into_response()
            } else {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": msg})),
                )
                    .into_response()
            }
        }
    }
}

/// GET /api/users/username/check?username=xxx — Check if username is available
async fn check_username(
    State(state): State<AppState>,
    _user: AuthUser,
    Query(params): Query<CheckUsernameQuery>,
) -> Response {
    if let Err(msg) = validate_username(&params.username) {
        return Json(json!({"available": false, "error": msg})).into_response();
    }

    let exists = sqlx::query_as::<_, (bool,)>(
        r#"SELECT EXISTS(SELECT 1 FROM "user" WHERE LOWER(username) = LOWER($1))"#,
    )
    .bind(&params.username)
    .fetch_one(&state.db)
    .await;

    match exists {
        Ok((true,)) => Json(json!({"available": false, "error": "Username is already taken"})).into_response(),
        Ok((false,)) => Json(json!({"available": true})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/users/search?q=prefix — Search users by username prefix
async fn search_users(
    State(state): State<AppState>,
    _user: AuthUser,
    Query(params): Query<SearchQuery>,
) -> Response {
    let limit = params.limit.unwrap_or(20).min(50);
    let pattern = format!("{}%", params.q.to_lowercase());

    let results = sqlx::query_as::<_, (String, String, Option<String>, Option<String>)>(
        r#"SELECT id, name, image, username FROM "user"
           WHERE username ILIKE $1
           ORDER BY username
           LIMIT $2"#,
    )
    .bind(&pattern)
    .bind(limit)
    .fetch_all(&state.db)
    .await;

    match results {
        Ok(rows) => {
            let users: Vec<serde_json::Value> = rows
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
            Json(json!(users)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
