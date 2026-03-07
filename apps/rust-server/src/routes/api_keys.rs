use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, post},
    Router,
};
use chrono::NaiveDateTime;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/creator/api-keys", get(list_keys).post(create_key))
        .route("/api/creator/api-keys/{id}", delete(revoke_key))
        .route("/api/creator/api-keys/whoami", get(whoami))
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct ApiKeyRow {
    id: String,
    name: String,
    key_prefix: String,
    last_used_at: Option<NaiveDateTime>,
    created_at: NaiveDateTime,
    revoked_at: Option<NaiveDateTime>,
}

#[derive(Deserialize)]
struct CreateKeyBody {
    name: String,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn generate_api_key() -> String {
    let random_bytes: [u8; 16] = rand::random();
    format!("ari_cli_{}", hex::encode(random_bytes))
}

fn hash_key(key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(key.as_bytes());
    hex::encode(hasher.finalize())
}

// ---------------------------------------------------------------------------
// POST /api/creator/api-keys — Create a new API key
// ---------------------------------------------------------------------------

async fn create_key(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateKeyBody>,
) -> (StatusCode, Json<Value>) {
    let name = body.name.trim();
    if name.is_empty() || name.len() > 100 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Name must be 1-100 characters"})),
        );
    }

    let raw_key = generate_api_key();
    let key_hash = hash_key(&raw_key);
    let key_prefix = &raw_key[..12]; // "ari_cli_xxxx"

    let result = sqlx::query_scalar::<_, String>(
        r#"INSERT INTO creator_api_keys (user_id, name, key_hash, key_prefix)
           VALUES ($1, $2, $3, $4)
           RETURNING id::text"#,
    )
    .bind(&user.id)
    .bind(name)
    .bind(&key_hash)
    .bind(key_prefix)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(id) => (
            StatusCode::CREATED,
            Json(json!({
                "id": id,
                "name": name,
                "key": raw_key,
                "prefix": key_prefix,
                "note": "Save this key now. It will not be shown again."
            })),
        ),
        Err(e) => {
            tracing::error!("create_api_key failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to create API key"})),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/creator/api-keys — List user's API keys
// ---------------------------------------------------------------------------

async fn list_keys(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, ApiKeyRow>(
        r#"SELECT id::text, name, key_prefix, last_used_at, created_at, revoked_at
           FROM creator_api_keys
           WHERE user_id = $1
           ORDER BY created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let keys: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.id,
                "name": r.name,
                "prefix": r.key_prefix,
                "lastUsedAt": r.last_used_at.map(|t| t.and_utc().to_rfc3339()),
                "createdAt": r.created_at.and_utc().to_rfc3339(),
                "revokedAt": r.revoked_at.map(|t| t.and_utc().to_rfc3339()),
            })
        })
        .collect();

    (StatusCode::OK, Json(json!({ "keys": keys })))
}

// ---------------------------------------------------------------------------
// DELETE /api/creator/api-keys/:id — Revoke an API key
// ---------------------------------------------------------------------------

async fn revoke_key(
    State(state): State<AppState>,
    user: AuthUser,
    Path(key_id): Path<String>,
) -> (StatusCode, Json<Value>) {
    let result = sqlx::query(
        r#"UPDATE creator_api_keys SET revoked_at = NOW()
           WHERE id::text = $1 AND user_id = $2 AND revoked_at IS NULL"#,
    )
    .bind(&key_id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => (
            StatusCode::OK,
            Json(json!({"revoked": key_id})),
        ),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Key not found or already revoked"})),
        ),
        Err(e) => {
            tracing::error!("revoke_api_key failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to revoke key"})),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/creator/api-keys/whoami — Current user info via API key
// ---------------------------------------------------------------------------

async fn whoami(
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "username": user.username,
        })),
    )
}
