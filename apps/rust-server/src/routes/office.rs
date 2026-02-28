use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Json, Response,
    },
    routing::{get, post},
    Router,
};
use futures::stream::Stream;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::convert::Infallible;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use uuid::Uuid;

use crate::auth::middleware::{AuthAgent, AuthUser};
use crate::services::office::InternalEvent;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/office/health", get(office_health))
        .route("/api/office/status", get(office_status))
        .route("/api/office/stream", get(office_stream))
        .route("/api/office/event", post(office_ingest))
        .route(
            "/api/office/bindings",
            get(get_bindings).put(put_binding),
        )
        .route(
            "/api/office/bindings/{theme_id}/{slot_index}",
            axum::routing::delete(delete_binding),
        )
}

// ── Slot binding types ──────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BindingsQuery {
    theme_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PutBindingBody {
    theme_id: String,
    slot_index: i32,
    agent_id: Uuid,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct BindingRow {
    slot_index: i32,
    agent_id: Uuid,
    agent_name: Option<String>,
    agent_avatar_url: Option<String>,
}

// ── Status / SSE endpoints ──────────────────────────────────

/// GET /api/office/health — lightweight health check (no auth required).
async fn office_health(State(state): State<AppState>) -> Json<serde_json::Value> {
    Json(json!({
        "connected": state.office.is_healthy(),
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
}

/// GET /api/office/status — returns current snapshot of all online agents.
async fn office_status(State(state): State<AppState>, _user: AuthUser) -> Response {
    if !state.office.is_healthy() {
        return Json(json!({
            "connected": false,
            "timestamp": chrono::Utc::now().to_rfc3339()
        }))
        .into_response();
    }

    let snapshot = state.office.snapshot();
    Json(json!({
        "connected": true,
        "agents": snapshot.agents,
        "timestamp": chrono::Utc::now().to_rfc3339()
    }))
    .into_response()
}

/// GET /api/office/stream — SSE endpoint streaming real-time agent status.
async fn office_stream(State(state): State<AppState>, _user: AuthUser) -> Response {
    if !state.office.is_healthy() {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error": "Office plugin not connected"})),
        )
            .into_response();
    }

    let rx = state.office.subscribe();

    // Send initial snapshot, then stream updates
    let initial = state.office.snapshot();
    let initial_event = Event::default()
        .data(serde_json::to_string(&initial).unwrap_or_default());

    let updates = BroadcastStream::new(rx).filter_map(|result| match result {
        Ok(event) => {
            let data = serde_json::to_string(&event).unwrap_or_default();
            Some(Ok(Event::default().data(data)))
        }
        Err(_) => None, // Lagged — skip
    });

    let stream =
        futures::stream::once(async move { Ok::<_, Infallible>(initial_event) }).chain(updates);

    Sse::new(stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}

/// POST /api/office/event — receive hook events from the OpenClaw plugin.
/// Authenticated via `Authorization: Bearer <botToken>` (same as agent endpoints).
async fn office_ingest(
    State(state): State<AppState>,
    agent: AuthAgent,
    Json(mut event): Json<InternalEvent>,
) -> Response {
    // Enforce: event must belong to the authenticated agent
    event.agent_id = agent.id.to_string();

    state.office.ingest(event);
    StatusCode::NO_CONTENT.into_response()
}

// ── Slot binding endpoints ──────────────────────────────────

/// GET /api/office/bindings?themeId=XXX
async fn get_bindings(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<BindingsQuery>,
) -> Response {
    let rows = sqlx::query_as::<_, BindingRow>(
        "SELECT b.slot_index, b.agent_id, a.name AS agent_name, a.avatar_url AS agent_avatar_url \
         FROM office_slot_bindings b \
         JOIN agents a ON a.id = b.agent_id \
         WHERE b.user_id = $1 AND b.theme_id = $2 \
         ORDER BY b.slot_index",
    )
    .bind(&user.id)
    .bind(&q.theme_id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => Json(json!(rows)).into_response(),
        Err(e) => {
            tracing::error!("get_bindings: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response()
        }
    }
}

/// PUT /api/office/bindings
async fn put_binding(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<PutBindingBody>,
) -> Response {
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("put_binding begin: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response();
        }
    };

    // Verify agent belongs to this user
    match sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM agents WHERE id = $1 AND owner_id = $2)",
    )
    .bind(body.agent_id)
    .bind(&user.id)
    .fetch_one(&mut *tx)
    .await
    {
        Ok(true) => {}
        Ok(false) => {
            return (StatusCode::FORBIDDEN, Json(json!({"error": "agent not owned by user"}))).into_response();
        }
        Err(e) => {
            tracing::error!("put_binding ownership check: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response();
        }
    }

    // Remove this agent from any other slot in the same theme (move semantics)
    if let Err(e) = sqlx::query(
        "DELETE FROM office_slot_bindings WHERE user_id = $1 AND theme_id = $2 AND agent_id = $3",
    )
    .bind(&user.id)
    .bind(&body.theme_id)
    .bind(body.agent_id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("put_binding delete old: {e}");
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response();
    }

    // Upsert into the target slot
    if let Err(e) = sqlx::query(
        "INSERT INTO office_slot_bindings (user_id, theme_id, slot_index, agent_id) \
         VALUES ($1, $2, $3, $4) \
         ON CONFLICT (user_id, theme_id, slot_index) \
         DO UPDATE SET agent_id = $4, updated_at = NOW()",
    )
    .bind(&user.id)
    .bind(&body.theme_id)
    .bind(body.slot_index)
    .bind(body.agent_id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("put_binding upsert: {e}");
        if let sqlx::Error::Database(ref db_err) = e {
            if db_err.constraint().is_some() {
                return (StatusCode::CONFLICT, Json(json!({"error": "binding conflict"}))).into_response();
            }
        }
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response();
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("put_binding commit: {e}");
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response();
    }

    Json(json!({
        "slotIndex": body.slot_index,
        "agentId": body.agent_id,
        "themeId": body.theme_id,
    }))
    .into_response()
}

/// DELETE /api/office/bindings/:theme_id/:slot_index
async fn delete_binding(
    State(state): State<AppState>,
    user: AuthUser,
    Path((theme_id, slot_index)): Path<(String, i32)>,
) -> Response {
    let result = sqlx::query(
        "DELETE FROM office_slot_bindings WHERE user_id = $1 AND theme_id = $2 AND slot_index = $3",
    )
    .bind(&user.id)
    .bind(&theme_id)
    .bind(slot_index)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => {
            tracing::error!("delete_binding: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response()
        }
    }
}
