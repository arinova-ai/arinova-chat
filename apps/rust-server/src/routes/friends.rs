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
        .route("/api/friends/request", post(send_friend_request))
        .route("/api/friends/accept/{id}", post(accept_friend_request))
        .route("/api/friends/reject/{id}", post(reject_friend_request))
        .route("/api/friends/{userId}", delete(remove_friend))
        .route("/api/friends", get(list_friends))
        .route("/api/friends/requests", get(list_requests))
}

#[derive(Deserialize)]
struct SendRequestBody {
    username: String,
}

/// POST /api/friends/request — Send a friend request by username
async fn send_friend_request(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<SendRequestBody>,
) -> Response {
    // Find addressee by username
    let addressee = sqlx::query_as::<_, (String, String, Option<String>)>(
        r#"SELECT id, name, image FROM "user" WHERE LOWER(username) = LOWER($1)"#,
    )
    .bind(&body.username)
    .fetch_optional(&state.db)
    .await;

    let (addressee_id, _, _) = match addressee {
        Ok(Some(a)) => a,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "User not found"})),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    // Cannot send to self
    if addressee_id == user.id {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Cannot send friend request to yourself"})),
        )
            .into_response();
    }

    // Check if blocked (either direction)
    let blocked = sqlx::query_as::<_, (i64,)>(
        r#"SELECT COUNT(*) FROM friendships
           WHERE status = 'blocked'
             AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))"#,
    )
    .bind(&user.id)
    .bind(&addressee_id)
    .fetch_one(&state.db)
    .await;

    if matches!(blocked, Ok((c,)) if c > 0) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Cannot send friend request"})),
        )
            .into_response();
    }

    // Check if already exists (pending or accepted, either direction)
    let existing = sqlx::query_as::<_, (Uuid, String)>(
        r#"SELECT id, status::text FROM friendships
           WHERE (requester_id = $1 AND addressee_id = $2)
              OR (requester_id = $2 AND addressee_id = $1)"#,
    )
    .bind(&user.id)
    .bind(&addressee_id)
    .fetch_optional(&state.db)
    .await;

    if let Ok(Some(_)) = existing {
        return (
            StatusCode::CONFLICT,
            Json(json!({"error": "Friend request already exists"})),
        )
            .into_response();
    }

    // Create friendship
    let result = sqlx::query_as::<_, (Uuid,)>(
        r#"INSERT INTO friendships (requester_id, addressee_id, status)
           VALUES ($1, $2, 'pending')
           RETURNING id"#,
    )
    .bind(&user.id)
    .bind(&addressee_id)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok((id,)) => (
            StatusCode::CREATED,
            Json(json!({"id": id, "status": "pending"})),
        )
            .into_response(),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("unique") || msg.contains("duplicate") {
                (
                    StatusCode::CONFLICT,
                    Json(json!({"error": "Friend request already exists"})),
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

/// POST /api/friends/accept/:id — Accept a friend request
async fn accept_friend_request(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let result = sqlx::query(
        r#"UPDATE friendships SET status = 'accepted', updated_at = NOW()
           WHERE id = $1 AND addressee_id = $2 AND status = 'pending'"#,
    )
    .bind(id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Json(json!({"status": "accepted"})).into_response(),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Friend request not found or already processed"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// POST /api/friends/reject/:id — Reject (delete) a friend request
async fn reject_friend_request(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let result = sqlx::query(
        r#"DELETE FROM friendships WHERE id = $1 AND addressee_id = $2 AND status = 'pending'"#,
    )
    .bind(id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Friend request not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// DELETE /api/friends/:userId — Remove a friend
async fn remove_friend(
    State(state): State<AppState>,
    user: AuthUser,
    Path(target_id): Path<String>,
) -> Response {
    let result = sqlx::query(
        r#"DELETE FROM friendships
           WHERE status = 'accepted'
             AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))"#,
    )
    .bind(&user.id)
    .bind(&target_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Friendship not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/friends — List accepted friends
async fn list_friends(
    State(state): State<AppState>,
    user: AuthUser,
) -> Response {
    let results = sqlx::query_as::<_, (String, String, Option<String>, Option<String>)>(
        r#"SELECT u.id, u.name, u.image, u.username
           FROM friendships f
           JOIN "user" u ON u.id = CASE
               WHEN f.requester_id = $1 THEN f.addressee_id
               ELSE f.requester_id
           END
           WHERE f.status = 'accepted'
             AND (f.requester_id = $1 OR f.addressee_id = $1)
           ORDER BY u.name"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    match results {
        Ok(rows) => {
            let friends: Vec<serde_json::Value> = rows
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
            Json(json!(friends)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/friends/requests — List pending friend requests (incoming + outgoing)
async fn list_requests(
    State(state): State<AppState>,
    user: AuthUser,
) -> Response {
    // Incoming requests (I am addressee)
    let incoming = sqlx::query_as::<_, (Uuid, String, String, Option<String>, Option<String>)>(
        r#"SELECT f.id, u.id, u.name, u.image, u.username
           FROM friendships f
           JOIN "user" u ON u.id = f.requester_id
           WHERE f.addressee_id = $1 AND f.status = 'pending'
           ORDER BY f.created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Outgoing requests (I am requester)
    let outgoing = sqlx::query_as::<_, (Uuid, String, String, Option<String>, Option<String>)>(
        r#"SELECT f.id, u.id, u.name, u.image, u.username
           FROM friendships f
           JOIN "user" u ON u.id = f.addressee_id
           WHERE f.requester_id = $1 AND f.status = 'pending'
           ORDER BY f.created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let incoming_json: Vec<serde_json::Value> = incoming
        .into_iter()
        .map(|(fid, uid, name, image, username)| {
            json!({
                "id": fid,
                "userId": uid,
                "name": name,
                "image": image,
                "username": username,
            })
        })
        .collect();

    let outgoing_json: Vec<serde_json::Value> = outgoing
        .into_iter()
        .map(|(fid, uid, name, image, username)| {
            json!({
                "id": fid,
                "userId": uid,
                "name": name,
                "image": image,
                "username": username,
            })
        })
        .collect();

    Json(json!({
        "incoming": incoming_json,
        "outgoing": outgoing_json,
    }))
    .into_response()
}
