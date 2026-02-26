use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::Response,
    routing::get,
    Router,
};
use deadpool_redis::redis::AsyncCommands;
use futures::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sqlx::PgPool;
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};

use crate::auth::session::validate_session;
use crate::services::message_seq::get_next_seq;
use crate::services::pending_events::{clear_pending_events, get_pending_events};
use crate::services::push::send_push_to_user;
use crate::services::push_trigger::{is_conversation_muted, should_send_push};
use crate::ws::agent_handler::send_task_to_agent;
use crate::ws::state::{QueuedResponse, WsState};
use crate::AppState;

// ---------- Two-layer agent dispatch filter (pure, testable) ----------

/// Per-agent configuration used by the dispatch filter.
#[derive(Debug, Clone)]
pub struct AgentFilterConfig {
    pub agent_id: String,
    /// One of "owner_only", "allowed_users", "all_mentions".
    pub listen_mode: String,
    pub owner_user_id: String,
    pub allowed_user_ids: Vec<String>,
}

/// Pure function implementing the two-layer filtering logic for agent dispatch.
///
/// Layer 1 (conversation-level): `mention_only`
///   - `false` -> ALL agents receive ALL messages (listen_mode ignored).
///   - `true`  -> only agents that are @mentioned (or `__all__`) proceed to Layer 2.
///
/// Layer 2 (per-agent): `listen_mode`
///   - `"owner_only"`    -> only the agent's owner can trigger it.
///   - `"allowed_users"` -> owner + whitelisted users can trigger it.
///   - `"all_mentions"`  -> any @mention triggers it.
///
/// For non-group conversations the function always returns all agent IDs
/// (direct conversations always dispatch).
pub fn filter_agents_for_dispatch(
    mention_only: bool,
    conv_type: &str,
    sender_user_id: &str,
    mentions: &[String],
    agents: &[AgentFilterConfig],
) -> Vec<String> {
    let agent_ids: Vec<String> = agents.iter().map(|a| a.agent_id.clone()).collect();

    if !mention_only {
        // Layer 1: mention_only=false -> ALL agents hear ALL messages
        return agent_ids;
    }

    if conv_type == "group" {
        // Layer 1: mention_only=true -> only @mentions trigger agents
        // Layer 2: filter by listen_mode per agent
        let mut filtered = Vec::new();
        for agent in agents {
            let is_mentioned = mentions.contains(&"__all__".to_string())
                || mentions.contains(&agent.agent_id);
            if !is_mentioned {
                continue;
            }

            let is_owner = agent.owner_user_id == sender_user_id;
            let should_dispatch = match agent.listen_mode.as_str() {
                "owner_only" => is_owner,
                "allowed_users" => {
                    is_owner || agent.allowed_user_ids.contains(&sender_user_id.to_string())
                }
                "all_mentions" => true,
                _ => false,
            };
            if should_dispatch {
                filtered.push(agent.agent_id.clone());
            }
        }
        filtered
    } else {
        // Direct conversation -> always dispatch
        agent_ids
    }
}

/// Get conversation member user IDs with caching.
/// Returns a filtered list excluding users who have blocked (or are blocked by) sender_user_id.
async fn get_conv_member_ids(
    ws_state: &WsState,
    db: &PgPool,
    conversation_id: &str,
    sender_user_id: &str,
) -> Vec<String> {
    // Check cache first (valid for 60 seconds)
    let cached = ws_state.conv_member_cache.get(conversation_id).and_then(|entry| {
        if entry.1.elapsed() < std::time::Duration::from_secs(60) {
            Some(entry.0.clone())
        } else {
            None
        }
    });

    let all_members = if let Some(members) = cached {
        members
    } else {
        // Fetch from DB
        let members = sqlx::query_as::<_, (String,)>(
            "SELECT user_id FROM conversation_user_members WHERE conversation_id = $1::uuid",
        )
        .bind(conversation_id)
        .fetch_all(db)
        .await
        .unwrap_or_default();

        let member_ids: Vec<String> = if members.is_empty() {
            // Fallback: single-user conversation
            let owner = sqlx::query_as::<_, (String,)>(
                "SELECT user_id FROM conversations WHERE id = $1::uuid",
            )
            .bind(conversation_id)
            .fetch_optional(db)
            .await;
            match owner {
                Ok(Some((id,))) => vec![id],
                _ => vec![],
            }
        } else {
            members.into_iter().map(|(id,)| id).collect()
        };

        // Cache the result
        ws_state.conv_member_cache.insert(
            conversation_id.to_string(),
            (member_ids.clone(), std::time::Instant::now()),
        );
        member_ids
    };

    // Filter out blocked pairs
    if all_members.len() <= 1 {
        return all_members;
    }

    let blocked_by = sqlx::query_as::<_, (String,)>(
        r#"SELECT requester_id FROM friendships
           WHERE addressee_id = $1 AND status = 'blocked'"#,
    )
    .bind(sender_user_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    let sender_blocked = sqlx::query_as::<_, (String,)>(
        r#"SELECT addressee_id FROM friendships
           WHERE requester_id = $1 AND status = 'blocked'"#,
    )
    .bind(sender_user_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    let blocked_set: std::collections::HashSet<String> =
        blocked_by.into_iter().map(|(id,)| id).collect();
    let sender_blocked_set: std::collections::HashSet<String> =
        sender_blocked.into_iter().map(|(id,)| id).collect();

    all_members
        .into_iter()
        .filter(|uid| !blocked_set.contains(uid) && !sender_blocked_set.contains(uid))
        .collect()
}

const WS_RATE_LIMIT: i32 = 10; // messages per minute
const HEARTBEAT_TIMEOUT: Duration = Duration::from_secs(45);

pub fn router() -> Router<AppState> {
    Router::new().route("/ws", get(ws_upgrade))
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> Response {
    // Extract session token from cookie before upgrading
    let cookie_header = headers
        .get("cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    ws.on_upgrade(move |socket| handle_ws(socket, state, cookie_header))
}

async fn handle_ws(socket: WebSocket, state: AppState, cookie_header: String) {
    // Authenticate from cookie
    let token = match extract_session_token(&cookie_header) {
        Some(t) => t,
        None => return,
    };

    let session = match validate_session(&state.db, &token).await {
        Ok(Some(s)) => s,
        _ => return,
    };

    let user_id = session.user_id.clone();
    let conn_id = uuid::Uuid::new_v4().to_string();

    // Split the WebSocket
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Create channel for sending messages to this WebSocket
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    // Register connection
    state
        .ws
        .user_connections
        .entry(user_id.clone())
        .or_insert_with(Vec::new)
        .push((conn_id.clone(), tx.clone()));

    tracing::info!("WS connected: user={}", user_id);

    // Deliver pending events
    if let Ok(pending) = get_pending_events(&state.redis, &user_id).await {
        if !pending.is_empty() {
            for event in &pending {
                let msg = serde_json::to_string(event).unwrap_or_default();
                let _ = tx.send(msg);
            }
            let _ = clear_pending_events(&state.redis, &user_id).await;
        }
    }

    // Spawn task to forward messages from channel to WebSocket
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Process incoming messages with heartbeat timeout
    let ws_state = state.ws.clone();
    let db = state.db.clone();
    let redis = state.redis.clone();
    let config = state.config.clone();
    let user_id_clone = user_id.clone();
    let conn_id_clone = conn_id.clone();
    let tx_clone = tx.clone();

    let recv_task = tokio::spawn(async move {
        loop {
            match timeout(HEARTBEAT_TIMEOUT, ws_receiver.next()).await {
                Ok(Some(Ok(Message::Text(text)))) => {
                    handle_message(
                        &text,
                        &user_id_clone,
                        &conn_id_clone,
                        &ws_state,
                        &db,
                        &redis,
                        &config,
                        &tx_clone,
                    )
                    .await;
                }
                Ok(Some(Ok(Message::Close(_)))) | Ok(None) => break,
                Ok(Some(Err(_))) => break,
                Err(_) => {
                    // Heartbeat timeout
                    tracing::info!("WS heartbeat timeout: user={}", user_id_clone);
                    break;
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
    cleanup_connection(&state.ws, &user_id, &conn_id);
    tracing::info!("WS disconnected: user={}", user_id);
}

fn cleanup_connection(ws_state: &WsState, user_id: &str, conn_id: &str) {
    // Remove visibility tracking
    if let Some(visible) = ws_state.socket_visible.remove(conn_id) {
        if visible.1 {
            let mut count = ws_state.foreground_counts.entry(user_id.to_string()).or_insert(0);
            *count = (*count - 1).max(0);
        }
    }

    // Remove connection
    if let Some(mut conns) = ws_state.user_connections.get_mut(user_id) {
        conns.retain(|(id, _)| id != conn_id);
        if conns.is_empty() {
            drop(conns);
            ws_state.user_connections.remove(user_id);
            ws_state.foreground_counts.remove(user_id);
        }
    }
}

async fn handle_message(
    text: &str,
    user_id: &str,
    conn_id: &str,
    ws_state: &WsState,
    db: &PgPool,
    redis: &deadpool_redis::Pool,
    config: &crate::config::Config,
    tx: &mpsc::UnboundedSender<String>,
) {
    // Max message size check (32KB)
    if text.len() > 32768 {
        send_event(tx, &json!({
            "type": "stream_error",
            "conversationId": "",
            "messageId": "",
            "seq": 0,
            "error": "Message too large"
        }));
        return;
    }

    let event: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => {
            send_event(tx, &json!({
                "type": "stream_error",
                "conversationId": "",
                "messageId": "",
                "seq": 0,
                "error": "Invalid JSON"
            }));
            return;
        }
    };

    let event_type = event.get("type").and_then(|t| t.as_str()).unwrap_or("");

    match event_type {
        "ping" => {
            send_event(tx, &json!({"type": "pong"}));
        }
        "send_message" => {
            let conversation_id = event.get("conversationId").and_then(|v| v.as_str()).unwrap_or("");
            let content = event.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let reply_to_id = event.get("replyToId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let thread_id = event.get("threadId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let mentions: Vec<String> = event
                .get("mentions")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();

            if conversation_id.is_empty() || content.is_empty() {
                return;
            }

            // Rate limit check
            if !check_rate_limit(user_id, redis, ws_state).await {
                send_event(tx, &json!({
                    "type": "stream_error",
                    "conversationId": conversation_id,
                    "messageId": "",
                    "seq": 0,
                    "error": "Rate limit exceeded. Please wait before sending more messages."
                }));
                return;
            }

            let content = sanitize_content(content);
            trigger_agent_response(
                user_id,
                conversation_id,
                &content,
                false,
                reply_to_id,
                thread_id,
                &mentions,
                ws_state,
                db,
                redis,
                config,
            )
            .await;
        }
        "cancel_stream" => {
            let message_id = event.get("messageId").and_then(|v| v.as_str()).unwrap_or("");

            // Immediately update DB so a refresh won't see stale 'streaming' status
            let _ = sqlx::query(
                r#"UPDATE messages SET status = 'cancelled', updated_at = NOW()
                   WHERE id = $1::uuid AND status = 'streaming'"#,
            )
            .bind(message_id)
            .execute(db)
            .await;

            if let Some((_, cancel_tx)) = ws_state.stream_cancellers.remove(message_id) {
                let _ = cancel_tx.send(true);
            }
        }
        "sync" => {
            let conversations = event.get("conversations").cloned().unwrap_or(json!({}));
            handle_sync(user_id, &conversations, ws_state, db, redis).await;
        }
        "mark_read" => {
            let conversation_id = event.get("conversationId").and_then(|v| v.as_str()).unwrap_or("");
            let seq = event.get("seq").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            if !conversation_id.is_empty() {
                handle_mark_read(user_id, conversation_id, seq, db).await;
            }
        }
        "focus" => {
            let visible = event.get("visible").and_then(|v| v.as_bool()).unwrap_or(false);
            let prev = ws_state.socket_visible.get(conn_id).map(|v| *v).unwrap_or(false);
            ws_state.socket_visible.insert(conn_id.to_string(), visible);

            let mut count = ws_state.foreground_counts.entry(user_id.to_string()).or_insert(0);
            if visible && !prev {
                *count += 1;
            } else if !visible && prev {
                *count = (*count - 1).max(0);
            }
        }
        _ => {
            send_event(tx, &json!({
                "type": "stream_error",
                "conversationId": "",
                "messageId": "",
                "seq": 0,
                "error": "Invalid message format"
            }));
        }
    }
}

fn send_event(tx: &mpsc::UnboundedSender<String>, event: &Value) {
    let msg = serde_json::to_string(event).unwrap_or_default();
    let _ = tx.send(msg);
}

async fn check_rate_limit(
    user_id: &str,
    redis: &deadpool_redis::Pool,
    ws_state: &WsState,
) -> bool {
    let minute = chrono::Utc::now().timestamp() / 60;
    let key = format!("ws:rate:{}:{}", user_id, minute);

    // Try Redis first
    if let Ok(mut conn) = redis.get().await {
        if let Ok(count) = conn.incr::<_, _, i32>(&key, 1).await {
            if count == 1 {
                let _ = conn.expire::<_, ()>(&key, 120).await;
            }
            return count <= WS_RATE_LIMIT;
        }
    }

    // Fallback to in-memory
    let now_ms = chrono::Utc::now().timestamp_millis();
    let mut entry = ws_state.ws_rate_limits.entry(user_id.to_string()).or_insert((0, now_ms + 60000));
    if now_ms > entry.1 {
        *entry = (1, now_ms + 60000);
        return true;
    }
    if entry.0 >= WS_RATE_LIMIT {
        return false;
    }
    entry.0 += 1;
    true
}

/// Handle sync request: returns missed messages + conversation summaries
async fn handle_sync(
    user_id: &str,
    client_conversations: &Value,
    ws_state: &WsState,
    db: &PgPool,
    redis: &deadpool_redis::Pool,
) {
    let conv_rows = sqlx::query_as::<_, (String,)>(
        r#"SELECT id::text FROM conversations WHERE user_id = $1
           UNION
           SELECT conversation_id::text FROM conversation_user_members WHERE user_id = $1"#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await;

    let conv_ids: Vec<String> = match conv_rows {
        Ok(rows) => rows.into_iter().map(|r| r.0).collect(),
        Err(e) => {
            tracing::error!("Sync error: {}", e);
            return;
        }
    };

    if conv_ids.is_empty() {
        ws_state.send_to_user(user_id, &json!({
            "type": "sync_response",
            "conversations": [],
            "missedMessages": []
        }));
        return;
    }

    // Get read positions
    let reads = sqlx::query_as::<_, (String, i32, bool)>(
        r#"SELECT conversation_id::text, last_read_seq, muted
           FROM conversation_reads
           WHERE user_id = $1"#,
    )
    .bind(user_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    let read_map: std::collections::HashMap<String, (i32, bool)> = reads
        .into_iter()
        .map(|(cid, seq, muted)| (cid, (seq, muted)))
        .collect();

    let mut summaries = Vec::new();
    let mut missed_messages = Vec::new();

    for conv_id in &conv_ids {
        // Get max seq
        let max_seq_row = sqlx::query_as::<_, (Option<i32>,)>(
            r#"SELECT MAX(seq) FROM messages WHERE conversation_id = $1::uuid"#,
        )
        .bind(conv_id)
        .fetch_one(db)
        .await;

        let max_seq = max_seq_row.map(|r| r.0.unwrap_or(0)).unwrap_or(0);

        // Get last message
        let last_msg = sqlx::query_as::<_, (String, String, String, chrono::NaiveDateTime)>(
            r#"SELECT content, role::text, status::text, created_at
               FROM messages WHERE conversation_id = $1::uuid
               ORDER BY seq DESC LIMIT 1"#,
        )
        .bind(conv_id)
        .fetch_optional(db)
        .await
        .ok()
        .flatten();

        let (last_read_seq, muted) = read_map.get(conv_id).copied().unwrap_or((0, false));
        let unread_count = (max_seq - last_read_seq).max(0);

        let last_message = last_msg.map(|(content, role, status, created_at)| {
            json!({
                "content": content,
                "role": role,
                "status": status,
                "createdAt": created_at.and_utc().to_rfc3339()
            })
        });

        summaries.push(json!({
            "conversationId": conv_id,
            "unreadCount": unread_count,
            "maxSeq": max_seq,
            "muted": muted,
            "lastMessage": last_message
        }));

        // Missed messages for conversations the client knows about
        if let Some(client_last_seq) = client_conversations
            .get(conv_id)
            .and_then(|v| v.as_i64())
        {
            let client_last_seq = client_last_seq as i32;
            if client_last_seq < max_seq {
                let missed = sqlx::query_as::<_, (String, String, i32, String, String, String, chrono::NaiveDateTime, Option<String>)>(
                    r#"SELECT id::text, conversation_id::text, seq, role::text, content, status::text, created_at, thread_id::text
                       FROM messages
                       WHERE conversation_id = $1::uuid AND seq > $2
                       ORDER BY seq ASC LIMIT 100"#,
                )
                .bind(conv_id)
                .bind(client_last_seq)
                .fetch_all(db)
                .await
                .unwrap_or_default();

                for (id, cid, seq, role, mut content, mut status, created_at, thread_id) in missed {
                    // Fix stuck streaming messages
                    if status == "streaming" && !ws_state.has_active_stream(conv_id) {
                        status = if !content.is_empty() {
                            "completed".to_string()
                        } else {
                            "error".to_string()
                        };
                        let _ = sqlx::query(
                            r#"UPDATE messages SET status = $1::message_status, updated_at = NOW() WHERE id = $2::uuid"#,
                        )
                        .bind(&status)
                        .bind(&id)
                        .execute(db)
                        .await;
                    }

                    // For active streaming, fetch content from Redis
                    if status == "streaming" {
                        if let Ok(mut conn) = redis.get().await {
                            if let Ok(cached) = conn.get::<_, Option<String>>(&format!("stream:{}", id)).await {
                                if let Some(cached) = cached {
                                    content = cached;
                                }
                            }
                        }
                    }

                    missed_messages.push(json!({
                        "id": id,
                        "conversationId": cid,
                        "seq": seq,
                        "role": role,
                        "content": content,
                        "status": status,
                        "createdAt": created_at.and_utc().to_rfc3339(),
                        "threadId": thread_id
                    }));
                }
            }
        }
    }

    ws_state.send_to_user(user_id, &json!({
        "type": "sync_response",
        "conversations": summaries,
        "missedMessages": missed_messages
    }));

    // Re-attach to active streams
    for conv_id in &conv_ids {
        if !ws_state.has_active_stream(conv_id) {
            continue;
        }

        let streaming_msg = sqlx::query_as::<_, (String, i32)>(
            r#"SELECT id::text, seq FROM messages
               WHERE conversation_id = $1::uuid AND status = 'streaming'
               ORDER BY created_at DESC LIMIT 1"#,
        )
        .bind(conv_id)
        .fetch_optional(db)
        .await;

        if let Ok(Some((msg_id, seq))) = streaming_msg {
            ws_state.send_to_user(user_id, &json!({
                "type": "stream_start",
                "conversationId": conv_id,
                "messageId": msg_id,
                "seq": seq
            }));

            if let Ok(mut conn) = redis.get().await {
                if let Ok(Some(cached)) = conn.get::<_, Option<String>>(&format!("stream:{}", msg_id)).await {
                    ws_state.send_to_user(user_id, &json!({
                        "type": "stream_chunk",
                        "conversationId": conv_id,
                        "messageId": msg_id,
                        "seq": seq,
                        "chunk": cached
                    }));
                }
            }
        }
    }
}

/// Handle mark_read: upsert lastReadSeq for user's conversation.
async fn handle_mark_read(user_id: &str, conversation_id: &str, seq: i32, db: &PgPool) {
    let _ = sqlx::query(
        r#"INSERT INTO conversation_reads (id, user_id, conversation_id, last_read_seq, updated_at)
           VALUES (gen_random_uuid(), $1, $2::uuid, $3, NOW())
           ON CONFLICT (user_id, conversation_id)
           DO UPDATE SET
             last_read_seq = GREATEST(conversation_reads.last_read_seq, EXCLUDED.last_read_seq),
             updated_at = NOW()"#,
    )
    .bind(user_id)
    .bind(conversation_id)
    .bind(seq)
    .execute(db)
    .await;
}

/// Trigger an agent response for a conversation.
/// For direct conversations, dispatches to the single agent.
/// For group conversations, broadcasts to all agents in conversation_members.
pub async fn trigger_agent_response(
    user_id: &str,
    conversation_id: &str,
    content: &str,
    skip_user_message: bool,
    reply_to_id: Option<String>,
    thread_id: Option<String>,
    mentions: &[String],
    ws_state: &WsState,
    db: &PgPool,
    redis: &deadpool_redis::Pool,
    config: &crate::config::Config,
) {
    // Verify conversation access: user is owner OR member via conversation_user_members
    let conv = sqlx::query_as::<_, (String, Option<String>, String, bool)>(
        r#"SELECT c.id::text, c.agent_id::text, c.type::text, c.mention_only
           FROM conversations c
           WHERE c.id = $1::uuid
             AND (c.user_id = $2 OR EXISTS (
                SELECT 1 FROM conversation_user_members cum
                WHERE cum.conversation_id = c.id AND cum.user_id = $2
             ))"#,
    )
    .bind(conversation_id)
    .bind(user_id)
    .fetch_optional(db)
    .await;

    let (_, agent_id, conv_type, mention_only) = match conv {
        Ok(Some(c)) => c,
        _ => return,
    };

    // Determine target agent(s)
    let agent_ids: Vec<String> = if conv_type == "group" {
        let members = sqlx::query_as::<_, (String,)>(
            r#"SELECT agent_id::text FROM conversation_members WHERE conversation_id = $1::uuid"#,
        )
        .bind(conversation_id)
        .fetch_all(db)
        .await
        .unwrap_or_default();
        members.into_iter().map(|m| m.0).collect()
    } else {
        match agent_id {
            Some(id) => vec![id],
            None => vec![], // Human-to-human DM: no agents to dispatch
        }
    };

    // For human-to-human conversations (no agents): save message, broadcast, and return
    if agent_ids.is_empty() {
        if !skip_user_message {
            let user_seq = match get_next_seq(db, conversation_id).await {
                Ok(s) => s,
                Err(_) => return,
            };

            let msg_id = uuid::Uuid::new_v4();
            let _ = sqlx::query(
                r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_user_id, reply_to_id, thread_id, created_at, updated_at)
                   VALUES ($1, $2::uuid, $3, 'user', $4, 'completed', $5, $6::uuid, $7::uuid, NOW(), NOW())"#,
            )
            .bind(msg_id)
            .bind(conversation_id)
            .bind(user_seq)
            .bind(content)
            .bind(user_id)
            .bind(reply_to_id.as_deref())
            .bind(thread_id.as_deref())
            .execute(db)
            .await;

            let _ = sqlx::query(
                r#"UPDATE conversations SET updated_at = NOW() WHERE id = $1::uuid"#,
            )
            .bind(conversation_id)
            .execute(db)
            .await;

            // Fetch sender info for broadcast
            let sender_info = sqlx::query_as::<_, (Option<String>, Option<String>)>(
                r#"SELECT name, username FROM "user" WHERE id = $1"#,
            )
            .bind(user_id)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();

            let sender_name = sender_info.as_ref().and_then(|(n, _)| n.as_deref()).unwrap_or("");
            let sender_username = sender_info.as_ref().and_then(|(_, u)| u.as_deref()).unwrap_or("");

            // Broadcast new message to all conversation members
            let member_ids = get_conv_member_ids(ws_state, db, conversation_id, user_id).await;
            let msg_event = json!({
                "type": "new_message",
                "conversationId": conversation_id,
                "threadId": thread_id,
                "message": {
                    "id": msg_id.to_string(),
                    "conversationId": conversation_id,
                    "seq": user_seq,
                    "role": "user",
                    "content": content,
                    "status": "completed",
                    "senderUserId": user_id,
                    "senderUserName": sender_name,
                    "senderUsername": sender_username,
                    "replyToId": reply_to_id,
                    "threadId": thread_id,
                    "createdAt": chrono::Utc::now().to_rfc3339(),
                    "updatedAt": chrono::Utc::now().to_rfc3339(),
                }
            });
            ws_state.broadcast_to_members(&member_ids, &msg_event, redis);
        }
        return;
    }

    // Two-layer filtering: mention_only (conversation-level) × listen_mode (per-agent)
    // Build AgentFilterConfig for each agent (requires DB queries for group conversations)
    let agent_configs: Vec<AgentFilterConfig> = if mention_only && conv_type == "group" {
        let mut configs = Vec::new();
        for aid in &agent_ids {
            let agent_perms = sqlx::query_as::<_, (String, Option<String>)>(
                r#"SELECT listen_mode::text, owner_user_id FROM conversation_members
                   WHERE conversation_id = $1::uuid AND agent_id = $2::uuid"#,
            )
            .bind(conversation_id)
            .bind(aid)
            .fetch_optional(db)
            .await;

            if let Ok(Some((listen_mode, owner_id))) = agent_perms {
                // Fetch allowed_user_ids if listen_mode is allowed_users
                let allowed_user_ids = if listen_mode == "allowed_users" {
                    sqlx::query_as::<_, (String,)>(
                        r#"SELECT user_id FROM agent_listen_allowed_users
                           WHERE agent_id = $1::uuid AND conversation_id = $2::uuid"#,
                    )
                    .bind(aid)
                    .bind(conversation_id)
                    .fetch_all(db)
                    .await
                    .unwrap_or_default()
                    .into_iter()
                    .map(|(uid,)| uid)
                    .collect()
                } else {
                    vec![]
                };

                configs.push(AgentFilterConfig {
                    agent_id: aid.clone(),
                    listen_mode,
                    owner_user_id: owner_id.unwrap_or_default(),
                    allowed_user_ids,
                });
            }
        }
        configs
    } else {
        // For non-group or mention_only=false, configs are not inspected by the filter
        agent_ids.iter().map(|aid| AgentFilterConfig {
            agent_id: aid.clone(),
            listen_mode: "all_mentions".into(),
            owner_user_id: String::new(),
            allowed_user_ids: vec![],
        }).collect()
    };

    let dispatch_ids = filter_agents_for_dispatch(
        mention_only,
        &conv_type,
        user_id,
        mentions,
        &agent_configs,
    );

    // Save user message immediately
    if !skip_user_message {
        let user_seq = match get_next_seq(db, conversation_id).await {
            Ok(s) => s,
            Err(_) => return,
        };

        let user_msg_id = uuid::Uuid::new_v4();
        let now = chrono::Utc::now();
        let _ = sqlx::query(
            r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_user_id, reply_to_id, thread_id, created_at, updated_at)
               VALUES ($1, $2::uuid, $3, 'user', $4, 'completed', $5, $6::uuid, $7::uuid, $8, $8)"#,
        )
        .bind(user_msg_id)
        .bind(conversation_id)
        .bind(user_seq)
        .bind(content)
        .bind(user_id)
        .bind(reply_to_id.as_deref())
        .bind(thread_id.as_deref())
        .bind(now.naive_utc())
        .execute(db)
        .await;

        let _ = sqlx::query(
            r#"UPDATE conversations SET updated_at = NOW() WHERE id = $1::uuid"#,
        )
        .bind(conversation_id)
        .execute(db)
        .await;

        // Broadcast user message to all conversation members (for group visibility)
        if conv_type == "group" {
            let sender_info = sqlx::query_as::<_, (Option<String>, Option<String>)>(
                r#"SELECT name, username FROM "user" WHERE id = $1"#,
            )
            .bind(user_id)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();

            let sender_name = sender_info.as_ref().and_then(|(n, _)| n.as_deref()).unwrap_or("");
            let sender_username = sender_info.as_ref().and_then(|(_, u)| u.as_deref()).unwrap_or("");

            let member_ids = get_conv_member_ids(ws_state, db, conversation_id, user_id).await;
            let user_msg_event = json!({
                "type": "new_message",
                "conversationId": conversation_id,
                "threadId": thread_id,
                "message": {
                    "id": user_msg_id.to_string(),
                    "conversationId": conversation_id,
                    "seq": user_seq,
                    "role": "user",
                    "content": content,
                    "status": "completed",
                    "senderUserId": user_id,
                    "senderUserName": sender_name,
                    "senderUsername": sender_username,
                    "replyToId": reply_to_id,
                    "threadId": thread_id,
                    "createdAt": now.to_rfc3339(),
                    "updatedAt": now.to_rfc3339(),
                }
            });
            ws_state.broadcast_to_members(&member_ids, &user_msg_event, redis);
        }
    }

    // Dispatch to each agent (may be empty if mention_only and no mentions matched)
    for agent_id in &dispatch_ids {
        // Per-agent queue: if this specific agent has an active stream, queue it
        if ws_state.has_active_stream_for_agent(conversation_id, agent_id) {
            tracing::info!("Agent queued (active stream): conv={} agent={}", conversation_id, agent_id);
            let queue_key = format!("{}:{}", conversation_id, agent_id);
            ws_state
                .agent_response_queues
                .entry(queue_key)
                .or_insert_with(std::collections::VecDeque::new)
                .push_back(QueuedResponse {
                    user_id: user_id.to_string(),
                    conversation_id: conversation_id.to_string(),
                    agent_id: agent_id.clone(),
                    content: content.to_string(),
                    reply_to_id: reply_to_id.clone(),
                });

            // Notify the user that this agent's response is queued
            let agent_name = sqlx::query_as::<_, (String,)>(
                r#"SELECT name FROM agents WHERE id = $1::uuid"#,
            )
            .bind(agent_id)
            .fetch_optional(db)
            .await
            .ok()
            .flatten()
            .map(|(n,)| n)
            .unwrap_or_else(|| "Agent".to_string());

            ws_state.send_to_user(user_id, &json!({
                "type": "stream_queued",
                "conversationId": conversation_id,
                "agentId": agent_id,
                "agentName": agent_name,
            }));

            continue;
        }

        do_trigger_agent_response(
            user_id,
            agent_id,
            conversation_id,
            content,
            reply_to_id.as_deref(),
            &conv_type,
            ws_state,
            db,
            redis,
            config,
        )
        .await;
    }
}

/// Actually send the task to the agent and set up streaming callbacks.
async fn do_trigger_agent_response(
    user_id: &str,
    agent_id: &str,
    conversation_id: &str,
    content: &str,
    reply_to_id: Option<&str>,
    conv_type: &str,
    ws_state: &WsState,
    db: &PgPool,
    redis: &deadpool_redis::Pool,
    config: &crate::config::Config,
) {
    let agent = sqlx::query_as::<_, (String, Option<String>)>(
        r#"SELECT name, system_prompt FROM agents WHERE id = $1::uuid"#,
    )
    .bind(agent_id)
    .fetch_optional(db)
    .await;

    let (agent_name, system_prompt) = match agent {
        Ok(Some(a)) => a,
        _ => return,
    };

    // Fetch agent's owner for blocking filter
    let agent_owner = sqlx::query_as::<_, (Option<String>,)>(
        r#"SELECT owner_user_id FROM conversation_members
           WHERE conversation_id = $1::uuid AND agent_id = $2::uuid"#,
    )
    .bind(conversation_id)
    .bind(agent_id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
    .and_then(|(o,)| o)
    .unwrap_or_else(|| user_id.to_string());

    // Get broadcast targets (all members minus blocked pairs)
    let member_ids = get_conv_member_ids(ws_state, db, conversation_id, &agent_owner).await;

    // Check if agent is connected
    if !ws_state.is_agent_connected(agent_id) {
        let hint = "Copy the **Bot Token** from bot settings, then run:\n```\nopenclaw arinova-setup --token <bot-token>\n```";

        let err_seq = match get_next_seq(db, conversation_id).await {
            Ok(s) => s,
            Err(_) => return,
        };

        let err_content = format!(
            "**{}** is not connected yet. An AI agent needs to connect to this bot before it can respond.\n\n{}",
            agent_name, hint
        );

        let err_msg_id = uuid::Uuid::new_v4().to_string();
        let _ = sqlx::query(
            r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_agent_id, created_at, updated_at)
               VALUES ($1::uuid, $2::uuid, $3, 'agent', $4, 'error', $5::uuid, NOW(), NOW())"#,
        )
        .bind(&err_msg_id)
        .bind(conversation_id)
        .bind(err_seq)
        .bind(&err_content)
        .bind(agent_id)
        .execute(db)
        .await;

        ws_state.broadcast_to_members(&member_ids, &json!({
            "type": "stream_start",
            "conversationId": conversation_id,
            "messageId": err_msg_id,
            "seq": err_seq,
            "senderAgentId": agent_id,
            "senderAgentName": agent_name
        }), redis);

        ws_state.broadcast_to_members(&member_ids, &json!({
            "type": "stream_error",
            "conversationId": conversation_id,
            "messageId": err_msg_id,
            "seq": err_seq,
            "error": format!("{} is not connected. Copy the Bot Token from bot settings and run: openclaw arinova-setup --token <bot-token>", agent_name)
        }), redis);

        return;
    }

    // Create pending agent message with sender_agent_id
    let agent_seq = match get_next_seq(db, conversation_id).await {
        Ok(s) => s,
        Err(_) => return,
    };

    let agent_msg_id = uuid::Uuid::new_v4().to_string();
    let _ = sqlx::query(
        r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_agent_id, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3, 'agent', '', 'streaming', $4::uuid, NOW(), NOW())"#,
    )
    .bind(&agent_msg_id)
    .bind(conversation_id)
    .bind(agent_seq)
    .bind(agent_id)
    .execute(db)
    .await;

    let _ = sqlx::query(r#"UPDATE conversations SET updated_at = NOW() WHERE id = $1::uuid"#)
        .bind(conversation_id)
        .execute(db)
        .await;

    // Mark this agent as having active stream (keyed by conv:agent)
    let stream_key = format!("{}:{}", conversation_id, agent_id);
    ws_state.active_streams.insert(stream_key.clone(), std::time::Instant::now());

    ws_state.broadcast_to_members(&member_ids, &json!({
        "type": "stream_start",
        "conversationId": conversation_id,
        "messageId": agent_msg_id,
        "seq": agent_seq,
        "senderAgentId": agent_id,
        "senderAgentName": agent_name
    }), redis);

    // Prepend system prompt if configured
    let task_content = match &system_prompt {
        Some(prompt) if !prompt.is_empty() => {
            format!("[System Prompt]\n{}\n\n[User Message]\n{}", prompt, content)
        }
        _ => content.to_string(),
    };

    // Fetch sender username for task payload
    let sender_username = sqlx::query_as::<_, (Option<String>,)>(
        r#"SELECT username FROM "user" WHERE id = $1"#,
    )
    .bind(user_id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
    .and_then(|(u,)| u);

    // Build task payload with group context and reply context
    let mut task_payload = json!({
        "type": "task",
        "taskId": agent_msg_id,
        "conversationId": conversation_id,
        "content": task_content,
        "conversationType": conv_type,
        "senderUserId": user_id,
        "senderUsername": sender_username
    });

    // Add group members context
    if conv_type == "group" {
        let members = sqlx::query_as::<_, (String, String)>(
            r#"SELECT a.id::text, a.name FROM conversation_members cm
               JOIN agents a ON a.id = cm.agent_id
               WHERE cm.conversation_id = $1::uuid"#,
        )
        .bind(conversation_id)
        .fetch_all(db)
        .await
        .unwrap_or_default();

        let members_json: Vec<Value> = members.iter().map(|(id, name)| {
            json!({"agentId": id, "agentName": name})
        }).collect();
        task_payload["members"] = json!(members_json);
    }

    // Add reply context
    if let Some(ref_id) = reply_to_id {
        let reply_msg = sqlx::query_as::<_, (String, String, Option<String>)>(
            r#"SELECT role::text, content, (SELECT name FROM agents WHERE id = m.sender_agent_id) as agent_name
               FROM messages m WHERE id = $1::uuid"#,
        )
        .bind(ref_id)
        .fetch_optional(db)
        .await;

        if let Ok(Some((role, ref_content, agent_name_opt))) = reply_msg {
            let preview = if ref_content.len() > 500 { &ref_content[..500] } else { &ref_content };
            task_payload["replyTo"] = json!({
                "role": role,
                "content": preview,
                "senderAgentName": agent_name_opt
            });
        }
    }

    // Fetch recent conversation history (last 5 completed messages before current)
    let history_rows = sqlx::query_as::<_, (String, String, String, Option<String>, chrono::NaiveDateTime)>(
        r#"SELECT role::text, content,
                  COALESCE(status::text, 'completed') as status,
                  (SELECT name FROM agents WHERE id = m.sender_agent_id) as agent_name,
                  m.created_at
           FROM messages m
           WHERE m.conversation_id = $1::uuid
             AND m.status IN ('completed', 'error', 'cancelled')
             AND m.id != $2::uuid
           ORDER BY m.seq DESC
           LIMIT 5"#,
    )
    .bind(conversation_id)
    .bind(&agent_msg_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    if !history_rows.is_empty() {
        let history_json: Vec<Value> = history_rows.iter().rev().map(|(role, content, _status, agent_name, created_at)| {
            let mut entry = json!({
                "role": role,
                "content": content,
                "createdAt": created_at.to_string()
            });
            if let Some(name) = agent_name {
                entry["senderAgentName"] = json!(name);
            }
            entry
        }).collect();
        task_payload["history"] = json!(history_json);
    }

    // Fetch attachments from the latest user message in this conversation
    let attachments = sqlx::query_as::<_, (String, String, String, i32, String)>(
        r#"SELECT a.id::text, a.file_name, a.file_type, a.file_size, a.storage_path
           FROM attachments a
           WHERE a.message_id = (
             SELECT id FROM messages
             WHERE conversation_id = $1::uuid AND role = 'user'
             ORDER BY seq DESC LIMIT 1
           )"#,
    )
    .bind(conversation_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    if !attachments.is_empty() {
        let att_json: Vec<Value> = attachments.iter().map(|(id, name, ftype, fsize, url)| {
            json!({
                "id": id,
                "fileName": name,
                "fileType": ftype,
                "fileSize": fsize,
                "url": url
            })
        }).collect();
        task_payload["attachments"] = json!(att_json);
    }

    // Send full task payload to agent
    let (cancel_tx, mut cancel_rx) = tokio::sync::watch::channel(false);
    ws_state
        .stream_cancellers
        .insert(agent_msg_id.clone(), cancel_tx);

    tracing::info!(
        "Stream dispatch: conv={} agent={} msgId={} active_streams={:?}",
        conversation_id, agent_id, agent_msg_id,
        ws_state.active_streams.iter().map(|e| format!("{}({}s)", e.key(), e.value().elapsed().as_secs())).collect::<Vec<_>>()
    );

    let agent_event_rx = send_task_to_agent(
        ws_state,
        agent_id,
        &agent_msg_id,
        &task_payload,
    );

    // Spawn task to handle streaming events
    let ws_state = ws_state.clone();
    let db = db.clone();
    let redis = redis.clone();
    let config = config.clone();
    let user_id = user_id.to_string();
    let conversation_id = conversation_id.to_string();
    let agent_msg_id_clone = agent_msg_id.clone();
    let agent_name = agent_name.clone();
    let agent_id = agent_id.to_string();
    let conv_type = conv_type.to_string();
    let member_ids = member_ids;

    tokio::spawn(async move {
        let mut stream_accumulated = String::new();
        let stream_key = format!("{}:{}", conversation_id, agent_id);
        let mut pending_mentions: Option<(Vec<String>, String)> = None;
        let mut event_rx = match agent_event_rx {
            Some(rx) => {
                tracing::info!("Stream started: conv={} agent={} msgId={}", conversation_id, agent_id, agent_msg_id_clone);
                rx
            }
            None => {
                tracing::warn!("Stream failed (agent gone): conv={} agent={} msgId={}", conversation_id, agent_id, agent_msg_id_clone);
                let _ = sqlx::query(
                    r#"UPDATE messages SET content = $1, status = 'error', updated_at = NOW() WHERE id = $2::uuid"#,
                )
                .bind("Agent is not connected")
                .bind(&agent_msg_id_clone)
                .execute(&db)
                .await;

                ws_state.broadcast_to_members(&member_ids, &json!({
                    "type": "stream_error",
                    "conversationId": &conversation_id,
                    "messageId": &agent_msg_id_clone,
                    "seq": agent_seq,
                    "error": "Agent is not connected"
                }), &redis);

                ws_state.active_streams.remove(&stream_key);
                process_next_in_queue(&stream_key, &ws_state, &db, &redis, &config);
                return;
            }
        };

        loop {
            tokio::select! {
                event = event_rx.recv() => {
                    match event {
                        Some(crate::ws::state::AgentEvent::Chunk(delta)) => {
                            stream_accumulated.push_str(&delta);
                            ws_state.broadcast_to_members(&member_ids, &json!({
                                "type": "stream_chunk",
                                "conversationId": &conversation_id,
                                "messageId": &agent_msg_id_clone,
                                "seq": agent_seq,
                                "chunk": delta
                            }), &redis);

                            if let Ok(mut conn) = redis.get().await {
                                let _: Result<(), _> = conn.set_ex(
                                    &format!("stream:{}", agent_msg_id_clone),
                                    &stream_accumulated,
                                    600,
                                ).await;
                            }
                        }
                        Some(crate::ws::state::AgentEvent::Complete(full_content, mentions)) => {
                            tracing::info!(
                                "Stream complete: conv={} agent={} msgId={} content_len={} chunks_accumulated={}",
                                conversation_id, agent_id, agent_msg_id_clone,
                                full_content.len(), stream_accumulated.len()
                            );
                            ws_state.stream_cancellers.remove(&agent_msg_id_clone);

                            if let Ok(mut conn) = redis.get().await {
                                let _: Result<(), _> = conn.del(&format!("stream:{}", agent_msg_id_clone)).await;
                            }

                            let _ = sqlx::query(
                                r#"UPDATE messages SET content = $1, status = 'completed', updated_at = NOW() WHERE id = $2::uuid"#,
                            )
                            .bind(&full_content)
                            .bind(&agent_msg_id_clone)
                            .execute(&db)
                            .await;

                            ws_state.broadcast_to_members(&member_ids, &json!({
                                "type": "stream_end",
                                "conversationId": &conversation_id,
                                "messageId": &agent_msg_id_clone,
                                "seq": agent_seq,
                                "content": &full_content
                            }), &redis);

                            // Push notification
                            if !ws_state.is_user_foreground(&user_id) {
                                if let Ok(false) = is_conversation_muted(&db, &user_id, &conversation_id).await {
                                    if let Ok(true) = should_send_push(&db, &user_id, "message").await {
                                        let preview = if full_content.len() > 100 {
                                            format!("{}...", &full_content[..100])
                                        } else {
                                            full_content.clone()
                                        };
                                        let _ = send_push_to_user(
                                            &db,
                                            &config,
                                            &user_id,
                                            &crate::services::push::PushPayload {
                                                notification_type: "message".into(),
                                                title: agent_name.clone(),
                                                body: preview,
                                                url: Some(format!("/chat/{}", conversation_id)),
                                            },
                                        )
                                        .await;
                                    }
                                }
                            }

                            ws_state.active_streams.remove(&stream_key);
                            process_next_in_queue(&stream_key, &ws_state, &db, &redis, &config);

                            // Save mentions for dispatch after the select loop
                            if !mentions.is_empty() && conv_type == "group" {
                                pending_mentions = Some((mentions, full_content.clone()));
                            }

                            break;
                        }
                        Some(crate::ws::state::AgentEvent::Error(error)) => {
                            tracing::warn!(
                                "Stream error: conv={} agent={} msgId={} error={}",
                                conversation_id, agent_id, agent_msg_id_clone, error
                            );
                            ws_state.stream_cancellers.remove(&agent_msg_id_clone);

                            if let Ok(mut conn) = redis.get().await {
                                let _: Result<(), _> = conn.del(&format!("stream:{}", agent_msg_id_clone)).await;
                            }

                            let _ = sqlx::query(
                                r#"UPDATE messages SET content = $1, status = 'error', updated_at = NOW() WHERE id = $2::uuid"#,
                            )
                            .bind(&error)
                            .bind(&agent_msg_id_clone)
                            .execute(&db)
                            .await;

                            ws_state.broadcast_to_members(&member_ids, &json!({
                                "type": "stream_error",
                                "conversationId": &conversation_id,
                                "messageId": &agent_msg_id_clone,
                                "seq": agent_seq,
                                "error": error
                            }), &redis);

                            ws_state.active_streams.remove(&stream_key);
                            process_next_in_queue(&stream_key, &ws_state, &db, &redis, &config);
                            break;
                        }
                        None => {
                            tracing::warn!(
                                "Stream channel closed (agent disconnect): conv={} agent={} msgId={} accumulated_len={}",
                                conversation_id, agent_id, agent_msg_id_clone, stream_accumulated.len()
                            );
                            ws_state.stream_cancellers.remove(&agent_msg_id_clone);

                            if let Ok(mut conn) = redis.get().await {
                                let _: Result<(), _> = conn.del(&format!("stream:{}", agent_msg_id_clone)).await;
                            }

                            if stream_accumulated.is_empty() {
                                let _ = sqlx::query(
                                    r#"UPDATE messages SET content = 'Agent disconnected', status = 'error', updated_at = NOW() WHERE id = $1::uuid"#,
                                )
                                .bind(&agent_msg_id_clone)
                                .execute(&db)
                                .await;

                                ws_state.broadcast_to_members(&member_ids, &json!({
                                    "type": "stream_error",
                                    "conversationId": &conversation_id,
                                    "messageId": &agent_msg_id_clone,
                                    "seq": agent_seq,
                                    "error": "Agent disconnected"
                                }), &redis);
                            } else {
                                let _ = sqlx::query(
                                    r#"UPDATE messages SET content = $1, status = 'completed', updated_at = NOW() WHERE id = $2::uuid"#,
                                )
                                .bind(&stream_accumulated)
                                .bind(&agent_msg_id_clone)
                                .execute(&db)
                                .await;

                                ws_state.broadcast_to_members(&member_ids, &json!({
                                    "type": "stream_end",
                                    "conversationId": &conversation_id,
                                    "messageId": &agent_msg_id_clone,
                                    "seq": agent_seq,
                                    "content": &stream_accumulated
                                }), &redis);
                            }

                            ws_state.active_streams.remove(&stream_key);
                            process_next_in_queue(&stream_key, &ws_state, &db, &redis, &config);
                            break;
                        }
                    }
                }
                _ = cancel_rx.changed() => {
                    if *cancel_rx.borrow() {
                        // User cancelled the stream — clean up everything

                        // 1. Remove stream canceller
                        ws_state.stream_cancellers.remove(&agent_msg_id_clone);

                        // 2. Clean up Redis stream cache
                        if let Ok(mut conn) = redis.get().await {
                            let _: Result<(), _> = conn.del(&format!("stream:{}", agent_msg_id_clone)).await;
                        }

                        // 3. Update message status to 'cancelled' in DB with accumulated content
                        let _ = sqlx::query(
                            r#"UPDATE messages SET content = $1, status = 'cancelled', updated_at = NOW() WHERE id = $2::uuid"#,
                        )
                        .bind(&stream_accumulated)
                        .bind(&agent_msg_id_clone)
                        .execute(&db)
                        .await;

                        // 4. Notify all members that stream was cancelled
                        ws_state.broadcast_to_members(&member_ids, &json!({
                            "type": "stream_end",
                            "conversationId": &conversation_id,
                            "messageId": &agent_msg_id_clone,
                            "seq": agent_seq
                        }), &redis);

                        // 5. Send cancel_task to agent so it can stop generating
                        ws_state.send_to_agent(&agent_id, &json!({
                            "type": "cancel_task",
                            "taskId": &agent_msg_id_clone
                        }));

                        // 6. Remove pending task so agent chunks are silently dropped
                        if let Some((_, task)) = ws_state.pending_tasks.remove(&agent_msg_id_clone) {
                            task.timeout_handle.abort();
                        }

                        // 7. Clean up active stream and process queue
                        ws_state.active_streams.remove(&stream_key);
                        process_next_in_queue(&stream_key, &ws_state, &db, &redis, &config);

                        break;
                    }
                }
            }
        }

        // Dispatch to agents mentioned by the completing agent
        if let Some((mentions, content)) = pending_mentions {
            for mentioned_id in mentions {
                if mentioned_id == agent_id {
                    continue;
                }
                spawn_mention_dispatch(
                    &user_id, &mentioned_id, &conversation_id, &content,
                    &agent_msg_id_clone, &conv_type,
                    &ws_state, &db, &redis, &config,
                );
            }
        }
    });
}

/// Spawn a task to dispatch a single agent mention.
fn spawn_mention_dispatch(
    user_id: &str,
    mentioned_id: &str,
    conversation_id: &str,
    content: &str,
    reply_to_id: &str,
    conv_type: &str,
    ws_state: &WsState,
    db: &PgPool,
    redis: &deadpool_redis::Pool,
    config: &crate::config::Config,
) {
    let user_id = user_id.to_string();
    let mentioned_id = mentioned_id.to_string();
    let conversation_id = conversation_id.to_string();
    let content = content.to_string();
    let reply_to_id = reply_to_id.to_string();
    let conv_type = conv_type.to_string();
    let ws_state = ws_state.clone();
    let db = db.clone();
    let redis = redis.clone();
    let config = config.clone();

    tokio::spawn(async move {
        do_trigger_agent_response(
            &user_id,
            &mentioned_id,
            &conversation_id,
            &content,
            Some(&reply_to_id),
            &conv_type,
            &ws_state,
            &db,
            &redis,
            &config,
        )
        .await;
    });
}

/// Process the next queued agent response.
/// queue_key is "{conversation_id}:{agent_id}".
fn process_next_in_queue(
    queue_key: &str,
    ws_state: &WsState,
    db: &PgPool,
    redis: &deadpool_redis::Pool,
    config: &crate::config::Config,
) {
    let next = {
        let mut queue = match ws_state.agent_response_queues.get_mut(queue_key) {
            Some(q) => q,
            None => return,
        };
        let item = queue.pop_front();
        if queue.is_empty() {
            drop(queue);
            ws_state.agent_response_queues.remove(queue_key);
        }
        item
    };

    let next = match next {
        Some(n) => n,
        None => return,
    };

    let ws_state = ws_state.clone();
    let db = db.clone();
    let redis = redis.clone();
    let config = config.clone();

    tokio::spawn(async move {
        // Get conversation type
        let conv_type = sqlx::query_as::<_, (String,)>(
            r#"SELECT type::text FROM conversations WHERE id = $1::uuid"#,
        )
        .bind(&next.conversation_id)
        .fetch_optional(&db)
        .await
        .ok()
        .flatten()
        .map(|r| r.0)
        .unwrap_or_else(|| "direct".to_string());

        do_trigger_agent_response(
            &next.user_id,
            &next.agent_id,
            &next.conversation_id,
            &next.content,
            next.reply_to_id.as_deref(),
            &conv_type,
            &ws_state,
            &db,
            &redis,
            &config,
        )
        .await;
    });
}

/// Strip potentially dangerous HTML tags from user-submitted content
fn sanitize_content(content: &str) -> String {
    let re_script = regex_lite::Regex::new(r"(?i)<script\b[^>]*>.*?</script>").unwrap();
    let re_script_open = regex_lite::Regex::new(r"(?i)<script\b[^>]*>").unwrap();
    let re_script_close = regex_lite::Regex::new(r"(?i)</script>").unwrap();
    let re_iframe = regex_lite::Regex::new(r"(?i)<iframe\b[^>]*>.*?</iframe>").unwrap();
    let re_object = regex_lite::Regex::new(r"(?i)<object\b[^>]*>.*?</object>").unwrap();
    let re_embed = regex_lite::Regex::new(r"(?i)<embed\b[^>]*/?>").unwrap();
    let re_form = regex_lite::Regex::new(r"(?i)<form\b[^>]*>.*?</form>").unwrap();
    let re_event = regex_lite::Regex::new(r#"(?i)\s+on\w+=\s*"[^"]*""#).unwrap();

    let result = re_script.replace_all(content, "");
    let result = re_script_open.replace_all(&result, "");
    let result = re_script_close.replace_all(&result, "");
    let result = re_iframe.replace_all(&result, "");
    let result = re_object.replace_all(&result, "");
    let result = re_embed.replace_all(&result, "");
    let result = re_form.replace_all(&result, "");
    let result = re_event.replace_all(&result, "");

    result.into_owned()
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
