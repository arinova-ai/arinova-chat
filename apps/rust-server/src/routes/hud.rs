use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Query, State},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use serde::Deserialize;
use serde_json::json;
use std::time::Duration;
use tokio::time::interval;

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/hud", get(hud_ws_upgrade))
}

#[derive(Deserialize)]
struct HudQuery {
    token: Option<String>,
}

/// GET /api/v1/hud?token=ari_xxx — WebSocket for HUD data relay
/// Also supports Authorization: Bearer ari_xxx header
async fn hud_ws_upgrade(
    State(state): State<AppState>,
    Query(q): Query<HudQuery>,
    headers: axum::http::HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    // Resolve token: query param first, then Authorization header
    let token = q.token.or_else(|| {
        headers.get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .map(|t| t.trim().to_string())
    });

    let token = match token {
        Some(t) if !t.is_empty() => t,
        _ => return (axum::http::StatusCode::UNAUTHORIZED, axum::Json(json!({"error": "Token required"}))).into_response(),
    };

    // Validate bot token
    let agent = sqlx::query_as::<_, (uuid::Uuid, String)>(
        "SELECT id, owner_id::text FROM agents WHERE secret_token = $1"
    )
    .bind(&token)
    .fetch_optional(&state.db)
    .await;

    match agent {
        Ok(Some(_)) => {
            ws.on_upgrade(move |socket| handle_hud_ws(socket, state))
        }
        _ => {
            (axum::http::StatusCode::UNAUTHORIZED, axum::Json(json!({"error": "Invalid token"}))).into_response()
        }
    }
}

async fn handle_hud_ws(mut socket: WebSocket, state: AppState) {
    let mut ping_interval = interval(Duration::from_secs(30));
    let mut last_pong = std::time::Instant::now();

    loop {
        tokio::select! {
            _ = ping_interval.tick() => {
                if last_pong.elapsed() > Duration::from_secs(60) {
                    tracing::info!("HUD WS: pong timeout, disconnecting");
                    break;
                }
                let _ = socket.send(Message::Text(serde_json::to_string(&json!({"type":"ping"})).unwrap().into())).await;
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        last_pong = std::time::Instant::now();
                        if let Ok(data) = serde_json::from_str::<serde_json::Value>(&text) {
                            let msg_type = data.get("type").and_then(|v| v.as_str()).unwrap_or("");

                            if msg_type == "pong" {
                                continue;
                            }

                            if msg_type == "hud_update" {
                                let conv_id = data.get("conversationId").and_then(|v| v.as_str()).unwrap_or("");
                                let hud_data = data.get("data").cloned().unwrap_or(json!({}));

                                if !conv_id.is_empty() {
                                    // Find the user who owns this conversation
                                    let user_id = sqlx::query_scalar::<_, String>(
                                        "SELECT user_id FROM conversations WHERE id = $1::uuid"
                                    )
                                    .bind(conv_id)
                                    .fetch_optional(&state.db)
                                    .await
                                    .ok()
                                    .flatten();

                                    if let Some(uid) = user_id {
                                        // Push hud_data to user via existing WS
                                        state.ws.send_to_user_or_queue(&uid, &json!({
                                            "type": "hud_data",
                                            "conversationId": conv_id,
                                            "data": hud_data,
                                        }), &state.redis);
                                    }
                                }
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
        }
    }
}
