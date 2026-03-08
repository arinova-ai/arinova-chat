use axum::{
    extract::{Path, Query, State},
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

/// Max capsules per user
const MAX_CAPSULES_PER_USER: i64 = 10;
/// Max extractions per user per day
const MAX_DAILY_EXTRACTIONS: i32 = 10;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/memory/capsules", post(create_capsule).get(list_capsules))
        // Static path must come before dynamic {id} to avoid conflict
        .route("/api/memory/capsules/grants", get(list_grants_for_agent))
        .route("/api/memory/capsules/{id}", delete(delete_capsule))
        .route(
            "/api/memory/capsules/{id}/grants",
            post(grant_agent_access),
        )
        .route(
            "/api/memory/capsules/{id}/grants/{agentId}",
            delete(revoke_agent_access),
        )
}

// ---------------------------------------------------------------------------
// POST /api/memory/capsules — Create a capsule from a conversation
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct CreateCapsuleBody {
    conversation_id: Uuid,
    name: String,
}

async fn create_capsule(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateCapsuleBody>,
) -> Response {
    let name = body.name.trim().to_string();
    if name.is_empty() || name.len() > 255 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "name must be 1-255 characters"})),
        )
            .into_response();
    }

    // Validate user is a member of the conversation
    let is_member = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM conversation_user_members WHERE conversation_id = $1 AND user_id = $2",
    )
    .bind(body.conversation_id)
    .bind(Uuid::parse_str(&user.id).unwrap_or_default())
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if is_member == 0 {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "You are not a member of this conversation"})),
        )
            .into_response();
    }

    // Check capsule limit
    let capsule_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM memory_capsules WHERE owner_id = $1",
    )
    .bind(Uuid::parse_str(&user.id).unwrap_or_default())
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if capsule_count >= MAX_CAPSULES_PER_USER {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": format!("Maximum {} capsules per user", MAX_CAPSULES_PER_USER)})),
        )
            .into_response();
    }

    // Check daily extraction limit
    let daily_count = sqlx::query_scalar::<_, i32>(
        "SELECT extract_count FROM memory_usage_daily WHERE user_id = $1 AND date = CURRENT_DATE",
    )
    .bind(Uuid::parse_str(&user.id).unwrap_or_default())
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .unwrap_or(0);

    if daily_count >= MAX_DAILY_EXTRACTIONS {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error": format!("Daily extraction limit ({}) reached", MAX_DAILY_EXTRACTIONS)})),
        )
            .into_response();
    }

    // Count messages in the conversation
    let message_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM messages WHERE conversation_id = $1",
    )
    .bind(body.conversation_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0) as i32;

    // Create capsule (status=ready for now; Phase 4 will add async extraction)
    let capsule_id = match sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO memory_capsules (owner_id, name, source_conversation_id, message_count, status)
           VALUES ($1, $2, $3, $4, 'ready')
           RETURNING id"#,
    )
    .bind(Uuid::parse_str(&user.id).unwrap_or_default())
    .bind(&name)
    .bind(body.conversation_id)
    .bind(message_count)
    .fetch_one(&state.db)
    .await
    {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("Failed to create capsule: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to create capsule"})),
            )
                .into_response();
        }
    };

    // Increment daily usage
    let _ = sqlx::query(
        r#"INSERT INTO memory_usage_daily (user_id, date, extract_count)
           VALUES ($1, CURRENT_DATE, 1)
           ON CONFLICT (user_id, date) DO UPDATE SET extract_count = memory_usage_daily.extract_count + 1"#,
    )
    .bind(Uuid::parse_str(&user.id).unwrap_or_default())
    .execute(&state.db)
    .await;

    (
        StatusCode::CREATED,
        Json(json!({
            "id": capsule_id,
            "name": name,
            "status": "ready",
            "messageCount": message_count,
        })),
    )
        .into_response()
}

// ---------------------------------------------------------------------------
// GET /api/memory/capsules — List user's capsules
// ---------------------------------------------------------------------------

async fn list_capsules(
    State(state): State<AppState>,
    user: AuthUser,
) -> Response {
    #[derive(sqlx::FromRow)]
    struct CapsuleRow {
        id: Uuid,
        name: String,
        source_conversation_id: Option<Uuid>,
        message_count: i32,
        status: String,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let rows = sqlx::query_as::<_, CapsuleRow>(
        r#"SELECT id, name, source_conversation_id, message_count, status, created_at
           FROM memory_capsules
           WHERE owner_id = $1
           ORDER BY created_at DESC"#,
    )
    .bind(Uuid::parse_str(&user.id).unwrap_or_default())
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let capsules: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.id,
                "name": r.name,
                "sourceConversationId": r.source_conversation_id,
                "messageCount": r.message_count,
                "status": r.status,
                "createdAt": r.created_at.to_rfc3339(),
            })
        })
        .collect();

    (StatusCode::OK, Json(json!({ "capsules": capsules }))).into_response()
}

// ---------------------------------------------------------------------------
// DELETE /api/memory/capsules/:id — Delete a capsule
// ---------------------------------------------------------------------------

async fn delete_capsule(
    State(state): State<AppState>,
    user: AuthUser,
    Path(capsule_id): Path<Uuid>,
) -> Response {
    // Verify ownership
    let owner = sqlx::query_scalar::<_, Uuid>(
        "SELECT owner_id FROM memory_capsules WHERE id = $1",
    )
    .bind(capsule_id)
    .fetch_optional(&state.db)
    .await;

    match owner {
        Ok(Some(oid)) if oid.to_string() == user.id => {}
        Ok(Some(_)) => {
            return (StatusCode::FORBIDDEN, Json(json!({"error": "Not your capsule"}))).into_response();
        }
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(json!({"error": "Capsule not found"}))).into_response();
        }
        Err(e) => {
            tracing::error!("delete_capsule: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"}))).into_response();
        }
    }

    if let Err(e) = sqlx::query("DELETE FROM memory_capsules WHERE id = $1")
        .bind(capsule_id)
        .execute(&state.db)
        .await
    {
        tracing::error!("delete_capsule: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to delete capsule"}))).into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}

// ---------------------------------------------------------------------------
// GET /api/memory/capsules/grants?agent_id=UUID — Get grants for an agent
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct GrantsQuery {
    agent_id: Uuid,
}

async fn list_grants_for_agent(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<GrantsQuery>,
) -> Response {
    #[derive(sqlx::FromRow)]
    struct GrantRow {
        capsule_id: Uuid,
        capsule_name: String,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let rows = sqlx::query_as::<_, GrantRow>(
        r#"SELECT g.capsule_id, c.name AS capsule_name, g.created_at
           FROM memory_capsule_grants g
           JOIN memory_capsules c ON c.id = g.capsule_id
           WHERE g.agent_id = $1 AND c.owner_id = $2
           ORDER BY g.created_at DESC"#,
    )
    .bind(query.agent_id)
    .bind(Uuid::parse_str(&user.id).unwrap_or_default())
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let grants: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "capsuleId": r.capsule_id,
                "capsuleName": r.capsule_name,
                "createdAt": r.created_at.to_rfc3339(),
            })
        })
        .collect();

    (StatusCode::OK, Json(json!({ "grants": grants }))).into_response()
}

// ---------------------------------------------------------------------------
// POST /api/memory/capsules/:id/grants — Grant agent access
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct GrantBody {
    agent_id: Uuid,
}

async fn grant_agent_access(
    State(state): State<AppState>,
    user: AuthUser,
    Path(capsule_id): Path<Uuid>,
    Json(body): Json<GrantBody>,
) -> Response {
    // Verify capsule ownership
    let owner = sqlx::query_scalar::<_, Uuid>(
        "SELECT owner_id FROM memory_capsules WHERE id = $1",
    )
    .bind(capsule_id)
    .fetch_optional(&state.db)
    .await;

    match owner {
        Ok(Some(oid)) if oid.to_string() == user.id => {}
        Ok(Some(_)) => {
            return (StatusCode::FORBIDDEN, Json(json!({"error": "Not your capsule"}))).into_response();
        }
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(json!({"error": "Capsule not found"}))).into_response();
        }
        Err(e) => {
            tracing::error!("grant_agent_access: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"}))).into_response();
        }
    }

    if let Err(e) = sqlx::query(
        r#"INSERT INTO memory_capsule_grants (capsule_id, agent_id, granted_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (capsule_id, agent_id) DO NOTHING"#,
    )
    .bind(capsule_id)
    .bind(body.agent_id)
    .bind(Uuid::parse_str(&user.id).unwrap_or_default())
    .execute(&state.db)
    .await
    {
        tracing::error!("grant_agent_access: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to grant access"}))).into_response();
    }

    (
        StatusCode::CREATED,
        Json(json!({"capsuleId": capsule_id, "agentId": body.agent_id})),
    )
        .into_response()
}

// ---------------------------------------------------------------------------
// DELETE /api/memory/capsules/:id/grants/:agentId — Revoke agent access
// ---------------------------------------------------------------------------

async fn revoke_agent_access(
    State(state): State<AppState>,
    user: AuthUser,
    Path((capsule_id, agent_id)): Path<(Uuid, Uuid)>,
) -> Response {
    // Verify capsule ownership
    let owner = sqlx::query_scalar::<_, Uuid>(
        "SELECT owner_id FROM memory_capsules WHERE id = $1",
    )
    .bind(capsule_id)
    .fetch_optional(&state.db)
    .await;

    match owner {
        Ok(Some(oid)) if oid.to_string() == user.id => {}
        Ok(Some(_)) => {
            return (StatusCode::FORBIDDEN, Json(json!({"error": "Not your capsule"}))).into_response();
        }
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(json!({"error": "Capsule not found"}))).into_response();
        }
        Err(e) => {
            tracing::error!("revoke_agent_access: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"}))).into_response();
        }
    }

    if let Err(e) = sqlx::query(
        "DELETE FROM memory_capsule_grants WHERE capsule_id = $1 AND agent_id = $2",
    )
    .bind(capsule_id)
    .bind(agent_id)
    .execute(&state.db)
    .await
    {
        tracing::error!("revoke_agent_access: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to revoke access"}))).into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}
