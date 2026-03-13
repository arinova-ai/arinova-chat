use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::Response,
    routing::get,
    Router,
};
use futures::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sqlx::PgPool;
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};
use uuid::Uuid;

use crate::auth::session::validate_session;
use crate::ws::state::WsState;
use crate::AppState;

/// Heartbeat timeout — close if no message received within 60 seconds.
const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(60);

pub fn router() -> Router<AppState> {
    Router::new().route("/ws/voice", get(ws_voice_upgrade))
}

async fn ws_voice_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Response {
    let cookie_header = headers
        .get("cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    ws.on_upgrade(move |socket| handle_voice_ws(socket, state, cookie_header))
}

async fn handle_voice_ws(socket: WebSocket, state: AppState, cookie_header: String) {
    // Authenticate via session cookie
    let token = match extract_session_token(&cookie_header) {
        Some(t) => t,
        None => {
            tracing::warn!("voice_ws: no session token in cookie header");
            return;
        }
    };

    let session = match validate_session(&state.db, &token).await {
        Ok(Some(s)) => s,
        _ => {
            tracing::warn!("voice_ws: session validation failed");
            return;
        }
    };

    if session.banned {
        tracing::warn!("voice_ws: user is banned, user_id={}", session.user_id);
        return;
    }

    let user_id = session.user_id.clone();
    tracing::info!("voice_ws: connected user_id={}", user_id);

    // Split socket
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    // Register voice connection for this user
    state.ws.voice_connections.insert(user_id.clone(), tx.clone());

    // Send task: channel → WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Track the active session_id for this connection
    let mut active_session_id: Option<String> = None;

    // Receive task: WebSocket → handler
    let ws_state = state.ws.clone();
    let db = state.db.clone();
    let redis = state.redis.clone();
    let tx_clone = tx.clone();
    let user_id_clone = user_id.clone();

    let recv_task = tokio::spawn(async move {
        loop {
            match timeout(HEARTBEAT_TIMEOUT, ws_receiver.next()).await {
                Ok(Some(Ok(Message::Text(text)))) => {
                    handle_voice_message(
                        &text,
                        &user_id_clone,
                        &mut active_session_id,
                        &ws_state,
                        &db,
                        &redis,
                        &tx_clone,
                    )
                    .await;
                }
                Ok(Some(Ok(Message::Close(_)))) | Ok(None) => break,
                Ok(Some(Err(_))) => break,
                Err(_) => {
                    // Heartbeat timeout
                    break;
                }
                _ => {}
            }
        }

        // If we had an active call, end it on disconnect
        if let Some(session_id) = active_session_id {
            end_call(&db, &ws_state, &session_id, &user_id_clone, "disconnect").await;
        }
    });

    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }

    // Remove voice connection on disconnect
    tracing::info!("voice_ws: disconnected user_id={}", user_id);
    state.ws.voice_connections.remove(&user_id);
}

async fn handle_voice_message(
    text: &str,
    user_id: &str,
    active_session_id: &mut Option<String>,
    ws_state: &WsState,
    db: &PgPool,
    redis: &deadpool_redis::Pool,
    tx: &mpsc::UnboundedSender<String>,
) {
    if text.len() > 65536 {
        send_event(tx, &json!({"type": "voice_error", "error": "Message too large"}));
        return;
    }

    let event: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => {
            send_event(tx, &json!({"type": "voice_error", "error": "Invalid JSON"}));
            return;
        }
    };

    let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");

    match event_type {
        "voice_ping" => {
            send_event(tx, &json!({"type": "voice_pong"}));
        }

        "voice_offer" => {
            let conversation_id = event.get("conversationId").and_then(|v| v.as_str()).unwrap_or("");
            let agent_id_str = event.get("agentId").and_then(|v| v.as_str()).unwrap_or("");
            let target_user_id = event.get("targetUserId").and_then(|v| v.as_str()).unwrap_or("");
            let sdp = event.get("sdp").and_then(|v| v.as_str()).unwrap_or("");

            if conversation_id.is_empty() || sdp.is_empty() {
                send_event(tx, &json!({"type": "voice_error", "error": "Missing conversationId or sdp"}));
                return;
            }

            // Must have either agentId or targetUserId
            let is_h2h = !target_user_id.is_empty();
            if agent_id_str.is_empty() && target_user_id.is_empty() {
                send_event(tx, &json!({"type": "voice_error", "error": "Missing agentId or targetUserId"}));
                return;
            }

            let conv_uuid = match Uuid::parse_str(conversation_id) {
                Ok(u) => u,
                Err(_) => {
                    send_event(tx, &json!({"type": "voice_error", "error": "Invalid conversationId"}));
                    return;
                }
            };

            // Verify caller is a member of the conversation
            let is_member = sqlx::query_scalar::<_, i64>(
                r#"SELECT COUNT(*) FROM (
                    SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2
                    UNION ALL
                    SELECT 1 FROM conversation_user_members WHERE conversation_id = $1 AND user_id = $2
                ) sub"#,
            )
            .bind(conv_uuid)
            .bind(user_id)
            .fetch_one(db)
            .await
            .unwrap_or(0);

            if is_member == 0 {
                send_event(tx, &json!({"type": "voice_error", "error": "Not a member of this conversation"}));
                return;
            }

            if is_h2h {
                // === Human-to-Human call ===
                tracing::info!("voice_ws: voice_offer h2h from={} to={} conv={}", user_id, target_user_id, conversation_id);
                handle_h2h_offer(
                    user_id, target_user_id, conversation_id, conv_uuid, sdp,
                    active_session_id, ws_state, db, redis, tx,
                ).await;
            } else {
                // === Human-to-Agent call (existing flow) ===
                handle_h2a_offer(
                    user_id, agent_id_str, conversation_id, conv_uuid, sdp,
                    active_session_id, ws_state, db, tx,
                ).await;
            }
        }

        "voice_answer" => {
            let session_id = event.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
            let sdp = event.get("sdp").and_then(|v| v.as_str()).unwrap_or("");

            if session_id.is_empty() || sdp.is_empty() {
                return;
            }

            #[derive(sqlx::FromRow)]
            struct CallInfo {
                caller_id: String,
                callee_id: Option<String>,
                agent_id: Option<Uuid>,
            }

            let call = match sqlx::query_as::<_, CallInfo>(
                "SELECT caller_id, callee_id, agent_id FROM voice_calls WHERE session_id = $1",
            )
            .bind(session_id)
            .fetch_optional(db)
            .await
            {
                Ok(Some(c)) => c,
                _ => return,
            };

            // Verify the sender is a legitimate participant of this call
            let is_participant = if let Some(ref callee_id) = call.callee_id {
                // H2H: must be caller or callee
                user_id == call.caller_id || user_id == callee_id
            } else {
                // H2A: only the caller participates on the user voice WS
                user_id == call.caller_id
            };

            if !is_participant {
                send_event(tx, &json!({"type": "voice_error", "error": "Not authorized for this call"}));
                return;
            }

            // Update status to connected
            let _ = sqlx::query(
                "UPDATE voice_calls SET status = 'connected', started_at = NOW() WHERE session_id = $1 AND status = 'pending'",
            )
            .bind(session_id)
            .execute(db)
            .await;

            // Set active_session_id so disconnect cleanup works for this participant
            *active_session_id = Some(session_id.to_string());

            if let Some(ref callee_id) = call.callee_id {
                // H2H call: callee sends answer → forward to caller
                if callee_id == user_id {
                    ws_state.send_to_voice_user(&call.caller_id, &json!({
                        "type": "voice_answer",
                        "sdp": sdp,
                    }));
                    // Callee accepted → notify both sides that the call is now connected
                    ws_state.send_to_voice_user(&call.caller_id, &json!({
                        "type": "voice_call_start",
                        "sessionId": session_id,
                    }));
                    send_event(tx, &json!({
                        "type": "voice_call_start",
                        "sessionId": session_id,
                    }));
                } else if call.caller_id == user_id {
                    // Caller forwarding (shouldn't happen in H2H but handle gracefully)
                    ws_state.send_to_voice_user(callee_id, &json!({
                        "type": "voice_answer",
                        "sdp": sdp,
                    }));
                }
            } else {
                // H2A call: forward answer to caller via main WS (existing behavior)
                ws_state.send_to_user(&call.caller_id, &json!({
                    "type": "voice_answer",
                    "sdp": sdp,
                }));
            }
        }

        "voice_ice_candidate" => {
            let candidate = match event.get("candidate") {
                Some(c) => c,
                None => return,
            };

            // Use explicit sessionId if provided, otherwise fall back to active session
            let sid = event
                .get("sessionId")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(String::from)
                .or_else(|| active_session_id.clone());

            if let Some(sid) = sid {
                forward_ice_candidate(db, ws_state, user_id, &sid, candidate).await;
            }
        }

        "voice_hangup" => {
            let session_id = event
                .get("sessionId")
                .and_then(|v| v.as_str())
                .map(String::from)
                .or_else(|| active_session_id.clone());

            if let Some(sid) = session_id {
                // Verify the user is a party of this call (caller or callee)
                let is_party = sqlx::query_scalar::<_, i64>(
                    "SELECT COUNT(*) FROM voice_calls WHERE session_id = $1 AND (caller_id = $2 OR callee_id = $2)",
                )
                .bind(&sid)
                .bind(user_id)
                .fetch_one(db)
                .await
                .unwrap_or(0);

                if is_party > 0 {
                    end_call(db, ws_state, &sid, user_id, "hangup").await;
                    *active_session_id = None;
                }
            }
        }

        _ => {}
    }
}

/// Handle H2H (human-to-human) voice offer
async fn handle_h2h_offer(
    caller_id: &str,
    target_user_id: &str,
    conversation_id: &str,
    conv_uuid: Uuid,
    sdp: &str,
    active_session_id: &mut Option<String>,
    ws_state: &WsState,
    db: &PgPool,
    redis: &deadpool_redis::Pool,
    tx: &mpsc::UnboundedSender<String>,
) {
    // Verify callee is a member of the conversation
    let callee_member = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM (
            SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2
            UNION ALL
            SELECT 1 FROM conversation_user_members WHERE conversation_id = $1 AND user_id = $2
        ) sub"#,
    )
    .bind(conv_uuid)
    .bind(target_user_id)
    .fetch_one(db)
    .await
    .unwrap_or(0);

    if callee_member == 0 {
        send_event(tx, &json!({"type": "voice_error", "error": "Target user is not in this conversation"}));
        return;
    }

    // Create session ID
    let session_id = Uuid::new_v4().to_string();

    // Insert voice_calls record with callee_id
    if let Err(e) = sqlx::query(
        r#"INSERT INTO voice_calls (conversation_id, caller_id, callee_id, session_id, status)
           VALUES ($1, $2, $3, $4, 'pending')"#,
    )
    .bind(conv_uuid)
    .bind(caller_id)
    .bind(target_user_id)
    .bind(&session_id)
    .execute(db)
    .await
    {
        tracing::error!("voice_offer h2h: failed to create call record: {}", e);
        send_event(tx, &json!({"type": "voice_error", "error": "Failed to create call"}));
        return;
    }

    *active_session_id = Some(session_id.clone());

    // Look up caller display name and avatar for the notification
    #[derive(sqlx::FromRow)]
    struct UserInfo {
        name: String,
        image: Option<String>,
    }

    let caller_info = sqlx::query_as::<_, UserInfo>(
        "SELECT name, image FROM \"user\" WHERE id = $1",
    )
    .bind(caller_id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();

    let caller_name = caller_info.as_ref().map(|i| i.name.as_str()).unwrap_or("User");
    let caller_avatar = caller_info.as_ref().and_then(|i| i.image.as_deref());

    // Send incoming call notification to callee via main WS (so they see it even without voice WS)
    let incoming_event = json!({
        "type": "voice_incoming_call",
        "sessionId": &session_id,
        "callerId": caller_id,
        "callerName": caller_name,
        "callerAvatarUrl": caller_avatar,
        "conversationId": conversation_id,
        "sdp": sdp,
    });

    tracing::info!("voice_ws: sending voice_incoming_call to callee={}", target_user_id);
    ws_state.send_to_user_or_queue(target_user_id, &incoming_event, redis);

    // Notify caller that the call is ringing (not yet connected)
    send_event(tx, &json!({
        "type": "voice_ringing",
        "sessionId": &session_id,
    }));
}

/// Handle H2A (human-to-agent) voice offer (existing flow)
async fn handle_h2a_offer(
    caller_id: &str,
    agent_id_str: &str,
    conversation_id: &str,
    conv_uuid: Uuid,
    sdp: &str,
    active_session_id: &mut Option<String>,
    ws_state: &WsState,
    db: &PgPool,
    tx: &mpsc::UnboundedSender<String>,
) {
    let agent_uuid = match Uuid::parse_str(agent_id_str) {
        Ok(u) => u,
        Err(_) => {
            send_event(tx, &json!({"type": "voice_error", "error": "Invalid agentId"}));
            return;
        }
    };

    // Verify agent belongs to the conversation
    let agent_in_conv = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM (
            SELECT 1 FROM conversations WHERE id = $1 AND agent_id = $2
            UNION ALL
            SELECT 1 FROM conversation_agent_members WHERE conversation_id = $1 AND agent_id = $2
        ) sub"#,
    )
    .bind(conv_uuid)
    .bind(agent_uuid)
    .fetch_one(db)
    .await
    .unwrap_or(0);

    if agent_in_conv == 0 {
        send_event(tx, &json!({"type": "voice_error", "error": "Agent is not in this conversation"}));
        return;
    }

    // Create session ID
    let session_id = Uuid::new_v4().to_string();

    // Insert voice_calls record
    if let Err(e) = sqlx::query(
        r#"INSERT INTO voice_calls (conversation_id, caller_id, agent_id, session_id, status)
           VALUES ($1, $2, $3, $4, 'pending')"#,
    )
    .bind(conv_uuid)
    .bind(caller_id)
    .bind(agent_uuid)
    .bind(&session_id)
    .execute(db)
    .await
    {
        tracing::error!("voice_offer: failed to create call record: {}", e);
        send_event(tx, &json!({"type": "voice_error", "error": "Failed to create call"}));
        return;
    }

    *active_session_id = Some(session_id.clone());

    // Forward offer to agent
    let forwarded = ws_state.send_to_agent(agent_id_str, &json!({
        "type": "voice_offer",
        "sdp": sdp,
        "sessionId": &session_id,
        "callerId": caller_id,
        "conversationId": conversation_id,
    }));

    if forwarded {
        // Notify caller that the call is ringing
        send_event(tx, &json!({
            "type": "voice_call_start",
            "sessionId": &session_id,
        }));
    } else {
        // Agent not connected
        let _ = sqlx::query(
            "UPDATE voice_calls SET status = 'ended', end_reason = 'agent_offline', ended_at = NOW() WHERE session_id = $1",
        )
        .bind(&session_id)
        .execute(db)
        .await;

        *active_session_id = None;

        send_event(tx, &json!({
            "type": "voice_error",
            "error": "Agent is not available",
        }));
    }
}

/// Forward an ICE candidate to the other party in the call.
async fn forward_ice_candidate(
    db: &PgPool,
    ws_state: &WsState,
    sender_user_id: &str,
    session_id: &str,
    candidate: &Value,
) {
    #[derive(sqlx::FromRow)]
    struct CallParties {
        caller_id: String,
        callee_id: Option<String>,
        agent_id: Option<Uuid>,
    }

    let call = match sqlx::query_as::<_, CallParties>(
        "SELECT caller_id, callee_id, agent_id FROM voice_calls WHERE session_id = $1",
    )
    .bind(session_id)
    .fetch_optional(db)
    .await
    {
        Ok(Some(c)) => c,
        _ => return,
    };

    let ice_event = json!({
        "type": "voice_ice_candidate",
        "sessionId": session_id,
        "candidate": candidate,
    });

    if let Some(ref callee_id) = call.callee_id {
        // H2H call: forward ICE to the other party via voice WS
        if sender_user_id == call.caller_id {
            ws_state.send_to_voice_user(callee_id, &ice_event);
        } else if sender_user_id == callee_id {
            ws_state.send_to_voice_user(&call.caller_id, &ice_event);
        }
    } else if let Some(agent_id) = call.agent_id {
        // H2A call: caller → agent
        if sender_user_id == call.caller_id {
            ws_state.send_to_agent(&agent_id.to_string(), &ice_event);
        }
    }
}

/// End a voice call: update DB and notify the other party.
async fn end_call(
    db: &PgPool,
    ws_state: &WsState,
    session_id: &str,
    initiator_user_id: &str,
    reason: &str,
) {
    // Update the call record
    let _ = sqlx::query(
        r#"UPDATE voice_calls
           SET status = 'ended',
               ended_at = NOW(),
               end_reason = $2,
               duration_seconds = CASE
                   WHEN started_at IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
                   ELSE NULL
               END
           WHERE session_id = $1 AND status != 'ended'"#,
    )
    .bind(session_id)
    .bind(reason)
    .execute(db)
    .await;

    // Notify the other party
    #[derive(sqlx::FromRow)]
    struct CallParties {
        caller_id: String,
        callee_id: Option<String>,
        agent_id: Option<Uuid>,
    }

    if let Ok(Some(call)) = sqlx::query_as::<_, CallParties>(
        "SELECT caller_id, callee_id, agent_id FROM voice_calls WHERE session_id = $1",
    )
    .bind(session_id)
    .fetch_optional(db)
    .await
    {
        let end_event = json!({
            "type": "voice_call_end",
            "sessionId": session_id,
            "reason": reason,
        });

        if let Some(ref callee_id) = call.callee_id {
            // H2H call: notify the other user
            if call.caller_id == initiator_user_id {
                // Initiator is the caller → notify callee via voice WS and main WS
                ws_state.send_to_voice_user(callee_id, &end_event);
                ws_state.send_to_user(callee_id, &end_event);
            } else {
                // Initiator is the callee → notify caller via voice WS and main WS
                ws_state.send_to_voice_user(&call.caller_id, &end_event);
                ws_state.send_to_user(&call.caller_id, &end_event);
            }
        } else if let Some(agent_id) = call.agent_id {
            // H2A call
            if call.caller_id == initiator_user_id {
                // Initiator is the caller → notify agent
                ws_state.send_to_agent(&agent_id.to_string(), &end_event);
            } else {
                // Initiator is the agent → notify caller
                ws_state.send_to_user(&call.caller_id, &end_event);
            }
        }
    }
}

fn extract_session_token(cookie_header: &str) -> Option<String> {
    for cookie in cookie_header.split(';') {
        let cookie = cookie.trim();
        if let Some(value) = cookie.strip_prefix("better-auth.session_token=") {
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn send_event(tx: &mpsc::UnboundedSender<String>, event: &Value) {
    let msg = serde_json::to_string(event).unwrap_or_default();
    let _ = tx.send(msg);
}
