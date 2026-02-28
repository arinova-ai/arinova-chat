use axum::{
    extract::State,
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Json, Response,
    },
    routing::{get, post},
    Router,
};
use futures::stream::Stream;
use serde_json::json;
use std::convert::Infallible;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;

use crate::auth::middleware::{AuthAgent, AuthUser};
use crate::services::office::InternalEvent;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/office/health", get(office_health))
        .route("/api/office/status", get(office_status))
        .route("/api/office/stream", get(office_stream))
        .route("/api/office/event", post(office_ingest))
}

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
    _agent: AuthAgent,
    Json(event): Json<InternalEvent>,
) -> Response {
    state.office.ingest(event);
    StatusCode::NO_CONTENT.into_response()
}
