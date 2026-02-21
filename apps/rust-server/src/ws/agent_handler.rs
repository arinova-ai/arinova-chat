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
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};

use crate::ws::state::{AgentEvent, AgentSkill, PendingTask, WsState};
use crate::AppState;

const AUTH_TIMEOUT: Duration = Duration::from_secs(10);
const TASK_IDLE_TIMEOUT: Duration = Duration::from_secs(600);

pub fn router() -> Router<AppState> {
    Router::new().route("/ws/agent", get(agent_ws_upgrade))
}

async fn agent_ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    ws.on_upgrade(move |socket| handle_agent_ws(socket, state))
}

async fn handle_agent_ws(socket: WebSocket, state: AppState) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

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
    let mut authenticated_agent_id: Option<String> = None;

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
                let agent = sqlx::query_as::<_, (String, String)>(
                    r#"SELECT id::text, name FROM agents WHERE secret_token = $1"#,
                )
                .bind(bot_token)
                .fetch_optional(&state.db)
                .await;

                match agent {
                    Ok(Some((agent_id, agent_name))) => {
                        // Close any existing connection for this agent
                        if let Some((_, old_sender)) = state.ws.agent_connections.remove(&agent_id) {
                            // The old connection will close when sender is dropped
                            drop(old_sender);
                        }

                        // Parse skills
                        let skills: Vec<AgentSkill> = event
                            .get("skills")
                            .and_then(|v| serde_json::from_value(v.clone()).ok())
                            .unwrap_or_default();

                        state.ws.agent_connections.insert(agent_id.clone(), tx.clone());
                        state.ws.agent_skills.insert(agent_id.clone(), skills.clone());

                        let _ = tx.send(serde_json::to_string(&json!({
                            "type": "auth_ok",
                            "agentName": agent_name
                        })).unwrap());

                        tracing::info!(
                            "Agent WS connected: agentId={} name=\"{}\" skills={}",
                            agent_id, agent_name, skills.len()
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

    authenticated_agent_id = Some(agent_id.clone());

    // Process authenticated messages
    let ws_state = state.ws.clone();
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

                    if let Some((_, task)) = ws_state.pending_tasks.remove(task_id) {
                        if task.agent_id == agent_id_clone {
                            task.timeout_handle.abort();
                            let _ = task.chunk_tx.send(AgentEvent::Complete(content.to_string()));
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
                _ => {}
            }
        }
    });

    // Wait for either task to complete
    tokio::select! {
        _ = send_task => {},
        _ = recv_task => {},
    }

    // Cleanup
    if let Some(agent_id) = authenticated_agent_id {
        // Only remove if this is still the registered connection
        // (check by seeing if the sender matches)
        state.ws.agent_connections.remove(&agent_id);
        state.ws.agent_skills.remove(&agent_id);
        cleanup_agent_tasks(&state.ws, &agent_id);
        tracing::info!("Agent WS disconnected: agentId={}", agent_id);
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
}

/// Send a task to a connected agent. Returns a receiver for streaming events.
pub fn send_task_to_agent(
    ws_state: &WsState,
    agent_id: &str,
    task_id: &str,
    conversation_id: &str,
    content: &str,
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

    // Send task to agent
    ws_state.send_to_agent(agent_id, &json!({
        "type": "task",
        "taskId": task_id,
        "conversationId": conversation_id,
        "content": content
    }));

    Some(event_rx)
}
