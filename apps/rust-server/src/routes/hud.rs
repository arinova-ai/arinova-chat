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
use crate::routes::activity::insert_activity;

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
        Ok(Some((agent_id, owner_id))) => {
            ws.on_upgrade(move |socket| handle_hud_ws(socket, state, agent_id.to_string(), owner_id))
        }
        _ => {
            (axum::http::StatusCode::UNAUTHORIZED, axum::Json(json!({"error": "Invalid token"}))).into_response()
        }
    }
}

async fn handle_hud_ws(mut socket: WebSocket, state: AppState, agent_id: String, owner_id: String) {
    tracing::info!("HUD WS connected: agent={} owner={}", agent_id, owner_id);
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

                            tracing::info!("HUD WS recv: agent={} type={} payload={}", agent_id, msg_type, &text[..text.len().min(200)]);

                            if msg_type == "hud_update" {
                                let conv_id = data.get("conversationId").and_then(|v| v.as_str()).unwrap_or("");
                                let hud_data = data.get("data").cloned().unwrap_or(json!({}));

                                if !conv_id.is_empty() {
                                    let user_id = sqlx::query_scalar::<_, String>(
                                        "SELECT user_id FROM conversations WHERE id = $1::uuid"
                                    )
                                    .bind(conv_id)
                                    .fetch_optional(&state.db)
                                    .await
                                    .ok()
                                    .flatten();

                                    if let Some(uid) = user_id {
                                        state.ws.send_to_user_or_queue(&uid, &json!({
                                            "type": "hud_data",
                                            "conversationId": conv_id,
                                            "data": hud_data,
                                        }), &state.redis);
                                    }
                                }
                            }

                            // task_update: broadcast agent task status to the conversation owner
                            // task_update: global office event, push directly to owner
                            if msg_type == "task_update" {
                                // Bridge sends nested: {type, agentName, data: {status, task, ...}}
                                let inner = data.get("data").unwrap_or(&data);
                                let status = inner.get("status").and_then(|v| v.as_str())
                                    .or_else(|| data.get("status").and_then(|v| v.as_str()))
                                    .unwrap_or("");
                                let task_desc = inner.get("task").and_then(|v| v.as_str())
                                    .or_else(|| data.get("task").and_then(|v| v.as_str()));
                                let duration_ms = inner.get("durationMs").and_then(|v| v.as_u64())
                                    .or_else(|| data.get("durationMs").and_then(|v| v.as_u64()));
                                let cost_usd = inner.get("costUsd").and_then(|v| v.as_f64())
                                    .or_else(|| data.get("costUsd").and_then(|v| v.as_f64()));
                                let num_turns = inner.get("numTurns").and_then(|v| v.as_u64())
                                    .or_else(|| data.get("numTurns").and_then(|v| v.as_u64()));

                                // agentName is on outer level
                                let agent_name_from_data = data.get("agentName").and_then(|v| v.as_str());
                                // Fallback: look up agent name from DB
                                let agent_name = if let Some(n) = agent_name_from_data {
                                    n.to_string()
                                } else {
                                    sqlx::query_scalar::<_, String>(
                                        "SELECT name FROM agents WHERE id = $1::uuid"
                                    )
                                    .bind(&agent_id)
                                    .fetch_optional(&state.db)
                                    .await
                                    .ok()
                                    .flatten()
                                    .unwrap_or_default()
                                };

                                // Push directly to owner — no conversationId needed
                                state.ws.send_to_user_or_queue(&owner_id, &json!({
                                    "type": "task_update",
                                    "agentId": &agent_id,
                                    "agentName": &agent_name,
                                    "status": status,
                                    "task": task_desc,
                                    "durationMs": duration_ms,
                                    "costUsd": cost_usd,
                                    "numTurns": num_turns,
                                }), &state.redis);

                                // Persist to activity_logs
                                let title = task_desc.unwrap_or("(no description)").to_string();
                                let detail_str = match status {
                                    "completed" => {
                                        let parts: Vec<String> = [
                                            duration_ms.map(|d| format!("{}ms", d)),
                                            cost_usd.map(|c| format!("${:.4}", c)),
                                            num_turns.map(|n| format!("{} turns", n)),
                                        ].into_iter().flatten().collect();
                                        if parts.is_empty() { None } else { Some(parts.join(" · ")) }
                                    }
                                    _ => None,
                                };
                                insert_activity(
                                    &state.db,
                                    &owner_id,
                                    &agent_id,
                                    Some(&agent_name),
                                    &format!("task_{}", status),
                                    &title,
                                    detail_str.as_deref(),
                                ).await;
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
