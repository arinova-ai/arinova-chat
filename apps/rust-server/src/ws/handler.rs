use axum::{
    extract::{
        ws::{Message, WebSocket},
        State, WebSocketUpgrade,
    },
    response::Response,
    routing::get,
    Router,
};
use chrono::{DateTime, Datelike, Utc};
use deadpool_redis::redis::AsyncCommands;
use futures::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sqlx::PgPool;
use tokio::sync::mpsc;
use tokio::time::{timeout, Duration};

use crate::auth::session::validate_session;
use crate::services::message_seq::get_next_seq;
use crate::services::pending_events::{clear_pending_events, get_pending_events};
use crate::services::push::{send_push_to_user, PushPayload};
use crate::services::push_trigger::{is_conversation_muted, should_send_push};
use crate::ws::agent_handler::send_task_to_agent;
use crate::ws::state::{QueuedResponse, WsState};
use crate::AppState;

// ---------- Two-layer agent dispatch filter (pure, testable) ----------

/// Per-agent configuration used by the dispatch filter.
#[derive(Debug, Clone)]
pub struct AgentFilterConfig {
    pub agent_id: String,
    /// One of: "all", "all_mentions", "owner_unmention_others_mention",
    /// "owner_and_allowlist", "allowlist_mentions", "owner_only", "muted".
    pub listen_mode: String,
    pub owner_user_id: String,
    pub allowed_user_ids: Vec<String>,
}

/// Pure per-agent filtering based on 6 listen modes.
///
/// Modes (broad → strict):
///   - `"all"` — receive every message, no @mention needed
///   - `"all_mentions"` — only when @mentioned by anyone
///   - `"owner_unmention_others_mention"` — owner's messages always; others need @mention
///   - `"owner_and_allowlist"` — owner + allowlist always; others ignored
///   - `"allowlist_mentions"` — must @mention, and only owner + allowlist mentions are heard
///   - `"owner_only"` — only owner's messages
///   - `"muted"` — never receive
///
/// For non-group (direct/h2a) conversations, always dispatch (agent is the sole recipient).
pub fn filter_agents_for_dispatch(
    _mention_only: bool,
    conv_type: &str,
    sender_user_id: &str,
    mentions: &[String],
    agents: &[AgentFilterConfig],
) -> Vec<String> {
    if conv_type != "group" {
        // Direct / H2A conversations -> always dispatch
        return agents.iter().map(|a| a.agent_id.clone()).collect();
    }

    let mut filtered = Vec::new();
    for agent in agents {
        let is_owner = agent.owner_user_id == sender_user_id;
        let is_mentioned = mentions.contains(&"__all__".to_string())
            || mentions.contains(&agent.agent_id);

        let should_dispatch = match agent.listen_mode.as_str() {
            "all" => true,
            "all_mentions" => is_mentioned,
            "owner_unmention_others_mention" => is_owner || is_mentioned,
            "owner_and_allowlist" => {
                is_owner || agent.allowed_user_ids.contains(&sender_user_id.to_string())
            }
            "allowlist_mentions" => {
                is_mentioned && (is_owner || agent.allowed_user_ids.contains(&sender_user_id.to_string()))
            }
            "owner_only" => is_owner,
            "muted" => false,
            // Legacy "allowed_users" maps to owner_and_allowlist behavior
            "allowed_users" => {
                is_owner || agent.allowed_user_ids.contains(&sender_user_id.to_string())
            }
            _ => false,
        };
        if should_dispatch {
            filtered.push(agent.agent_id.clone());
        }
    }
    filtered
}

/// Safely truncate a string at a character boundary.
/// Inject relevant agent memories into message content via embedding similarity search.
async fn inject_agent_memories(
    db: &PgPool,
    config: &crate::config::Config,
    agent_id: &str,
    content: &str,
) -> String {
    let api_key = match config.openai_api_key.as_deref() {
        Some(k) => k,
        None => return content.to_string(),
    };

    // Generate embedding for user message
    let client = reqwest::Client::new();
    let embeddings = match crate::services::embedding::generate_embeddings(
        &client, api_key, &[content.to_string()], crate::services::embedding::EMBEDDING_MODEL,
    ).await {
        Ok(e) if !e.is_empty() => e,
        _ => return content.to_string(),
    };
    let query_vec = pgvector::Vector::from(embeddings.into_iter().next().unwrap());

    // Search agent_memories by cosine similarity
    let rows = sqlx::query_as::<_, (uuid::Uuid, String, String, Option<String>, f64, Option<chrono::DateTime<chrono::Utc>>)>(
        r#"SELECT id, summary, category, detail,
                  1 - (embedding <=> $2::vector) AS similarity,
                  first_seen_at
           FROM agent_memories
           WHERE agent_id = $1::uuid AND embedding IS NOT NULL
           ORDER BY embedding <=> $2::vector
           LIMIT 5"#,
    )
    .bind(agent_id)
    .bind(&query_vec)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    // Filter by similarity threshold
    let relevant: Vec<_> = rows.iter().filter(|r| r.4 >= 0.3).collect();
    if relevant.is_empty() {
        return content.to_string();
    }

    // Update hit_count + last_used_at
    let ids: Vec<uuid::Uuid> = relevant.iter().map(|r| r.0).collect();
    let _ = sqlx::query(
        "UPDATE agent_memories SET hit_count = hit_count + 1, last_used_at = NOW() WHERE id = ANY($1)",
    )
    .bind(&ids)
    .execute(db)
    .await;

    // Format memory context with date
    let mut ctx = String::from("[Agent Memory Context]\n");
    for r in &relevant {
        let date_str = r.5.map(|dt| format!("{}/{}", dt.month(), dt.day())).unwrap_or_default();
        if date_str.is_empty() {
            ctx.push_str(&format!("- [{}] {}", r.2, r.1));
        } else {
            ctx.push_str(&format!("- [{}] ({}) {}", r.2, date_str, r.1));
        }
        if let Some(ref detail) = r.3 {
            if !detail.is_empty() {
                ctx.push_str(&format!(" ({})", safe_truncate(detail, 100)));
            }
        }
        ctx.push('\n');
    }
    ctx.push('\n');
    ctx.push_str(content);
    ctx
}

fn safe_truncate(s: &str, max_chars: usize) -> &str {
    match s.char_indices().nth(max_chars) {
        Some((idx, _)) => &s[..idx],
        None => s,
    }
}

/// Get conversation member user IDs with caching.
/// Returns a filtered list excluding users who have blocked (or are blocked by) sender_user_id.
pub async fn get_conv_member_ids(
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

    // Reject banned users from establishing WS connections
    if session.banned {
        return;
    }

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
            // Check if user is banned before allowing message send
            let is_banned = sqlx::query_as::<_, (bool,)>(
                r#"SELECT COALESCE(banned, false) FROM "user" WHERE id = $1"#,
            )
            .bind(user_id)
            .fetch_optional(db)
            .await
            .ok()
            .flatten()
            .map(|(b,)| b)
            .unwrap_or(false);

            if is_banned {
                send_event(tx, &json!({
                    "type": "stream_error",
                    "conversationId": "",
                    "messageId": "",
                    "seq": 0,
                    "error": "Your account has been banned"
                }));
                return;
            }

            let client_msg_id = event.get("id").and_then(|v| v.as_str())
                .and_then(|s| uuid::Uuid::parse_str(s).ok())
                .map(|u| u.to_string());
            let conversation_id = event.get("conversationId").and_then(|v| v.as_str()).unwrap_or("");
            let content = event.get("content").and_then(|v| v.as_str()).unwrap_or("");
            let reply_to_id = event.get("replyToId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let thread_id = event.get("threadId").and_then(|v| v.as_str()).map(|s| s.to_string());
            let mut mentions: Vec<String> = event
                .get("mentions")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect())
                .unwrap_or_default();

            let client_metadata = event.get("metadata").cloned();

            if conversation_id.is_empty() || content.is_empty() {
                return;
            }

            // Block check (1-on-1 only): reject if the other party has blocked sender
            let conv_row = sqlx::query_as::<_, (String, String)>(
                "SELECT type::text, user_id FROM conversations WHERE id = $1::uuid",
            )
            .bind(conversation_id)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();
            let (conv_type, conv_owner_id) = conv_row.unwrap_or_default();

            if conv_type == "h2h" || conv_type == "h2a" || conv_type == "direct" {
                let blocked_in_conv = sqlx::query_scalar::<_, bool>(
                    r#"SELECT EXISTS(
                        SELECT 1 FROM friendships f
                        JOIN conversation_user_members cum ON cum.conversation_id = $1::uuid AND cum.user_id = f.requester_id
                        WHERE f.addressee_id = $2 AND f.status = 'blocked'
                    ) OR EXISTS(
                        SELECT 1 FROM conversations c
                        WHERE c.id = $1::uuid AND c.user_id != $2
                        AND EXISTS(SELECT 1 FROM friendships WHERE requester_id = c.user_id AND addressee_id = $2 AND status = 'blocked')
                    )"#,
                )
                .bind(conversation_id)
                .bind(user_id)
                .fetch_one(db)
                .await
                .unwrap_or(false);

                if blocked_in_conv {
                    send_event(tx, &json!({
                        "type": "stream_error",
                        "conversationId": conversation_id,
                        "messageId": "",
                        "seq": 0,
                        "code": "blocked",
                        "error": "You have been blocked by this user"
                    }));
                    return;
                }
            }

            // Auto-resolve @name patterns from content and merge with client mentions
            let resolved = crate::services::mention::resolve_mentions_from_content(
                db, conversation_id, content, None,
            ).await;
            for id in resolved {
                if !mentions.contains(&id) {
                    mentions.push(id);
                }
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
                client_msg_id,
                client_metadata,
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
        "cancel_queued" => {
            let message_id = event.get("messageId").and_then(|v| v.as_str()).unwrap_or("");
            let conversation_id = event.get("conversationId").and_then(|v| v.as_str()).unwrap_or("");

            if message_id.is_empty() || conversation_id.is_empty() {
                return;
            }

            // Find and remove the queued item matching this user message ID
            let prefix = format!("{}:", conversation_id);
            for mut entry in ws_state.agent_response_queues.iter_mut() {
                let key = entry.key().clone();
                if key.starts_with(&prefix) {
                    let queue = entry.value_mut();
                    queue.retain(|q| q.user_message_id.as_deref() != Some(message_id));
                }
            }

            // Send confirmation back to the user
            ws_state.send_to_user(user_id, &json!({
                "type": "queued_cancelled",
                "conversationId": conversation_id,
                "messageId": message_id
            }));
        }
        "sync" => {
            let conversations = event.get("conversations").cloned().unwrap_or(json!({}));
            handle_sync(user_id, tx, &conversations, ws_state, db, redis).await;
        }
        "mark_read" => {
            let conversation_id = event.get("conversationId").and_then(|v| v.as_str()).unwrap_or("");
            let seq = event.get("seq").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            if !conversation_id.is_empty() {
                handle_mark_read(user_id, conversation_id, seq, db, ws_state, redis).await;
            }
        }
        "typing" => {
            let conversation_id = event.get("conversationId").and_then(|v| v.as_str()).unwrap_or("");
            if conversation_id.is_empty() { return; }

            // Only broadcast in group conversations
            let conv_type = sqlx::query_as::<_, (String,)>(
                r#"SELECT type::text FROM conversations WHERE id = $1::uuid"#
            )
            .bind(conversation_id)
            .fetch_optional(db)
            .await;

            if let Ok(Some((conv_type,))) = conv_type {
                if conv_type == "group" || conv_type == "community" {
                    // Get member IDs to broadcast to (excluding sender)
                    let member_ids: Vec<String> = sqlx::query_as::<_, (String,)>(
                        r#"SELECT user_id FROM conversation_user_members WHERE conversation_id = $1::uuid AND user_id != $2"#
                    )
                    .bind(conversation_id)
                    .bind(user_id)
                    .fetch_all(db)
                    .await
                    .unwrap_or_default()
                    .into_iter()
                    .map(|r| r.0)
                    .collect();

                    // Get sender name (use community display_name for community conversations)
                    let mut sender_name = sqlx::query_as::<_, (String,)>(
                        r#"SELECT name FROM "user" WHERE id = $1"#
                    )
                    .bind(user_id)
                    .fetch_optional(db)
                    .await
                    .ok()
                    .flatten()
                    .map(|r| r.0)
                    .unwrap_or_else(|| "User".to_string());

                    if conv_type == "community" {
                        if let Ok(Some((dn,))) = sqlx::query_as::<_, (Option<String>,)>(
                            r#"SELECT cm.display_name
                               FROM community_members cm
                               JOIN communities c ON c.id = cm.community_id
                               WHERE c.conversation_id = $1::uuid AND cm.user_id = $2"#,
                        )
                        .bind(conversation_id)
                        .bind(user_id)
                        .fetch_optional(db)
                        .await
                        {
                            if let Some(dn) = dn { sender_name = dn; }
                        }
                    }

                    // Anonymize userId for community conversations
                    let typing_user_id: String = if conv_type == "community" {
                        use sha2::{Sha256, Digest};
                        let mut hasher = Sha256::new();
                        hasher.update(conversation_id.as_bytes());
                        hasher.update(user_id.as_bytes());
                        format!("anon-{}", hex::encode(&hasher.finalize()[..8]))
                    } else {
                        user_id.to_string()
                    };

                    ws_state.broadcast_to_members(&member_ids, &json!({
                        "type": "user_typing",
                        "conversationId": conversation_id,
                        "userId": typing_user_id,
                        "userName": sender_name
                    }), redis);
                }
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
    tx: &mpsc::UnboundedSender<String>,
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
        send_event(tx, &json!({
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

    send_event(tx, &json!({
        "type": "sync_response",
        "conversations": summaries,
        "missedMessages": missed_messages
    }));

    // Re-attach to active streams — send stream_resume so frontend can
    // restore the in-progress message without duplicating.
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
            let mut content = String::new();
            if let Ok(mut conn) = redis.get().await {
                if let Ok(Some(cached)) = conn.get::<_, Option<String>>(&format!("stream:{}", msg_id)).await {
                    content = cached;
                }
            }

            // Also try to get the agent info from the message
            let agent_info = sqlx::query_as::<_, (Option<String>,)>(
                r#"SELECT sender_agent_id::text FROM messages WHERE id = $1::uuid"#,
            )
            .bind(&msg_id)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();

            let agent_id = agent_info.and_then(|a| a.0);

            send_event(tx, &json!({
                "type": "stream_resume",
                "conversationId": conv_id,
                "messageId": msg_id,
                "seq": seq,
                "content": content,
                "agentId": agent_id
            }));
        }
    }
}

/// Handle mark_read: upsert lastReadSeq + record per-message receipts + broadcast.
async fn handle_mark_read(
    user_id: &str,
    conversation_id: &str,
    seq: i32,
    db: &PgPool,
    ws_state: &crate::ws::state::WsState,
    redis: &deadpool_redis::Pool,
) {
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

    // Record per-message read receipts for unread messages up to this seq
    let _ = sqlx::query(
        r#"INSERT INTO message_read_receipts (message_id, user_id)
           SELECT id, $1 FROM messages
           WHERE conversation_id = $2::uuid AND seq <= $3 AND sender_user_id != $1
           ON CONFLICT (message_id, user_id) DO NOTHING"#,
    )
    .bind(user_id)
    .bind(conversation_id)
    .bind(seq)
    .execute(db)
    .await;

    // Broadcast read_receipt to conversation members so senders see checkmarks update
    let member_ids = get_conv_member_ids(ws_state, db, conversation_id, user_id).await;
    ws_state.broadcast_to_members(
        &member_ids,
        &json!({
            "type": "read_receipt",
            "conversationId": conversation_id,
            "userId": user_id,
            "seq": seq,
        }),
        redis,
    );
}

/// Update thread_summaries when a message is posted to a thread.
/// Uses UPSERT: creates the summary on first reply, increments on subsequent replies.
async fn update_thread_summary(
    db: &PgPool,
    thread_id: &str,
    sender_user_id: Option<&str>,
    sender_agent_id: Option<&str>,
) {
    let _ = sqlx::query(
        r#"INSERT INTO thread_summaries (thread_id, reply_count, last_reply_at, last_reply_user_id, last_reply_agent_id, participant_ids)
           VALUES ($1::uuid, 1, NOW(), $2, $3::uuid,
             CASE
               WHEN $2 IS NOT NULL THEN ARRAY[$2]
               WHEN $3 IS NOT NULL THEN ARRAY[$3::text]
               ELSE '{}'
             END
           )
           ON CONFLICT (thread_id) DO UPDATE SET
             reply_count = thread_summaries.reply_count + 1,
             last_reply_at = NOW(),
             last_reply_user_id = COALESCE($2, thread_summaries.last_reply_user_id),
             last_reply_agent_id = COALESCE($3::uuid, thread_summaries.last_reply_agent_id),
             participant_ids = CASE
               WHEN $2 IS NOT NULL AND NOT (thread_summaries.participant_ids @> ARRAY[$2])
                 THEN array_append(thread_summaries.participant_ids, $2)
               WHEN $3 IS NOT NULL AND NOT (thread_summaries.participant_ids @> ARRAY[$3::text])
                 THEN array_append(thread_summaries.participant_ids, $3::text)
               ELSE thread_summaries.participant_ids
             END"#,
    )
    .bind(thread_id)
    .bind(sender_user_id)
    .bind(sender_agent_id)
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
    client_msg_id: Option<String>,
    client_metadata: Option<serde_json::Value>,
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

    // Check mute status for community conversations
    if conv_type == "community" {
        let muted = sqlx::query_as::<_, (bool, Option<DateTime<Utc>>)>(
            r#"SELECT cm.is_muted, cm.muted_until
               FROM community_members cm
               JOIN communities c ON c.id = cm.community_id
               WHERE c.conversation_id = $1::uuid AND cm.user_id = $2"#,
        )
        .bind(conversation_id)
        .bind(user_id)
        .fetch_optional(db)
        .await
        .ok()
        .flatten();

        if let Some((is_muted, muted_until)) = muted {
            if is_muted {
                let still_muted = muted_until.map_or(true, |until| Utc::now() < until);
                if still_muted {
                    // Send error back to user
                    ws_state.send_to_user_or_queue(user_id, &json!({
                        "type": "error",
                        "code": "muted",
                        "message": "You are muted in this community",
                        "mutedUntil": muted_until,
                    }), redis);
                    return;
                }
            }
        }
    }

    // Determine target agent(s)
    let agent_ids: Vec<String> = if conv_type == "group" || conv_type == "community" {
        let members = sqlx::query_as::<_, (String,)>(
            r#"SELECT DISTINCT agent_id::text FROM conversation_members WHERE conversation_id = $1::uuid"#,
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

            let msg_id = client_msg_id.as_deref()
                .and_then(|s| uuid::Uuid::parse_str(s).ok())
                .unwrap_or_else(uuid::Uuid::new_v4);
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

            // Spawn link preview extraction in background
            {
                let db2 = db.clone();
                let mid = msg_id.to_string();
                let text = content.to_string();
                let ws2 = ws_state.clone();
                let redis2 = redis.clone();
                let cid = conversation_id.to_string();
                let uid = user_id.to_string();
                tokio::spawn(async move {
                    let previews = crate::services::link_preview::attach_link_previews(&db2, &mid, &text).await;
                    if !previews.is_empty() {
                        let members = get_conv_member_ids(&ws2, &db2, &cid, &uid).await;
                        ws2.broadcast_to_members(&members, &serde_json::json!({
                            "type": "link_previews_ready",
                            "conversationId": &cid,
                            "messageId": &mid,
                            "linkPreviews": previews,
                        }), &redis2);
                    }
                });
            }

            let _ = sqlx::query(
                r#"UPDATE conversations SET updated_at = NOW() WHERE id = $1::uuid"#,
            )
            .bind(conversation_id)
            .execute(db)
            .await;

            // Update thread summary if this message is part of a thread
            if let Some(ref tid) = thread_id {
                update_thread_summary(db, tid, Some(user_id), None).await;
            }

            // Fetch sender info for broadcast
            let sender_info = sqlx::query_as::<_, (Option<String>, Option<String>, Option<String>, bool)>(
                r#"SELECT name, username, image, is_verified FROM "user" WHERE id = $1"#,
            )
            .bind(user_id)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();

            let mut sender_name = sender_info.as_ref().and_then(|(n, _, _, _)| n.as_deref()).unwrap_or("").to_string();
            let sender_username = sender_info.as_ref().and_then(|(_, u, _, _)| u.as_deref()).unwrap_or("");
            let mut sender_image_owned = sender_info.as_ref().and_then(|(_, _, img, _)| img.clone());
            let sender_is_verified = sender_info.as_ref().map(|(_, _, _, v)| *v).unwrap_or(false);

            // For community conversations, substitute with anonymous display_name/avatar
            if conv_type == "community" {
                if let Ok(Some((dn, ma))) = sqlx::query_as::<_, (Option<String>, Option<String>)>(
                    r#"SELECT cm.display_name, cm.member_avatar_url
                       FROM community_members cm
                       JOIN communities c ON c.id = cm.community_id
                       WHERE c.conversation_id = $1::uuid AND cm.user_id = $2"#,
                )
                .bind(conversation_id)
                .bind(user_id)
                .fetch_optional(db)
                .await
                {
                    if let Some(dn) = dn { sender_name = dn; }
                    if ma.is_some() { sender_image_owned = ma; }
                }
            }
            let sender_image = sender_image_owned.as_deref();

            // Broadcast new message to all conversation members
            let member_ids = get_conv_member_ids(ws_state, db, conversation_id, user_id).await;
            // Anonymize identity fields for community conversations
            let (broadcast_user_id, broadcast_username, broadcast_is_verified): (String, &str, bool) = if conv_type == "community" {
                use sha2::{Sha256, Digest};
                let mut hasher = Sha256::new();
                hasher.update(conversation_id.as_bytes());
                hasher.update(user_id.as_bytes());
                (format!("anon-{}", hex::encode(&hasher.finalize()[..8])), "", false)
            } else {
                (user_id.to_string(), sender_username, sender_is_verified)
            };
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
                    "senderUserId": broadcast_user_id,
                    "senderUserName": &sender_name,
                    "senderUsername": broadcast_username,
                    "senderUserImage": sender_image,
                    "senderIsVerified": broadcast_is_verified,
                    "replyToId": reply_to_id,
                    "threadId": thread_id,
                    "createdAt": chrono::Utc::now().to_rfc3339(),
                    "updatedAt": chrono::Utc::now().to_rfc3339(),
                }
            });
            ws_state.broadcast_to_members(&member_ids, &msg_event, redis);

            // Push notification for human message to other members
            for mid in &member_ids {
                if mid == user_id { continue; }
                // Suppress push if user is in foreground AND hasn't enabled always_push_mobile
                if ws_state.is_user_foreground(mid) {
                    let always_push = sqlx::query_scalar::<_, bool>(
                        "SELECT always_push_mobile FROM notification_preferences WHERE user_id = $1"
                    ).bind(mid).fetch_optional(db).await.ok().flatten().unwrap_or(false);
                    if !always_push { continue; }
                }
                if let Ok(false) = is_conversation_muted(db, mid, conversation_id).await {
                    if let Ok(true) = should_send_push(db, mid, "message").await {
                        let preview = {
                            let truncated = safe_truncate(&content, 100);
                            if truncated.len() < content.len() {
                                format!("{}...", truncated)
                            } else {
                                content.to_string()
                            }
                        };
                        let _ = send_push_to_user(
                            db,
                            config,
                            mid,
                            &crate::services::push::PushPayload {
                                notification_type: "message".into(),
                                title: sender_name.clone(),
                                body: preview,
                                url: Some(format!("/?c={}&m={}", conversation_id, msg_id)),
                                message_id: Some(msg_id.to_string()),
                            },
                        )
                        .await;
                    }
                }
            }
        }
        return;
    }

    // Two-layer filtering: mention_only (conversation-level) × listen_mode (per-agent)
    // Build AgentFilterConfig for each agent (requires DB queries for group conversations)
    let agent_configs: Vec<AgentFilterConfig> = if conv_type == "group" || conv_type == "community" {
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
                // Fetch allowed_user_ids if listen_mode needs allowlist
                let allowed_user_ids = if matches!(listen_mode.as_str(), "owner_and_allowlist" | "allowlist_mentions" | "allowed_users") {
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
        // For non-group conversations, configs are not inspected by the filter
        agent_ids.iter().map(|aid| AgentFilterConfig {
            agent_id: aid.clone(),
            listen_mode: "all".into(),
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
    let mut saved_user_msg_id: Option<String> = None;
    if !skip_user_message {
        let user_seq = match get_next_seq(db, conversation_id).await {
            Ok(s) => s,
            Err(_) => return,
        };

        let user_msg_id = client_msg_id.as_deref()
            .and_then(|s| uuid::Uuid::parse_str(s).ok())
            .unwrap_or_else(uuid::Uuid::new_v4);
        saved_user_msg_id = Some(user_msg_id.to_string());
        let now = chrono::Utc::now();

        // Detect sticker messages and build metadata for DB storage
        let sticker_re = regex_lite::Regex::new(r"^!\[sticker\]\((/stickers/(.+)/(.+\.\w+))\)$").unwrap();
        let msg_metadata: Option<serde_json::Value> = if let Some(caps) = sticker_re.captures(content.trim()) {
            let sticker_url = caps.get(1).unwrap().as_str();
            let filename = caps.get(3).unwrap().as_str();

            let sticker_row = sqlx::query_as::<_, (Option<String>,)>(
                r#"SELECT s.agent_prompt FROM stickers s WHERE s.filename = $1 LIMIT 1"#,
            )
            .bind(filename)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();

            match sticker_row {
                Some((Some(ref prompt),)) if !prompt.is_empty() => {
                    Some(json!({
                        "type": "sticker",
                        "stickerUrl": sticker_url,
                        "agentPrompt": prompt
                    }))
                }
                _ => {
                    Some(json!({
                        "type": "sticker",
                        "stickerUrl": sticker_url
                    }))
                }
            }
        } else {
            client_metadata.clone()
        };

        let _ = sqlx::query(
                r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_user_id, reply_to_id, thread_id, metadata, created_at, updated_at)
                   VALUES ($1, $2::uuid, $3, 'user', $4, 'completed', $5, $6::uuid, $7::uuid, $8, $9, $9)"#,
            )
            .bind(user_msg_id)
            .bind(conversation_id)
            .bind(user_seq)
            .bind(content)
            .bind(user_id)
            .bind(reply_to_id.as_deref())
            .bind(thread_id.as_deref())
            .bind(&msg_metadata)
            .bind(now.naive_utc())
            .execute(db)
            .await;

        {
            // Spawn link preview extraction in background
            {
                let db2 = db.clone();
                let mid = user_msg_id.to_string();
                let text = content.to_string();
                let ws2 = ws_state.clone();
                let redis2 = redis.clone();
                let cid = conversation_id.to_string();
                let uid = user_id.to_string();
                tokio::spawn(async move {
                    let previews = crate::services::link_preview::attach_link_previews(&db2, &mid, &text).await;
                    if !previews.is_empty() {
                        let members = get_conv_member_ids(&ws2, &db2, &cid, &uid).await;
                        ws2.broadcast_to_members(&members, &serde_json::json!({
                            "type": "link_previews_ready",
                            "conversationId": &cid,
                            "messageId": &mid,
                            "linkPreviews": previews,
                        }), &redis2);
                    }
                });
            }

            let _ = sqlx::query(
                r#"UPDATE conversations SET updated_at = NOW() WHERE id = $1::uuid"#,
            )
            .bind(conversation_id)
            .execute(db)
            .await;

            // Update thread summary if this message is part of a thread
            if let Some(ref tid) = thread_id {
                update_thread_summary(db, tid, Some(user_id), None).await;
            }
        }

        // Broadcast user message to all conversation members (for group/community visibility)
        if conv_type == "group" || conv_type == "community" {
            let sender_info = sqlx::query_as::<_, (Option<String>, Option<String>, Option<String>, bool)>(
                r#"SELECT name, username, image, is_verified FROM "user" WHERE id = $1"#,
            )
            .bind(user_id)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();

            let mut sender_name = sender_info.as_ref().and_then(|(n, _, _, _)| n.as_deref()).unwrap_or("").to_string();
            let sender_username = sender_info.as_ref().and_then(|(_, u, _, _)| u.as_deref()).unwrap_or("");
            let mut sender_image_owned = sender_info.as_ref().and_then(|(_, _, img, _)| img.clone());
            let sender_is_verified = sender_info.as_ref().map(|(_, _, _, v)| *v).unwrap_or(false);

            // For community conversations, substitute with anonymous display_name/avatar
            if conv_type == "community" {
                if let Ok(Some((dn, ma))) = sqlx::query_as::<_, (Option<String>, Option<String>)>(
                    r#"SELECT cm.display_name, cm.member_avatar_url
                       FROM community_members cm
                       JOIN communities c ON c.id = cm.community_id
                       WHERE c.conversation_id = $1::uuid AND cm.user_id = $2"#,
                )
                .bind(conversation_id)
                .bind(user_id)
                .fetch_optional(db)
                .await
                {
                    if let Some(dn) = dn { sender_name = dn; }
                    if ma.is_some() { sender_image_owned = ma; }
                }
            }
            let sender_image = sender_image_owned.as_deref();

            let member_ids = get_conv_member_ids(ws_state, db, conversation_id, user_id).await;
            // Anonymize identity fields for community conversations
            let (broadcast_user_id, broadcast_username, broadcast_is_verified): (String, &str, bool) = if conv_type == "community" {
                use sha2::{Sha256, Digest};
                let mut hasher = Sha256::new();
                hasher.update(conversation_id.as_bytes());
                hasher.update(user_id.as_bytes());
                (format!("anon-{}", hex::encode(&hasher.finalize()[..8])), "", false)
            } else {
                (user_id.to_string(), sender_username, sender_is_verified)
            };
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
                    "senderUserId": broadcast_user_id,
                    "senderUserName": &sender_name,
                    "senderUsername": broadcast_username,
                    "senderUserImage": sender_image,
                    "senderIsVerified": broadcast_is_verified,
                    "replyToId": reply_to_id,
                    "threadId": thread_id,
                    "metadata": msg_metadata,
                    "createdAt": now.to_rfc3339(),
                    "updatedAt": now.to_rfc3339(),
                }
            });
            ws_state.broadcast_to_members(&member_ids, &user_msg_event, redis);

            // Push notification for human message to other group members
            for mid in &member_ids {
                if mid == user_id { continue; }
                // Suppress push if user is in foreground AND hasn't enabled always_push_mobile
                if ws_state.is_user_foreground(mid) {
                    let always_push = sqlx::query_scalar::<_, bool>(
                        "SELECT always_push_mobile FROM notification_preferences WHERE user_id = $1"
                    ).bind(mid).fetch_optional(db).await.ok().flatten().unwrap_or(false);
                    if !always_push { continue; }
                }
                if let Ok(false) = is_conversation_muted(db, mid, conversation_id).await {
                    if let Ok(true) = should_send_push(db, mid, "message").await {
                        let preview = {
                            let truncated = safe_truncate(&content, 100);
                            if truncated.len() < content.len() {
                                format!("{}...", truncated)
                            } else {
                                content.to_string()
                            }
                        };
                        let _ = send_push_to_user(
                            db,
                            config,
                            mid,
                            &crate::services::push::PushPayload {
                                notification_type: "message".into(),
                                title: sender_name.clone(),
                                body: preview,
                                url: Some(format!("/?c={}&m={}", conversation_id, user_msg_id)),
                                message_id: Some(user_msg_id.to_string()),
                            },
                        )
                        .await;
                    }
                }
            }
        }
    }

    // Skip agent dispatch for non-AI stickers (stickers without agent_prompt)
    let is_non_ai_sticker = {
        let sticker_check_re = regex_lite::Regex::new(r"^!\[sticker\]\((/stickers/(.+)/(.+\.\w+))\)$").unwrap();
        if let Some(caps) = sticker_check_re.captures(content.trim()) {
            let filename = caps.get(3).unwrap().as_str();
            let has_prompt = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM stickers WHERE filename = $1 AND agent_prompt IS NOT NULL AND agent_prompt != '')",
            )
            .bind(filename)
            .fetch_one(db)
            .await
            .unwrap_or(false);
            !has_prompt
        } else {
            false
        }
    };

    // Dispatch to each agent (may be empty if mention_only and no mentions matched)
    if is_non_ai_sticker {
        tracing::info!("Skipping agent dispatch for non-AI sticker in conv={}", conversation_id);
    }
    for agent_id in &dispatch_ids {
        if is_non_ai_sticker {
            continue;
        }
        // Per-agent queue: if this specific agent has an active stream, queue it
        if ws_state.has_active_stream_for_agent(conversation_id, agent_id) {
            let queue_key = format!("{}:{}", conversation_id, agent_id);

            // Dedup: skip if this message is already queued for this agent
            let already_queued = ws_state.agent_response_queues.get(&queue_key)
                .map(|q| q.iter().any(|item| item.user_message_id.as_deref() == saved_user_msg_id.as_deref() && saved_user_msg_id.is_some()))
                .unwrap_or(false);
            if already_queued {
                tracing::info!("Agent skip duplicate queue: conv={} agent={} msg={:?}", conversation_id, agent_id, saved_user_msg_id);
                continue;
            }

            tracing::info!("Agent queued (active stream): conv={} agent={}", conversation_id, agent_id);
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
                    thread_id: thread_id.clone(),
                    user_message_id: saved_user_msg_id.clone(),
                    metadata: client_metadata.clone(),
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
                "messageId": saved_user_msg_id,
            }));

            continue;
        }

        // Skip agent trigger for sticker messages without AI tag (agentPrompt)
        let sticker_check_re = regex_lite::Regex::new(r"^!\[sticker\]\((/stickers/(.+)/(.+\.\w+))\)$").unwrap();
        let is_sticker_without_ai = if let Some(caps) = sticker_check_re.captures(content.trim()) {
            let pack_slug = caps.get(2).unwrap().as_str();
            let filename = caps.get(3).unwrap().as_str();
            let has_prompt = sqlx::query_scalar::<_, bool>(
                r#"SELECT EXISTS(
                    SELECT 1 FROM stickers s
                    JOIN sticker_packs sp ON sp.id = s.pack_id
                    WHERE sp.slug = $1 AND s.filename = $2
                      AND s.agent_prompt IS NOT NULL AND s.agent_prompt != ''
                )"#,
            )
            .bind(pack_slug)
            .bind(filename)
            .fetch_one(db)
            .await
            .unwrap_or(false);
            !has_prompt
        } else {
            false
        };

        if !is_sticker_without_ai {
            // Inject relevant agent memories into message context
            let enriched_content = inject_agent_memories(db, config, agent_id, content).await;
            do_trigger_agent_response(
                user_id,
                agent_id,
                conversation_id,
                &enriched_content,
                reply_to_id.as_deref(),
                thread_id.as_deref(),
                &conv_type,
                client_metadata.as_ref(),
                ws_state,
                db,
                redis,
                config,
            )
            .await;
        }
    }
}

/// Actually send the task to the agent and set up streaming callbacks.
pub(crate) async fn do_trigger_agent_response(
    user_id: &str,
    agent_id: &str,
    conversation_id: &str,
    content: &str,
    reply_to_id: Option<&str>,
    thread_id: Option<&str>,
    conv_type: &str,
    client_metadata: Option<&serde_json::Value>,
    ws_state: &WsState,
    db: &PgPool,
    redis: &deadpool_redis::Pool,
    config: &crate::config::Config,
) {
    // Dedup: prevent same content dispatched to same agent within 5 seconds
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    content.hash(&mut hasher);
    let dedup_key = format!("{}:{}:{}", conversation_id, agent_id, hasher.finish());
    let now = std::time::Instant::now();
    if let Some(prev) = ws_state.recent_dispatches.get(&dedup_key) {
        if now.duration_since(*prev).as_secs() < 5 {
            tracing::info!("Dedup: skipping duplicate dispatch conv={} agent={}", conversation_id, agent_id);
            return;
        }
    }
    ws_state.recent_dispatches.insert(dedup_key, now);

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

    let thread_id: Option<String> = thread_id.map(|s| s.to_string());

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
            "senderAgentName": agent_name,
            "threadId": thread_id
        }), redis);

        ws_state.broadcast_to_members(&member_ids, &json!({
            "type": "stream_error",
            "conversationId": conversation_id,
            "messageId": err_msg_id,
            "seq": err_seq,
            "threadId": thread_id,
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
            r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_agent_id, thread_id, created_at, updated_at)
               VALUES ($1::uuid, $2::uuid, $3, 'agent', '', 'streaming', $4::uuid, $5::uuid, NOW(), NOW())"#,
        )
        .bind(&agent_msg_id)
        .bind(conversation_id)
        .bind(agent_seq)
        .bind(agent_id)
        .bind(thread_id.as_deref())
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
            "senderAgentName": agent_name,
            "threadId": thread_id
        }), redis);

    // Detect sticker messages and look up agent_prompt
    let sticker_regex = regex_lite::Regex::new(r"^!\[sticker\]\((/stickers/(.+)/(.+\.\w+))\)$").unwrap();
    let sticker_metadata: Option<serde_json::Value> = if let Some(caps) = sticker_regex.captures(content.trim()) {
        let sticker_url = caps.get(1).unwrap().as_str();
        let filename = caps.get(3).unwrap().as_str();

        // Look up the sticker's agent_prompt by filename
        let sticker_row = sqlx::query_as::<_, (Option<String>,)>(
            r#"SELECT s.agent_prompt FROM stickers s WHERE s.filename = $1 LIMIT 1"#,
        )
        .bind(filename)
        .fetch_optional(db)
        .await
        .ok()
        .flatten();

        match sticker_row {
            Some((Some(ref prompt),)) if !prompt.is_empty() => {
                Some(json!({
                    "type": "sticker",
                    "stickerUrl": sticker_url,
                    "agentPrompt": prompt
                }))
            }
            _ => {
                Some(json!({
                    "type": "sticker",
                    "stickerUrl": sticker_url
                }))
            }
        }
    } else {
        None
    };

    // For sticker messages with agent_prompt, override the content sent to agent
    let effective_content = if let Some(ref meta) = sticker_metadata {
        if let Some(prompt) = meta.get("agentPrompt").and_then(|v| v.as_str()) {
            format!("[User sent a sticker: {}]", prompt)
        } else {
            content.to_string()
        }
    } else {
        content.to_string()
    };

    // --- Skill slash command injection ---
    let effective_content = if effective_content.starts_with("//") {
        let without_slashes = effective_content.trim_start_matches('/');
        let (cmd, user_args) = match without_slashes.split_once(' ') {
            Some((c, a)) => (c.trim(), a.trim()),
            None => (without_slashes.trim(), ""),
        };

        let skill_prompt = sqlx::query_as::<_, (String,)>(
            r#"SELECT s.prompt_content
               FROM skills s
               JOIN agent_skills ask ON ask.skill_id = s.id
               WHERE (s.slash_command = $1 OR s.slash_command = $2)
               AND ask.agent_id = $3::uuid
               AND ask.is_enabled = true
               LIMIT 1"#,
        )
        .bind(format!("/{}", cmd))
        .bind(cmd)
        .bind(agent_id)
        .fetch_optional(db)
        .await;

        match skill_prompt {
            Ok(Some((prompt,))) if !prompt.is_empty() => {
                if user_args.is_empty() {
                    prompt.replace("$ARGUMENTS", "")
                } else if prompt.contains("$ARGUMENTS") {
                    prompt.replace("$ARGUMENTS", user_args)
                } else {
                    format!("{}\n\n[User Input]\n{}", prompt, user_args)
                }
            }
            _ => effective_content,
        }
    } else {
        effective_content
    };

    // Wrap untrusted content for agent (non-owner messages in 1-on-1)
    let conv_owner = sqlx::query_scalar::<_, String>(
        "SELECT user_id FROM conversations WHERE id = $1::uuid",
    )
    .bind(conversation_id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
    .unwrap_or_default();

    let effective_content = if user_id != conv_owner && !conv_owner.is_empty() && (conv_type == "h2a" || conv_type == "h2h" || conv_type == "direct" || conv_type == "official") {
        let wrap_name = sqlx::query_scalar::<_, String>(
            r#"SELECT name FROM "user" WHERE id = $1"#,
        )
        .bind(user_id)
        .fetch_optional(db)
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| "Unknown".to_string());
        format!(
            "[UNTRUSTED_USER_MESSAGE sender=\"{}\" senderId=\"{}\"]\n{}\n[/UNTRUSTED_USER_MESSAGE]",
            wrap_name, user_id, effective_content
        )
    } else {
        effective_content
    };

    // Prepend system prompt if configured
    let task_content = match &system_prompt {
        Some(prompt) if !prompt.is_empty() => {
            format!("[System Prompt]\n{}\n\n[User Message]\n{}", prompt, effective_content)
        }
        _ => effective_content,
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

    // Anonymize sender identity for community conversations (agents shouldn't see real identity either)
    let (task_sender_user_id, task_sender_username): (String, Option<String>) = if conv_type == "community" {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(conversation_id.as_bytes());
        hasher.update(user_id.as_bytes());
        (format!("anon-{}", hex::encode(&hasher.finalize()[..8])), None)
    } else {
        (user_id.to_string(), sender_username)
    };

    // Build task payload with group context and reply context
    let mut task_payload = json!({
        "type": "task",
        "taskId": agent_msg_id,
        "conversationId": conversation_id,
        "content": task_content,
        "conversationType": conv_type,
        "senderUserId": task_sender_user_id,
        "senderUsername": task_sender_username
    });

    // Add sticker metadata to task payload if present
    if let Some(ref meta) = sticker_metadata {
        task_payload["stickerMetadata"] = meta.clone();
    }

    // Add client message metadata (rich cards: kanban_card, commit, etc.) to task payload
    if let Some(meta) = client_metadata {
        task_payload["messageMetadata"] = meta.clone();
    }

    // Add group members context
    if conv_type == "group" || conv_type == "community" {
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
            let preview = if ref_content.len() > 500 {
                let mut end = 500;
                while !ref_content.is_char_boundary(end) { end -= 1; }
                &ref_content[..end]
            } else { &ref_content };
            task_payload["replyTo"] = json!({
                "role": role,
                "content": preview,
                "senderAgentName": agent_name_opt
            });
        }
    }

    // Fetch conversation history_limit (default 5)
    let history_limit = sqlx::query_scalar::<_, i32>(
        "SELECT COALESCE(history_limit, 5) FROM conversations WHERE id = $1::uuid",
    )
    .bind(conversation_id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
    .unwrap_or(5);

    // Fetch recent conversation history
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
           LIMIT $3"#,
    )
    .bind(conversation_id)
    .bind(&agent_msg_id)
    .bind(history_limit)
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

    // Inject memory capsule context for 1:1 agent conversations (hybrid search)
    {
        // Find capsule IDs this agent can access (grants + explicit access)
        let capsule_ids = sqlx::query_as::<_, (uuid::Uuid,)>(
            r#"SELECT DISTINCT sub.capsule_id FROM (
                SELECT mcg.capsule_id
                FROM memory_capsule_grants mcg
                JOIN memory_capsules mc ON mc.id = mcg.capsule_id
                WHERE mcg.agent_id = $1::uuid AND mc.status = 'ready'
                UNION
                SELECT aca.capsule_id
                FROM agent_capsule_access aca
                JOIN memory_capsules mc ON mc.id = aca.capsule_id
                WHERE aca.agent_id = $1::uuid AND mc.status = 'ready'
            ) sub"#,
        )
        .bind(agent_id)
        .fetch_all(db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(id,)| id)
        .collect::<Vec<_>>();

        if !capsule_ids.is_empty() {
            // Embed the user query for vector search
            if let Some(ref openai_key) = config.openai_api_key {
                let embed_client = reqwest::Client::new();
                if let Ok(embeddings) = crate::services::embedding::generate_embeddings(
                    &embed_client,
                    openai_key,
                    &[content.to_string()],
                    crate::services::embedding::EMBEDDING_MODEL,
                ).await {
                    if let Some(query_emb) = embeddings.into_iter().next() {
                        if let Ok(results) = crate::services::memory::hybrid_search(
                            db,
                            &capsule_ids,
                            query_emb,
                            content,
                            10,
                        ).await {
                            if !results.is_empty() {
                                let memories: Vec<serde_json::Value> = results
                                    .into_iter()
                                    .map(|r| json!({
                                        "content": r.content,
                                        "capsuleName": r.capsule_name,
                                        "relevance": (r.score * 100.0).round() / 100.0,
                                    }))
                                    .collect();
                                task_payload["memoryContext"] = json!(memories);
                            }
                        }
                    }
                }
            }
        }
    }

    // Inject agent memories via hybrid search (vector + keyword)
    if let Some(ref openai_key) = config.openai_api_key {
        let embed_client = reqwest::Client::new();
        if let Ok(embeddings) = crate::services::embedding::generate_embeddings(
            &embed_client,
            openai_key,
            &[content.to_string()],
            crate::services::embedding::EMBEDDING_MODEL,
        ).await {
            if let Some(query_emb) = embeddings.into_iter().next() {
                if let Ok(results) = crate::routes::agent_memories::hybrid_search(
                    db,
                    uuid::Uuid::parse_str(agent_id).unwrap_or_default(),
                    query_emb,
                    content,
                    20,
                ).await {
                    if !results.is_empty() {
                        let agent_mems: Vec<serde_json::Value> = results
                            .into_iter()
                            .map(|r| json!({
                                "category": r.category,
                                "summary": r.summary,
                                "detail": r.detail,
                                "relevance": (r.score * 100.0).round() / 100.0,
                            }))
                            .collect();
                        task_payload["agentMemories"] = json!(agent_mems);
                    }
                }
            }
        }
    }

    // Inject available skills for semantic triggering
    let installed_skills = sqlx::query_as::<_, (String, String, Option<String>, String)>(
        r#"SELECT s.slug, s.name, s.slash_command, s.description
           FROM agent_skills ask
           JOIN skills s ON s.id = ask.skill_id
           WHERE ask.agent_id = $1::uuid AND ask.is_enabled = true
           ORDER BY s.name"#,
    )
    .bind(agent_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    if !installed_skills.is_empty() {
        let skills_json: Vec<serde_json::Value> = installed_skills
            .iter()
            .map(|(slug, name, slash_cmd, desc)| {
                json!({
                    "slug": slug,
                    "name": name,
                    "slashCommand": slash_cmd,
                    "description": desc
                })
            })
            .collect();
        task_payload["availableSkills"] = json!(skills_json);
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
    let thread_id = thread_id;

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
                    "threadId": &thread_id,
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
                                "threadId": &thread_id,
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
                            // Always prefer stream_accumulated (clean push_str concat) over
                            // full_content which may contain spurious \n\n at chunk boundaries.
                            let full_content = if !stream_accumulated.is_empty() {
                                if !full_content.is_empty() && full_content != stream_accumulated {
                                    tracing::info!(
                                        "Stream complete: preferring accumulated chunks over agent content: conv={} agent={} msgId={} accumulated_len={} agent_len={}",
                                        conversation_id, agent_id, agent_msg_id_clone, stream_accumulated.len(), full_content.len()
                                    );
                                }
                                stream_accumulated.clone()
                            } else {
                                full_content
                            };

                            tracing::info!(
                                "Stream complete: conv={} agent={} msgId={} content_len={} chunks_accumulated={}",
                                conversation_id, agent_id, agent_msg_id_clone,
                                full_content.len(), stream_accumulated.len()
                            );
                            ws_state.stream_cancellers.remove(&agent_msg_id_clone);

                            if let Ok(mut conn) = redis.get().await {
                                let _: Result<(), _> = conn.del(&format!("stream:{}", agent_msg_id_clone)).await;
                            }

                            if full_content.trim().is_empty() {
                                // Empty completion — delete the placeholder message
                                let _ = sqlx::query(
                                    r#"DELETE FROM messages WHERE id = $1::uuid AND status = 'streaming'"#,
                                )
                                .bind(&agent_msg_id_clone)
                                .execute(&db)
                                .await;
                                tracing::info!(
                                    "stream_end reason=empty_content (deleted placeholder) conv={} agent={} msgId={}",
                                    conversation_id, agent_id, agent_msg_id_clone
                                );
                            } else {
                                let _ = sqlx::query(
                                    r#"UPDATE messages SET content = $1, status = 'completed', updated_at = NOW() WHERE id = $2::uuid"#,
                                )
                                .bind(&full_content)
                                .bind(&agent_msg_id_clone)
                                .execute(&db)
                                .await;
                                tracing::info!(
                                    "stream_end reason=completed conv={} agent={} msgId={} len={}",
                                    conversation_id, agent_id, agent_msg_id_clone, full_content.len()
                                );

                                // Spawn link preview extraction in background
                                {
                                    let db3 = db.clone();
                                    let mid = agent_msg_id_clone.clone();
                                    let text = full_content.clone();
                                    let ws3 = ws_state.clone();
                                    let redis3 = redis.clone();
                                    let cid3 = conversation_id.clone();
                                    let mids3 = member_ids.clone();
                                    tokio::spawn(async move {
                                        let previews = crate::services::link_preview::attach_link_previews(&db3, &mid, &text).await;
                                        if !previews.is_empty() {
                                            ws3.broadcast_to_members(&mids3, &serde_json::json!({
                                                "type": "link_previews_ready",
                                                "conversationId": &cid3,
                                                "messageId": &mid,
                                                "linkPreviews": previews,
                                            }), &redis3);
                                        }
                                    });
                                }


                                // Spawn auto memory extraction in background (throttled)
                                {
                                    let db4 = db.clone();
                                    let aid = agent_id.clone();
                                    let cid4 = conversation_id.clone();
                                    let oai_key = config.openai_api_key.clone();
                                    if let (Ok(aid_uuid), Ok(cid_uuid)) = (
                                        uuid::Uuid::parse_str(&aid),
                                        uuid::Uuid::parse_str(&cid4),
                                    ) {
                                        // Pre-spawn throttle check avoids unnecessary task creation
                                        if crate::routes::agent_memories::should_extract_memories(&db4, aid_uuid, cid_uuid).await {
                                            tokio::spawn(async move {
                                                crate::routes::agent_memories::maybe_extract_memories(&db4, aid_uuid, cid_uuid, oai_key).await;
                                            });
                                        }
                                    }
                                }
                            }
                            ws_state.broadcast_to_members(&member_ids, &json!({
                                "type": "stream_end",
                                "conversationId": &conversation_id,
                                "messageId": &agent_msg_id_clone,
                                "seq": agent_seq,
                                "threadId": &thread_id,
                                "content": &full_content,
                                "senderAgentId": &agent_id,
                                "senderAgentName": &agent_name,
                                "reason": "completed"
                            }), &redis);

                            // Update thread summary if agent reply is in a thread
                            if let Some(ref tid) = thread_id {
                                update_thread_summary(&db, tid, None, Some(&agent_id)).await;
                            }

                            // Push notification for agent message — send to all conversation members
                            for mid in &member_ids {
                                // Skip push if user has the app in foreground
                                if ws_state.is_user_foreground(mid) { continue; }
                                if let Ok(false) = is_conversation_muted(&db, mid, &conversation_id).await {
                                    if let Ok(true) = should_send_push(&db, mid, "message").await {
                                        let preview = {
                                            let truncated = safe_truncate(&full_content, 100);
                                            if truncated.len() < full_content.len() {
                                                format!("{}...", truncated)
                                            } else {
                                                full_content.clone()
                                            }
                                        };
                                        let _ = send_push_to_user(
                                            &db,
                                            &config,
                                            mid,
                                            &crate::services::push::PushPayload {
                                                notification_type: "message".into(),
                                                title: agent_name.clone(),
                                                body: preview,
                                                url: Some(format!("/?c={}&m={}", conversation_id, agent_msg_id_clone)),
                                                message_id: Some(agent_msg_id_clone.clone()),
                                            },
                                        )
                                        .await;
                                    }
                                }
                            }
                            ws_state.active_streams.remove(&stream_key);
                            process_next_in_queue(&stream_key, &ws_state, &db, &redis, &config);

                            // Save mentions for dispatch after the select loop
                            if !mentions.is_empty() && (conv_type == "group" || conv_type == "community") {
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
                                "threadId": &thread_id,
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
                                    "threadId": &thread_id,
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

                                tracing::info!(
                                    "stream_end reason=agent_disconnect conv={} agent={} msgId={} len={}",
                                    conversation_id, agent_id, agent_msg_id_clone, stream_accumulated.len()
                                );
                                ws_state.broadcast_to_members(&member_ids, &json!({
                                    "type": "stream_end",
                                    "conversationId": &conversation_id,
                                    "messageId": &agent_msg_id_clone,
                                    "seq": agent_seq,
                                    "threadId": &thread_id,
                                    "content": &stream_accumulated,
                                    "senderAgentId": &agent_id,
                                    "senderAgentName": &agent_name,
                                    "reason": "agent_disconnect"
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
                        tracing::info!(
                            "stream_end reason=cancelled conv={} agent={} msgId={}",
                            conversation_id, agent_id, agent_msg_id_clone
                        );
                        ws_state.broadcast_to_members(&member_ids, &json!({
                            "type": "stream_end",
                            "conversationId": &conversation_id,
                            "messageId": &agent_msg_id_clone,
                            "seq": agent_seq,
                            "threadId": &thread_id,
                            "senderAgentId": &agent_id,
                            "senderAgentName": &agent_name,
                            "reason": "cancelled"
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

        // Dispatch to agents via listen_mode filter (mirrors user message path)
        let mut already_dispatched = std::collections::HashSet::new();
        if conv_type == "group" || conv_type == "community" {
            // Build agent configs for all agents in the conversation
            let conv_agents = sqlx::query_as::<_, (String, String, Option<String>)>(
                r#"SELECT DISTINCT ON (cm.agent_id) cm.agent_id::text, cm.listen_mode::text, cm.owner_user_id
                   FROM conversation_members cm
                   WHERE cm.conversation_id = $1::uuid AND cm.agent_id IS NOT NULL"#,
            )
            .bind(&conversation_id)
            .fetch_all(&db)
            .await
            .unwrap_or_default();

            let mut agent_configs = Vec::new();
            for (aid, listen_mode, owner_id) in &conv_agents {
                if aid == &agent_id {
                    continue; // skip self
                }
                let allowed_user_ids = if matches!(listen_mode.as_str(), "owner_and_allowlist" | "allowlist_mentions" | "allowed_users") {
                    sqlx::query_as::<_, (String,)>(
                        r#"SELECT user_id FROM agent_listen_allowed_users
                           WHERE agent_id = $1::uuid AND conversation_id = $2::uuid"#,
                    )
                    .bind(aid)
                    .bind(&conversation_id)
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
                    listen_mode: listen_mode.clone(),
                    owner_user_id: owner_id.clone().unwrap_or_default(),
                    allowed_user_ids,
                });
            }

            let mention_ids = pending_mentions.as_ref()
                .map(|(m, _)| m.clone())
                .unwrap_or_default();

            let dispatch_ids = filter_agents_for_dispatch(
                false,
                &conv_type,
                &user_id,
                &mention_ids,
                &agent_configs,
            );

            let content_for_dispatch = pending_mentions.as_ref()
                .map(|(_, c)| c.clone())
                .unwrap_or_default();

            for target_id in &dispatch_ids {
                already_dispatched.insert(target_id.clone());
                spawn_mention_dispatch(
                    &user_id, target_id, &conversation_id, &content_for_dispatch,
                    &agent_msg_id_clone, &conv_type,
                    &ws_state, &db, &redis, &config,
                );
            }
        }

        // Dispatch to @mentioned agents not already dispatched by listen_mode filter
        if let Some((mentions, content)) = pending_mentions {
            for mentioned_id in mentions {
                if mentioned_id == agent_id || already_dispatched.contains(&mentioned_id) {
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
            None,
            &conv_type,
            None,
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
        .unwrap_or_else(|| "h2a".to_string());

        do_trigger_agent_response(
            &next.user_id,
            &next.agent_id,
            &next.conversation_id,
            &next.content,
            next.reply_to_id.as_deref(),
            next.thread_id.as_deref(),
            &conv_type,
            next.metadata.as_ref(),
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
