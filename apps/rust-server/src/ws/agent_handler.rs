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

use crate::services::message_seq::get_next_seq;
use crate::ws::handler::{filter_agents_for_dispatch, AgentFilterConfig, do_trigger_agent_response, get_conv_member_ids};
use crate::ws::state::{AgentEvent, AgentSkill, PendingTask, QueuedResponse, WsState};
use crate::AppState;

const AUTH_TIMEOUT: Duration = Duration::from_secs(10);
const TASK_IDLE_TIMEOUT: Duration = Duration::from_secs(600);

pub fn router() -> Router<AppState> {
    Router::new().route("/ws/agent", get(agent_ws_upgrade))
}

async fn agent_ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Response {
    // Extract client IP before upgrade (headers unavailable after upgrade)
    let client_ip = headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|xff| xff.split(',').next())
        .map(|s| s.trim().to_string())
        .or_else(|| {
            headers.get("x-real-ip")
                .and_then(|v| v.to_str().ok())
                .map(|s| s.trim().to_string())
        });

    ws.on_upgrade(move |socket| handle_agent_ws(socket, state, client_ip))
}

async fn handle_agent_ws(socket: WebSocket, state: AppState, client_ip: Option<String>) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Unique ID for this connection — used to avoid cleanup race conditions on reconnect
    let conn_id = uuid::Uuid::new_v4().to_string();

    // Create channel for sending messages to this WebSocket
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    // Spawn task to forward messages from channel to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Wait for authentication within timeout
    let auth_result = timeout(AUTH_TIMEOUT, async {
        while let Some(Ok(Message::Text(text))) = ws_receiver.next().await {
            let event: Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");

            if event_type == "ping" {
                let _ = tx.send(serde_json::to_string(&json!({"type": "pong"})).unwrap());
                continue;
            }

            if event_type == "agent_auth" {
                let bot_token = event.get("botToken").and_then(|v| v.as_str()).unwrap_or("");

                // Look up agent by botToken (secret_token)
                let agent = sqlx::query_as::<_, (String, String, String)>(
                    r#"SELECT id::text, name, owner_id FROM agents WHERE secret_token = $1"#,
                )
                .bind(bot_token)
                .fetch_optional(&state.db)
                .await;

                match agent {
                    Ok(Some((agent_id, agent_name, owner_id))) => {
                        // IP Whitelist check
                        let wl_enabled = crate::routes::user_settings::is_ip_whitelist_enabled(
                            &state.db, &owner_id,
                        ).await.unwrap_or(false);

                        if wl_enabled {
                            let ip_str = client_ip.as_deref().unwrap_or("");
                            let allowed = if ip_str.is_empty() {
                                false // Can't determine IP → reject
                            } else {
                                crate::routes::user_settings::check_ip_whitelist(
                                    &state.db, &owner_id, ip_str,
                                ).await.unwrap_or(false)
                            };

                            if !allowed {
                                let _ = sqlx::query(
                                    r#"INSERT INTO agent_security_logs (agent_id, event_type, details)
                                       VALUES ($1::uuid, 'ip_blocked', $2)"#,
                                )
                                .bind(&agent_id)
                                .bind(json!({"ip": client_ip.as_deref(), "agent_name": &agent_name, "source": "websocket"}))
                                .execute(&state.db)
                                .await;

                                tracing::warn!(
                                    "Agent WS REJECTED (IP whitelist): agent={} ip={:?}",
                                    agent_id, client_ip
                                );
                                let _ = tx.send(serde_json::to_string(&json!({
                                    "type": "auth_error",
                                    "error": "IP address not in whitelist"
                                })).unwrap());
                                return None;
                            }
                        }

                        // Close any existing connection for this agent
                        if let Some((_, (_, old_sender))) = state.ws.agent_connections.remove(&agent_id) {
                            // The old connection will close when sender is dropped
                            drop(old_sender);
                        }

                        // Parse skills
                        let skills: Vec<AgentSkill> = event
                            .get("skills")
                            .and_then(|v| serde_json::from_value(v.clone()).ok())
                            .unwrap_or_default();

                        state.ws.agent_connections.insert(agent_id.clone(), (conn_id.clone(), tx.clone()));
                        if let Some(ref ip) = client_ip {
                            state.ws.agent_connection_ips.insert(agent_id.clone(), ip.clone());
                        }
                        state.ws.agent_skills.insert(agent_id.clone(), skills.clone());

                        // Clean up stale streaming messages for this agent
                        // Match by sender_agent_id (group) or conversation.agent_id (direct)
                        let cleanup = sqlx::query(
                            r#"UPDATE messages m SET status = 'error',
                                content = CASE WHEN m.content = '' THEN 'Agent reconnected' ELSE m.content END,
                                updated_at = NOW()
                               FROM conversations c
                               WHERE m.conversation_id = c.id
                                 AND m.status = 'streaming'
                                 AND m.role = 'agent'
                                 AND (m.sender_agent_id = $1::uuid OR (c.type IN ('direct', 'h2a') AND c.agent_id = $1::uuid))"#,
                        )
                        .bind(&agent_id)
                        .execute(&state.db)
                        .await;
                        if let Ok(result) = cleanup {
                            if result.rows_affected() > 0 {
                                tracing::info!("Cleaned up {} stale streaming messages for agent {}", result.rows_affected(), agent_id);
                            }
                        }

                        // Auto-install official platform skills
                        let platform_skills = sqlx::query_as::<_, (String,)>(
                            "SELECT id::text FROM skills WHERE is_official = true AND category = 'platform'"
                        )
                        .fetch_all(&state.db)
                        .await
                        .unwrap_or_default();

                        for (skill_id,) in &platform_skills {
                            let _ = sqlx::query(
                                "INSERT INTO agent_skills (agent_id, skill_id, is_enabled) VALUES ($1::uuid, $2::uuid, true) ON CONFLICT DO NOTHING"
                            )
                            .bind(&agent_id)
                            .bind(skill_id)
                            .execute(&state.db)
                            .await;
                        }

                        let _ = tx.send(serde_json::to_string(&json!({
                            "type": "auth_ok",
                            "agentName": agent_name
                        })).unwrap());

                        tracing::info!(
                            "Agent WS connected: agentId={} name=\"{}\" skills={} platform_skills={}",
                            agent_id, agent_name, skills.len(), platform_skills.len()
                        );

                        return Some(agent_id);
                    }
                    _ => {
                        let _ = tx.send(serde_json::to_string(&json!({
                            "type": "auth_error",
                            "error": "Invalid bot token"
                        })).unwrap());
                        return None;
                    }
                }
            }
        }
        None
    })
    .await;

    let agent_id = match auth_result {
        Ok(Some(id)) => id,
        Ok(None) => return,
        Err(_) => {
            let _ = tx.send(serde_json::to_string(&json!({
                "type": "auth_error",
                "error": "Authentication timeout"
            })).unwrap());
            return;
        }
    };

    // Process authenticated messages
    let ws_state = state.ws.clone();
    let db = state.db.clone();
    let redis = state.redis.clone();
    let config = state.config.clone();
    let agent_id_clone = agent_id.clone();

    let recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            let text = match msg {
                Message::Text(t) => t.to_string(),
                Message::Close(_) => break,
                _ => continue,
            };

            let event: Value = match serde_json::from_str(&text) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");

            match event_type {
                "ping" => {
                    let _ = tx.send(serde_json::to_string(&json!({"type": "pong"})).unwrap());
                }
                "agent_chunk" => {
                    let task_id = event.get("taskId").and_then(|v| v.as_str()).unwrap_or("");
                    let chunk = event.get("chunk").and_then(|v| v.as_str()).unwrap_or("");

                    if let Some(mut task) = ws_state.pending_tasks.get_mut(task_id) {
                        if task.agent_id == agent_id_clone {
                            let incoming = chunk.to_string();

                            // Auto-detect accumulated vs delta mode
                            if !task.accumulated.is_empty() && incoming.starts_with(&task.accumulated) {
                                // Accumulated mode: extract only the new portion
                                let delta = incoming[task.accumulated.len()..].to_string();
                                task.accumulated = incoming;
                                if !delta.is_empty() {
                                    let _ = task.chunk_tx.send(AgentEvent::Chunk(delta));
                                }
                            } else {
                                // Delta mode: forward directly
                                task.accumulated.push_str(&incoming);
                                let _ = task.chunk_tx.send(AgentEvent::Chunk(incoming));
                            }

                            // Reset idle timeout
                            task.timeout_handle.abort();
                            let ws_state_clone = ws_state.clone();
                            let task_id_str = task_id.to_string();
                            task.timeout_handle = tokio::spawn(async move {
                                tokio::time::sleep(TASK_IDLE_TIMEOUT).await;
                                cleanup_task(&ws_state_clone, &task_id_str, Some("Task timed out (idle for 600s)"));
                            });
                        }
                    }
                }
                "agent_complete" => {
                    let task_id = event.get("taskId").and_then(|v| v.as_str()).unwrap_or("");
                    let content = event.get("content").and_then(|v| v.as_str()).unwrap_or("");
                    let mentions: Vec<String> = event
                        .get("mentions")
                        .and_then(|v| v.as_array())
                        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                        .unwrap_or_default();

                    if let Some((_, task)) = ws_state.pending_tasks.remove(task_id) {
                        if task.agent_id == agent_id_clone {
                            task.timeout_handle.abort();
                            let _ = task.chunk_tx.send(AgentEvent::Complete(content.to_string(), mentions));
                        }
                    }
                }
                "agent_error" => {
                    let task_id = event.get("taskId").and_then(|v| v.as_str()).unwrap_or("");
                    let error = event.get("error").and_then(|v| v.as_str()).unwrap_or("Unknown error");

                    if let Some((_, task)) = ws_state.pending_tasks.remove(task_id) {
                        if task.agent_id == agent_id_clone {
                            task.timeout_handle.abort();
                            let _ = task.chunk_tx.send(AgentEvent::Error(error.to_string()));
                        }
                    }
                }
                "agent_heartbeat" => {
                    let task_id = event.get("taskId").and_then(|v| v.as_str()).unwrap_or("");

                    if let Some(mut task) = ws_state.pending_tasks.get_mut(task_id) {
                        if task.agent_id == agent_id_clone {
                            // Reset idle timeout — agent is still working
                            task.timeout_handle.abort();
                            let ws_state_clone = ws_state.clone();
                            let task_id_str = task_id.to_string();
                            task.timeout_handle = tokio::spawn(async move {
                                tokio::time::sleep(TASK_IDLE_TIMEOUT).await;
                                cleanup_task(&ws_state_clone, &task_id_str, Some("Task timed out (idle for 600s)"));
                            });
                        }
                    }
                }
                "agent_send" => {
                    let conversation_id = event.get("conversationId").and_then(|v| v.as_str()).unwrap_or("");
                    let content = event.get("content").and_then(|v| v.as_str()).unwrap_or("");

                    if conversation_id.is_empty() || content.trim().is_empty() {
                        tracing::warn!("agent_send: empty conversationId or content from agent {}", agent_id_clone);
                        continue;
                    }

                    tracing::info!("agent_send: agentId={} conversationId={} contentLen={}", agent_id_clone, conversation_id, content.len());

                    // Validate agent belongs to this conversation and get user_id
                    let membership = sqlx::query_as::<_, (String, String)>(
                        r#"SELECT c.user_id, c.type::text
                           FROM conversations c
                           WHERE c.id = $1::uuid
                             AND (
                               c.agent_id = $2::uuid
                               OR EXISTS (
                                 SELECT 1 FROM conversation_members cm
                                 WHERE cm.conversation_id = c.id AND cm.agent_id = $2::uuid
                               )
                             )"#,
                    )
                    .bind(conversation_id)
                    .bind(&agent_id_clone)
                    .fetch_optional(&db)
                    .await;

                    let (user_id, _conv_type) = match membership {
                        Ok(Some(m)) => m,
                        Ok(None) => {
                            tracing::warn!("agent_send: agent {} is not a member of conversation {}", agent_id_clone, conversation_id);
                            continue;
                        }
                        Err(e) => {
                            tracing::error!("agent_send: DB error checking membership: {}", e);
                            continue;
                        }
                    };

                    // Get agent name
                    let agent_name = sqlx::query_as::<_, (String,)>(
                        r#"SELECT name FROM agents WHERE id = $1::uuid"#,
                    )
                    .bind(&agent_id_clone)
                    .fetch_optional(&db)
                    .await
                    .ok()
                    .flatten()
                    .map(|r| r.0)
                    .unwrap_or_else(|| "Agent".to_string());

                    // Create message in DB
                    let seq = match get_next_seq(&db, conversation_id).await {
                        Ok(s) => s,
                        Err(_) => continue,
                    };

                    let msg_id = uuid::Uuid::new_v4().to_string();
                    let _ = sqlx::query(
                        r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_agent_id, created_at, updated_at)
                           VALUES ($1::uuid, $2::uuid, $3, 'agent', $4, 'completed', $5::uuid, NOW(), NOW())"#,
                    )
                    .bind(&msg_id)
                    .bind(conversation_id)
                    .bind(seq)
                    .bind(content)
                    .bind(&agent_id_clone)
                    .execute(&db)
                    .await;

                    let _ = sqlx::query(
                        r#"UPDATE conversations SET updated_at = NOW() WHERE id = $1::uuid"#,
                    )
                    .bind(conversation_id)
                    .execute(&db)
                    .await;

                    tracing::info!("agent_send: delivered msgId={} seq={} to user {}", msg_id, seq, user_id);

                    let stream_start = json!({
                        "type": "stream_start",
                        "conversationId": conversation_id,
                        "messageId": msg_id,
                        "seq": seq,
                        "senderAgentId": &agent_id_clone,
                        "senderAgentName": agent_name
                    });
                    let stream_end = json!({
                        "type": "stream_end",
                        "conversationId": conversation_id,
                        "messageId": msg_id,
                        "seq": seq,
                        "content": content,
                        "senderAgentId": &agent_id_clone,
                        "senderAgentName": agent_name,
                        "reason": "agent_send"
                    });

                    if _conv_type == "group" {
                        // Broadcast to all user members in the group
                        let member_ids = get_conv_member_ids(&ws_state, &db, conversation_id, "").await;
                        ws_state.broadcast_to_members(&member_ids, &stream_start, &redis);
                        ws_state.broadcast_to_members(&member_ids, &stream_end, &redis);
                    } else {
                        // Direct conversation: send to the owner only
                        ws_state.send_to_user_or_queue(&user_id, &stream_start, &redis);
                        ws_state.send_to_user_or_queue(&user_id, &stream_end, &redis);
                    }

                    // Dispatch to other agents in the conversation (excluding sender)
                    let other_agents: Vec<String> = sqlx::query_as::<_, (String,)>(
                        r#"SELECT agent_id::text FROM conversation_members
                           WHERE conversation_id = $1::uuid AND agent_id IS NOT NULL AND agent_id != $2::uuid"#,
                    )
                    .bind(conversation_id)
                    .bind(&agent_id_clone)
                    .fetch_all(&db)
                    .await
                    .unwrap_or_default()
                    .into_iter()
                    .map(|(id,)| id)
                    .collect();

                    if !other_agents.is_empty() {
                        // Build agent filter configs for listen_mode filtering
                        let mention_only = false;
                        // Extract mentions from content (e.g. @agentId patterns)
                        let mentions: Vec<String> = vec![];

                        let mut agent_configs = Vec::new();
                        for aid in &other_agents {
                            let agent_perms = sqlx::query_as::<_, (String, Option<String>)>(
                                r#"SELECT listen_mode::text, owner_user_id FROM conversation_members
                                   WHERE conversation_id = $1::uuid AND agent_id = $2::uuid"#,
                            )
                            .bind(conversation_id)
                            .bind(aid)
                            .fetch_optional(&db)
                            .await;

                            if let Ok(Some((listen_mode, owner_id))) = agent_perms {
                                let allowed_user_ids = if matches!(listen_mode.as_str(), "owner_and_allowlist" | "allowlist_mentions" | "allowed_users") {
                                    sqlx::query_as::<_, (String,)>(
                                        r#"SELECT user_id FROM agent_listen_allowed_users
                                           WHERE agent_id = $1::uuid AND conversation_id = $2::uuid"#,
                                    )
                                    .bind(aid)
                                    .bind(conversation_id)
                                    .fetch_all(&db)
                                    .await
                                    .unwrap_or_default()
                                    .into_iter()
                                    .map(|(uid,)| uid)
                                    .collect()
                                } else {
                                    vec![]
                                };

                                agent_configs.push(AgentFilterConfig {
                                    agent_id: aid.clone(),
                                    listen_mode,
                                    owner_user_id: owner_id.unwrap_or_default(),
                                    allowed_user_ids,
                                });
                            }
                        }

                        // For agent-sent messages in groups, sender is the agent's owner for listen_mode purposes
                        let dispatch_ids = filter_agents_for_dispatch(
                            mention_only,
                            &_conv_type,
                            &user_id, // use agent owner as "sender" for listen mode checks
                            &mentions,
                            &agent_configs,
                        );

                        let config_clone = config.clone();
                        for dispatch_agent_id in dispatch_ids {
                            if ws_state.has_active_stream_for_agent(conversation_id, &dispatch_agent_id) {
                                let queue_key = format!("{}:{}", conversation_id, dispatch_agent_id);
                                ws_state
                                    .agent_response_queues
                                    .entry(queue_key)
                                    .or_insert_with(std::collections::VecDeque::new)
                                    .push_back(QueuedResponse {
                                        user_id: user_id.clone(),
                                        conversation_id: conversation_id.to_string(),
                                        agent_id: dispatch_agent_id.clone(),
                                        content: content.to_string(),
                                        reply_to_id: None,
                                        thread_id: None,
                                        user_message_id: Some(msg_id.clone()),
                                        metadata: None,
                                    });
                                continue;
                            }

                            do_trigger_agent_response(
                                &user_id,
                                &dispatch_agent_id,
                                conversation_id,
                                content,
                                None,
                                None,
                                &_conv_type,
                                None,
                                &ws_state,
                                &db,
                                &redis,
                                &config_clone,
                            )
                            .await;
                        }
                    }
                }
                "hud_update" => {
                    let conversation_id = event.get("conversationId").and_then(|v| v.as_str()).unwrap_or("");
                    let data = event.get("data").cloned().unwrap_or(json!({}));

                    if conversation_id.is_empty() {
                        tracing::warn!("hud_update: empty conversationId from agent {}", agent_id_clone);
                        continue;
                    }

                    // Verify agent is a member of this conversation
                    let membership = sqlx::query_as::<_, (String,)>(
                        r#"SELECT c.user_id
                           FROM conversations c
                           WHERE c.id = $1::uuid
                             AND (
                               c.agent_id = $2::uuid
                               OR EXISTS (
                                 SELECT 1 FROM conversation_members cm
                                 WHERE cm.conversation_id = c.id AND cm.agent_id = $2::uuid
                               )
                             )"#,
                    )
                    .bind(conversation_id)
                    .bind(&agent_id_clone)
                    .fetch_optional(&db)
                    .await;

                    let user_id = match membership {
                        Ok(Some((uid,))) => uid,
                        Ok(None) => {
                            tracing::warn!("hud_update: agent {} is not a member of conversation {}", agent_id_clone, conversation_id);
                            continue;
                        }
                        Err(e) => {
                            tracing::error!("hud_update: DB error checking membership: {}", e);
                            continue;
                        }
                    };

                    tracing::info!("hud_update: agentId={} conversationId={}", agent_id_clone, conversation_id);

                    // Forward HUD data to conversation owner — no DB persistence
                    ws_state.send_to_user_or_queue(&user_id, &json!({
                        "type": "hud_update",
                        "conversationId": conversation_id,
                        "data": data
                    }), &redis);
                }
                "agent_telemetry" => {
                    let telemetry_event = event.get("event").and_then(|v| v.as_str()).unwrap_or("");
                    let data = event.get("data").cloned().unwrap_or(json!({}));

                    match telemetry_event {
                        "session_start" => {
                            let session_id = data.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
                            let model = data.get("model").and_then(|v| v.as_str());
                            let provider = data.get("provider").and_then(|v| v.as_str());

                            let _ = sqlx::query(
                                r#"INSERT INTO agent_sessions (agent_id, session_id, model, provider)
                                   VALUES ($1::uuid, $2, $3, $4)"#,
                            )
                            .bind(&agent_id_clone)
                            .bind(session_id)
                            .bind(model)
                            .bind(provider)
                            .execute(&db)
                            .await;
                        }
                        "session_end" => {
                            let session_id = data.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
                            let message_count = data.get("messageCount").and_then(|v| v.as_i64()).map(|v| v as i32);
                            let duration_ms = data.get("durationMs").and_then(|v| v.as_i64());

                            let _ = sqlx::query(
                                r#"UPDATE agent_sessions
                                   SET ended_at = NOW(), message_count = COALESCE($3, message_count), duration_ms = $4
                                   WHERE agent_id = $1::uuid AND session_id = $2
                                     AND ended_at IS NULL"#,
                            )
                            .bind(&agent_id_clone)
                            .bind(session_id)
                            .bind(message_count)
                            .bind(duration_ms)
                            .execute(&db)
                            .await;
                        }
                        "llm_output" => {
                            let session_id = data.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
                            let model = data.get("model").and_then(|v| v.as_str());
                            let provider = data.get("provider").and_then(|v| v.as_str());
                            let usage = data.get("usage").cloned().unwrap_or(json!({}));

                            let _ = sqlx::query(
                                r#"INSERT INTO agent_token_usage (agent_id, session_id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, model, provider)
                                   VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)"#,
                            )
                            .bind(&agent_id_clone)
                            .bind(session_id)
                            .bind(usage.get("input").and_then(|v| v.as_i64()).unwrap_or(0) as i32)
                            .bind(usage.get("output").and_then(|v| v.as_i64()).unwrap_or(0) as i32)
                            .bind(usage.get("cacheRead").and_then(|v| v.as_i64()).unwrap_or(0) as i32)
                            .bind(usage.get("cacheWrite").and_then(|v| v.as_i64()).unwrap_or(0) as i32)
                            .bind(usage.get("total").and_then(|v| v.as_i64()).unwrap_or(0) as i32)
                            .bind(model)
                            .bind(provider)
                            .execute(&db)
                            .await;
                        }
                        "tool_call" => {
                            let session_id = data.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
                            let tool_name = data.get("toolName").and_then(|v| v.as_str()).unwrap_or("");
                            let duration_ms = data.get("durationMs").and_then(|v| v.as_i64());
                            let success = data.get("success").and_then(|v| v.as_bool()).unwrap_or(true);
                            let error = data.get("error").and_then(|v| v.as_str());

                            let _ = sqlx::query(
                                r#"INSERT INTO agent_tool_logs (agent_id, session_id, tool_name, duration_ms, success, error)
                                   VALUES ($1::uuid, $2, $3, $4, $5, $6)"#,
                            )
                            .bind(&agent_id_clone)
                            .bind(session_id)
                            .bind(tool_name)
                            .bind(duration_ms)
                            .bind(success)
                            .bind(error)
                            .execute(&db)
                            .await;
                        }
                        "compaction" => {
                            let session_id = data.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
                            let message_count = data.get("messageCount").and_then(|v| v.as_i64()).map(|v| v as i32);
                            let compacted_count = data.get("compactedCount").and_then(|v| v.as_i64()).map(|v| v as i32);
                            let token_count = data.get("tokenCount").and_then(|v| v.as_i64()).map(|v| v as i32);

                            let _ = sqlx::query(
                                r#"INSERT INTO agent_compaction_logs (agent_id, session_id, message_count, compacted_count, token_count)
                                   VALUES ($1::uuid, $2, $3, $4, $5)"#,
                            )
                            .bind(&agent_id_clone)
                            .bind(session_id)
                            .bind(message_count)
                            .bind(compacted_count)
                            .bind(token_count)
                            .execute(&db)
                            .await;
                        }
                        "agent_end" => {
                            // Update the session with final stats
                            let session_id = data.get("sessionId").and_then(|v| v.as_str()).unwrap_or("");
                            let duration_ms = data.get("durationMs").and_then(|v| v.as_i64());

                            let _ = sqlx::query(
                                r#"UPDATE agent_sessions
                                   SET ended_at = NOW(), duration_ms = COALESCE($3, duration_ms)
                                   WHERE agent_id = $1::uuid AND session_id = $2
                                     AND ended_at IS NULL"#,
                            )
                            .bind(&agent_id_clone)
                            .bind(session_id)
                            .bind(duration_ms)
                            .execute(&db)
                            .await;
                        }
                        _ => {
                            tracing::debug!("Unknown telemetry event: {}", telemetry_event);
                        }
                    }
                }
                _ => {}
            }
        }
    });

    // Wait for either task to complete
    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }

    // Cleanup — only if this is still the registered connection (not superseded by a reconnect)
    {
        let is_current = state.ws.agent_connections
            .get(&agent_id)
            .map(|entry| entry.0 == conn_id)
            .unwrap_or(false);

        if is_current {
            state.ws.agent_connections.remove(&agent_id);
            state.ws.agent_connection_ips.remove(&agent_id);
            state.ws.agent_skills.remove(&agent_id);
            cleanup_agent_tasks(&state.ws, &agent_id);

            // End any active voice calls for this agent
            cleanup_agent_voice_calls(&state.db, &state.ws, &agent_id).await;

            tracing::info!("Agent WS disconnected: agentId={}", agent_id);
        } else {
            tracing::info!("Agent WS closed (superseded by reconnect): agentId={}", agent_id);
        }
    }
}

fn cleanup_task(ws_state: &WsState, task_id: &str, error_message: Option<&str>) {
    if let Some((_, task)) = ws_state.pending_tasks.remove(task_id) {
        task.timeout_handle.abort();
        if let Some(err) = error_message {
            let _ = task.chunk_tx.send(AgentEvent::Error(err.to_string()));
        }
    }
}

fn cleanup_agent_tasks(ws_state: &WsState, agent_id: &str) {
    let task_ids: Vec<String> = ws_state
        .pending_tasks
        .iter()
        .filter(|entry| entry.agent_id == agent_id)
        .map(|entry| entry.key().clone())
        .collect();

    for task_id in task_ids {
        cleanup_task(ws_state, &task_id, Some("Agent disconnected"));
    }

    // Clean up stale active_streams entries for this agent
    let suffix = format!(":{}", agent_id);
    let stale_keys: Vec<String> = ws_state
        .active_streams
        .iter()
        .filter(|entry| entry.key().ends_with(&suffix))
        .map(|entry| entry.key().clone())
        .collect();

    for key in &stale_keys {
        ws_state.active_streams.remove(key);
    }
    if !stale_keys.is_empty() {
        tracing::info!(
            "Cleaned up {} stale active_streams for agent {}",
            stale_keys.len(),
            agent_id
        );
    }
}

/// End any active voice calls involving this agent and notify the callers.
async fn cleanup_agent_voice_calls(db: &PgPool, ws_state: &WsState, agent_id: &str) {
    let agent_uuid = match uuid::Uuid::parse_str(agent_id) {
        Ok(u) => u,
        Err(_) => return,
    };

    // Find active voice calls for this agent
    #[derive(sqlx::FromRow)]
    struct ActiveCall {
        session_id: String,
        caller_id: String,
    }

    let calls = sqlx::query_as::<_, ActiveCall>(
        "SELECT session_id, caller_id FROM voice_calls WHERE agent_id = $1 AND status IN ('pending', 'connected')",
    )
    .bind(agent_uuid)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    if calls.is_empty() {
        return;
    }

    // End all active calls
    let _ = sqlx::query(
        r#"UPDATE voice_calls
           SET status = 'ended', ended_at = NOW(), end_reason = 'agent_disconnect',
               duration_seconds = CASE WHEN started_at IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER ELSE NULL END
           WHERE agent_id = $1 AND status IN ('pending', 'connected')"#,
    )
    .bind(agent_uuid)
    .execute(db)
    .await;

    // Notify each caller
    for call in &calls {
        ws_state.send_to_user(&call.caller_id, &serde_json::json!({
            "type": "voice_call_end",
            "sessionId": &call.session_id,
            "reason": "agent_disconnect",
        }));
    }

    tracing::info!("Cleaned up {} active voice calls for agent {}", calls.len(), agent_id);
}

/// Send a task to a connected agent. Returns a receiver for streaming events.
pub fn send_task_to_agent(
    ws_state: &WsState,
    agent_id: &str,
    task_id: &str,
    task_payload: &Value,
) -> Option<mpsc::UnboundedReceiver<AgentEvent>> {
    if !ws_state.is_agent_connected(agent_id) {
        return None;
    }

    let (event_tx, event_rx) = mpsc::unbounded_channel();

    // Set up idle timeout
    let ws_state_clone = ws_state.clone();
    let task_id_str = task_id.to_string();
    let timeout_handle = tokio::spawn(async move {
        tokio::time::sleep(TASK_IDLE_TIMEOUT).await;
        cleanup_task(&ws_state_clone, &task_id_str, Some("Task timed out (idle for 600s)"));
    });

    ws_state.pending_tasks.insert(
        task_id.to_string(),
        PendingTask {
            agent_id: agent_id.to_string(),
            accumulated: String::new(),
            chunk_tx: event_tx,
            timeout_handle,
        },
    );

    // Send full task payload to agent
    ws_state.send_to_agent(agent_id, task_payload);

    Some(event_rx)
}
