use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use serde_json::json;
use sha1::Sha1;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

/// TURN credential TTL in seconds (24 hours).
const TURN_CREDENTIAL_TTL: i64 = 86400;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/voice/ice-servers", get(get_ice_servers))
        .route(
            "/api/voice/history/{conversationId}",
            get(get_call_history),
        )
}

// ---------------------------------------------------------------------------
// GET /api/voice/ice-servers — Return ICE server config with TURN credentials
// ---------------------------------------------------------------------------

async fn get_ice_servers(State(state): State<AppState>, user: AuthUser) -> Response {
    let turn_secret = match state.config.turn_secret.as_deref() {
        Some(s) => s,
        None => {
            // No TURN configured — return STUN only
            return (
                StatusCode::OK,
                Json(json!({
                    "iceServers": [
                        {"urls": ["stun:stun.l.google.com:19302"]}
                    ]
                })),
            )
                .into_response();
        }
    };

    let turn_host = &state.config.turn_host;

    // Time-limited credential: username = "$expiry:$userId"
    let expiry = Utc::now().timestamp() + TURN_CREDENTIAL_TTL;
    let username = format!("{}:{}", expiry, user.id);

    // credential = Base64(HMAC-SHA1(turn_secret, username))
    let credential = match Hmac::<Sha1>::new_from_slice(turn_secret.as_bytes()) {
        Ok(mut mac) => {
            mac.update(username.as_bytes());
            use base64::Engine;
            base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes())
        }
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to generate TURN credential"})),
            )
                .into_response();
        }
    };

    (
        StatusCode::OK,
        Json(json!({
            "iceServers": [
                {
                    "urls": [format!("turn:{}:3478", turn_host)],
                    "username": username,
                    "credential": credential,
                },
                {
                    "urls": ["stun:stun.l.google.com:19302"]
                }
            ]
        })),
    )
        .into_response()
}

// ---------------------------------------------------------------------------
// GET /api/voice/history/:conversationId — Call history for a conversation
// ---------------------------------------------------------------------------

async fn get_call_history(
    State(state): State<AppState>,
    _user: AuthUser,
    Path(conversation_id): Path<Uuid>,
) -> Response {
    #[derive(sqlx::FromRow)]
    struct CallRow {
        id: Uuid,
        caller_id: String,
        agent_id: Option<Uuid>,
        session_id: String,
        status: Option<String>,
        started_at: Option<DateTime<Utc>>,
        ended_at: Option<DateTime<Utc>>,
        duration_seconds: Option<i32>,
        end_reason: Option<String>,
        created_at: DateTime<Utc>,
    }

    let rows = sqlx::query_as::<_, CallRow>(
        r#"SELECT id, caller_id, agent_id, session_id, status,
                  started_at, ended_at, duration_seconds, end_reason, created_at
           FROM voice_calls
           WHERE conversation_id = $1
           ORDER BY created_at DESC
           LIMIT 50"#,
    )
    .bind(conversation_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let calls: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.id,
                "callerId": r.caller_id,
                "agentId": r.agent_id,
                "sessionId": r.session_id,
                "status": r.status,
                "startedAt": r.started_at.map(|dt| dt.to_rfc3339()),
                "endedAt": r.ended_at.map(|dt| dt.to_rfc3339()),
                "durationSeconds": r.duration_seconds,
                "endReason": r.end_reason,
                "createdAt": r.created_at.to_rfc3339(),
            })
        })
        .collect();

    (StatusCode::OK, Json(json!({ "calls": calls }))).into_response()
}
