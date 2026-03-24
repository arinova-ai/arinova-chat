//! Unified `/api/v1/*` routes for Messages, Search, Memories, Skills, Files, Wiki, and Capsules.
//!
//! Uses `CallerIdentity` extractor — supports agent bot tokens, user sessions, and CLI API keys.

use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, patch, post},
    Router,
};
use chrono::NaiveDateTime;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::caller_identity::CallerIdentity;
use crate::routes::messages::{with_attachments, CursorTimestamp, MessageRow};
use crate::services::message_seq::get_next_seq;
use crate::services::push::send_push_to_user;
use crate::services::push_trigger::{is_conversation_muted, should_send_push};
use crate::ws::handler::{
    filter_agents_for_dispatch, get_conv_member_ids, do_trigger_agent_response, AgentFilterConfig,
};
use crate::ws::state::QueuedResponse;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // ── Messages ────────────────────────────────────────────────
        .route("/api/v1/messages/send", post(v1_send_message))
        .route("/api/v1/messages/search", get(v1_search_messages))
        .route(
            "/api/v1/messages/{conversationId}",
            get(v1_get_messages),
        )
        // ── Memories ────────────────────────────────────────────────
        .route(
            "/api/v1/memories",
            get(v1_list_memories).post(v1_create_memory),
        )
        .route(
            "/api/v1/memories/{id}",
            get(v1_get_memory).patch(v1_update_memory).delete(v1_delete_memory),
        )
        .route("/api/v1/memories/extract", post(v1_extract_memories))
        // ── Skills ──────────────────────────────────────────────────
        .route("/api/v1/skills/installed", get(v1_list_installed_skills))
        .route("/api/v1/skills/{slug}/prompt", get(v1_get_skill_prompt))
        // ── Files ───────────────────────────────────────────────────
        .route("/api/v1/files/upload", post(v1_upload_file))
        // ── Wiki ────────────────────────────────────────────────────
        .route("/api/v1/wiki", post(v1_create_wiki_page))
        .route("/api/v1/wiki/{pageId}", patch(v1_update_wiki_page))
        // ── Capsules ────────────────────────────────────────────────
        .route("/api/v1/capsules", get(v1_query_capsules))
}

// ═══════════════════════════════════════════════════════════════════════════
// Messages
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SendMessageBody {
    conversation_id: String,
    content: String,
}

/// POST /api/v1/messages/send
async fn v1_send_message(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Json(body): Json<SendMessageBody>,
) -> Response {
    let conversation_id = body.conversation_id.trim();
    let content = body.content.trim();

    if conversation_id.is_empty() || content.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "conversationId and content are required"})),
        )
            .into_response();
    }

    let owner_id = caller.owner_id().to_string();

    // Determine sender identity
    let (sender_agent_id, sender_role, agent_name) = if let Some(aid) = caller.agent_id() {
        // Look up agent name for WS events
        let name: String = sqlx::query_scalar::<_, String>(
            "SELECT name FROM agents WHERE id = $1",
        )
        .bind(aid)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| "Agent".to_string());
        (Some(aid.to_string()), "agent", Some(name))
    } else {
        (None, "user", None)
    };

    // Validate caller belongs to this conversation
    let membership = if let Some(ref aid) = sender_agent_id {
        sqlx::query_as::<_, (String, String)>(
            r#"SELECT c.user_id::text, c.type::text
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
        .bind(aid)
        .fetch_optional(&state.db)
        .await
    } else {
        sqlx::query_as::<_, (String, String)>(
            r#"SELECT c.user_id::text, c.type::text
               FROM conversations c
               WHERE c.id = $1::uuid
                 AND (
                   c.user_id = $2
                   OR EXISTS (
                     SELECT 1 FROM conversation_user_members cum
                     WHERE cum.conversation_id = c.id AND cum.user_id = $2
                   )
                 )"#,
        )
        .bind(conversation_id)
        .bind(&owner_id)
        .fetch_optional(&state.db)
        .await
    };

    let (user_id, conv_type) = match membership {
        Ok(Some(m)) => m,
        Ok(None) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Caller does not belong to this conversation"})),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!("v1_send_message: DB error: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Internal server error"})),
            )
                .into_response();
        }
    };

    // Create message
    let seq = match get_next_seq(&state.db, conversation_id).await {
        Ok(s) => s,
        Err(e) => {
            tracing::error!("v1_send_message: failed to get next seq: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Internal server error"})),
            )
                .into_response();
        }
    };

    let msg_id = Uuid::new_v4().to_string();

    if let Some(ref aid) = sender_agent_id {
        let _ = sqlx::query(
            r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_agent_id, created_at, updated_at)
               VALUES ($1::uuid, $2::uuid, $3, 'agent', $4, 'completed', $5::uuid, NOW(), NOW())"#,
        )
        .bind(&msg_id)
        .bind(conversation_id)
        .bind(seq)
        .bind(content)
        .bind(aid)
        .execute(&state.db)
        .await;
    } else {
        let _ = sqlx::query(
            r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_user_id, created_at, updated_at)
               VALUES ($1::uuid, $2::uuid, $3, $4, $5, 'completed', $6, NOW(), NOW())"#,
        )
        .bind(&msg_id)
        .bind(conversation_id)
        .bind(seq)
        .bind(sender_role)
        .bind(content)
        .bind(&owner_id)
        .execute(&state.db)
        .await;
    }

    // Spawn link preview extraction in background
    {
        let db2 = state.db.clone();
        let ws2 = state.ws.clone();
        let redis2 = state.redis.clone();
        let mid = msg_id.clone();
        let text = content.to_string();
        let cid = conversation_id.to_string();
        let uid = user_id.clone();
        tokio::spawn(async move {
            let previews =
                crate::services::link_preview::attach_link_previews(&db2, &mid, &text).await;
            if !previews.is_empty() {
                let members =
                    crate::ws::handler::get_conv_member_ids(&ws2, &db2, &cid, &uid).await;
                ws2.broadcast_to_members(
                    &members,
                    &json!({
                        "type": "link_previews_ready",
                        "conversationId": &cid,
                        "messageId": &mid,
                        "linkPreviews": previews,
                    }),
                    &redis2,
                );
            }
        });
    }

    let _ = sqlx::query(r#"UPDATE conversations SET updated_at = NOW() WHERE id = $1::uuid"#)
        .bind(conversation_id)
        .execute(&state.db)
        .await;

    // Deliver WS events (only for agent senders — mirrors agent_send behaviour)
    if let Some(ref aid) = sender_agent_id {
        let sender_name = agent_name.as_deref().unwrap_or("Agent");
        let stream_start = json!({
            "type": "stream_start",
            "conversationId": conversation_id,
            "messageId": &msg_id,
            "seq": seq,
            "senderAgentId": aid,
            "senderAgentName": sender_name,
        });
        let stream_end = json!({
            "type": "stream_end",
            "conversationId": conversation_id,
            "messageId": &msg_id,
            "seq": seq,
            "content": content,
            "senderAgentId": aid,
            "senderAgentName": sender_name,
            "reason": "agent_send"
        });

        if conv_type == "group" {
            let member_ids =
                get_conv_member_ids(&state.ws, &state.db, conversation_id, "").await;
            state
                .ws
                .broadcast_to_members(&member_ids, &stream_start, &state.redis);
            state
                .ws
                .broadcast_to_members(&member_ids, &stream_end, &state.redis);
        } else {
            state
                .ws
                .send_to_user_or_queue(&user_id, &stream_start, &state.redis);
            state
                .ws
                .send_to_user_or_queue(&user_id, &stream_end, &state.redis);
        }

        // Agent-to-agent dispatch (groups only)
        {
            let other_agents: Vec<String> = sqlx::query_as::<_, (String,)>(
                r#"SELECT agent_id::text FROM conversation_members
                   WHERE conversation_id = $1::uuid AND agent_id IS NOT NULL AND agent_id != $2::uuid"#,
            )
            .bind(conversation_id)
            .bind(aid)
            .fetch_all(&state.db)
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|(id,)| id)
            .collect();

            if !other_agents.is_empty() {
                let mentions = crate::services::mention::resolve_mentions_from_content(
                    &state.db,
                    conversation_id,
                    content,
                    Some(aid),
                )
                .await;
                let mention_only = !mentions.is_empty();

                let mut agent_configs = Vec::new();
                for other_aid in &other_agents {
                    let agent_perms = sqlx::query_as::<_, (String, Option<String>)>(
                        r#"SELECT listen_mode::text, owner_user_id FROM conversation_members
                           WHERE conversation_id = $1::uuid AND agent_id = $2::uuid"#,
                    )
                    .bind(conversation_id)
                    .bind(other_aid)
                    .fetch_optional(&state.db)
                    .await;

                    if let Ok(Some((listen_mode, owner_user))) = agent_perms {
                        let allowed_user_ids = if matches!(
                            listen_mode.as_str(),
                            "owner_and_allowlist" | "allowlist_mentions" | "allowed_users"
                        ) {
                            sqlx::query_as::<_, (String,)>(
                                r#"SELECT user_id FROM agent_listen_allowed_users
                                   WHERE agent_id = $1::uuid AND conversation_id = $2::uuid"#,
                            )
                            .bind(other_aid)
                            .bind(conversation_id)
                            .fetch_all(&state.db)
                            .await
                            .unwrap_or_default()
                            .into_iter()
                            .map(|(uid,)| uid)
                            .collect()
                        } else {
                            vec![]
                        };

                        agent_configs.push(AgentFilterConfig {
                            agent_id: other_aid.clone(),
                            listen_mode,
                            owner_user_id: owner_user.unwrap_or_default(),
                            allowed_user_ids,
                        });
                    }
                }

                let dispatch_ids = filter_agents_for_dispatch(
                    mention_only,
                    &conv_type,
                    &user_id,
                    &mentions,
                    &agent_configs,
                );

                for dispatch_agent_id in dispatch_ids {
                    if state
                        .ws
                        .has_active_stream_for_agent(conversation_id, &dispatch_agent_id)
                    {
                        let queue_key =
                            format!("{}:{}", conversation_id, dispatch_agent_id);
                        state
                            .ws
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
                        &conv_type,
                        None,
                        &state.ws,
                        &state.db,
                        &state.redis,
                        &state.config,
                    )
                    .await;
                }
            }
        }

        // Push notifications
        {
            let db = &state.db;
            let config = &state.config;

            let members = sqlx::query_as::<_, (String,)>(
                "SELECT user_id FROM conversation_user_members WHERE conversation_id = $1::uuid",
            )
            .bind(conversation_id)
            .fetch_all(db)
            .await
            .unwrap_or_default();

            let member_ids: Vec<String> = if members.is_empty() {
                vec![user_id.clone()]
            } else {
                members.into_iter().map(|(id,)| id).collect()
            };

            let preview = {
                let max_chars = 100;
                let truncated = match content.char_indices().nth(max_chars) {
                    Some((idx, _)) => &content[..idx],
                    None => content,
                };
                if truncated.len() < content.len() {
                    format!("{}...", truncated)
                } else {
                    content.to_string()
                }
            };

            for mid in &member_ids {
                if state.ws.is_user_foreground(mid) {
                    continue;
                }
                let muted = is_conversation_muted(db, mid, conversation_id).await;
                if let Ok(false) = muted {
                    let should_push = should_send_push(db, mid, "message").await;
                    if let Ok(true) = should_push {
                        let _ = send_push_to_user(
                            db,
                            config,
                            mid,
                            &crate::services::push::PushPayload {
                                notification_type: "message".into(),
                                title: sender_name.to_string(),
                                body: preview.clone(),
                                url: Some(format!("/?c={}&m={}", conversation_id, msg_id)),
                                message_id: Some(msg_id.clone()),
                            },
                        )
                        .await;
                    }
                }
            }
        }
    }

    (
        StatusCode::OK,
        Json(json!({
            "messageId": msg_id,
            "seq": seq
        })),
    )
        .into_response()
}

// ── Search ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
    #[serde(rename = "conversationId")]
    conversation_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

/// GET /api/v1/messages/search
async fn v1_search_messages(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Query(query): Query<SearchQuery>,
) -> Response {
    let q = query.q.trim();
    if q.is_empty() || q.len() > 500 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Query must be 1-500 characters"})),
        )
            .into_response();
    }

    let owner_id = caller.owner_id().to_string();
    let limit = query.limit.unwrap_or(20).min(50).max(1);
    let offset = query.offset.unwrap_or(0).max(0);
    let pattern = format!("%{}%", q.replace('%', "\\%").replace('_', "\\_"));

    let rows = if let Some(ref conv_id) = query.conversation_id {
        let conv_uuid = match Uuid::parse_str(conv_id) {
            Ok(u) => u,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "Invalid conversationId"})),
                )
                    .into_response()
            }
        };
        sqlx::query_as::<_, (Uuid, Uuid, Option<String>, String, NaiveDateTime)>(
            r#"SELECT m.id, m.conversation_id, COALESCE(u.name, a.name, 'Unknown') AS sender_name,
                      m.content, m.created_at
               FROM messages m
               LEFT JOIN "user" u ON u.id = m.sender_user_id
               LEFT JOIN agents a ON a.id = m.sender_agent_id
               WHERE m.conversation_id = $1 AND m.content ILIKE $2
               ORDER BY m.created_at DESC
               LIMIT $3 OFFSET $4"#,
        )
        .bind(conv_uuid)
        .bind(&pattern)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as::<_, (Uuid, Uuid, Option<String>, String, NaiveDateTime)>(
            r#"SELECT m.id, m.conversation_id, COALESCE(u.name, a.name, 'Unknown') AS sender_name,
                      m.content, m.created_at
               FROM messages m
               JOIN conversations c ON c.id = m.conversation_id
               LEFT JOIN "user" u ON u.id = m.sender_user_id
               LEFT JOIN agents a ON a.id = m.sender_agent_id
               WHERE (c.user_id = $1 OR EXISTS (
                   SELECT 1 FROM conversation_user_members cum WHERE cum.conversation_id = c.id AND cum.user_id = $1
               ))
               AND m.content ILIKE $2
               ORDER BY m.created_at DESC
               LIMIT $3 OFFSET $4"#,
        )
        .bind(&owner_id)
        .bind(&pattern)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await
    };

    match rows {
        Ok(rows) => {
            let results: Vec<_> = rows
                .iter()
                .map(
                    |(msg_id, conv_id, sender_name, content, created_at)| {
                        json!({
                            "messageId": msg_id,
                            "conversationId": conv_id,
                            "senderName": sender_name,
                            "content": content,
                            "createdAt": created_at.and_utc().to_rfc3339(),
                        })
                    },
                )
                .collect();
            Json(json!({ "results": results })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ── List messages ───────────────────────────────────────────────────────

#[derive(Deserialize)]
struct GetMessagesQuery {
    before: Option<String>,
    after: Option<String>,
    around: Option<String>,
    limit: Option<String>,
}

/// GET /api/v1/messages/{conversationId}
async fn v1_get_messages(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(conversation_id): Path<Uuid>,
    Query(query): Query<GetMessagesQuery>,
) -> Response {
    let owner_id = caller.owner_id().to_string();

    let limit: i64 = query
        .limit
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(50)
        .min(100);

    // Validate caller belongs to this conversation (agent or user)
    let has_access = if let Some(aid) = caller.agent_id() {
        sqlx::query_scalar::<_, bool>(
            r#"SELECT EXISTS(
                SELECT 1 FROM conversations c
                WHERE c.id = $1
                  AND (c.agent_id = $2 OR EXISTS (
                    SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.agent_id = $2
                  ))
            )"#,
        )
        .bind(conversation_id)
        .bind(aid)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false)
    } else {
        sqlx::query_scalar::<_, bool>(
            r#"SELECT EXISTS(
                SELECT 1 FROM conversations c
                WHERE c.id = $1
                  AND (c.user_id = $2 OR EXISTS (
                    SELECT 1 FROM conversation_user_members cum WHERE cum.conversation_id = c.id AND cum.user_id = $2
                  ))
            )"#,
        )
        .bind(conversation_id)
        .bind(&owner_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false)
    };

    if !has_access {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    // Around mode
    if let Some(ref around_id) = query.around {
        let around_uuid = match Uuid::parse_str(around_id) {
            Ok(u) => u,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "Invalid around ID"})),
                )
                    .into_response()
            }
        };

        let target = sqlx::query_as::<_, MessageRow>(
            "SELECT * FROM messages WHERE id = $1 AND conversation_id = $2",
        )
        .bind(around_uuid)
        .bind(conversation_id)
        .fetch_optional(&state.db)
        .await;

        let target_msg = match target {
            Ok(Some(m)) => m,
            Ok(None) => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({"error": "Target message not found"})),
                )
                    .into_response()
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": e.to_string()})),
                )
                    .into_response()
            }
        };

        let half = limit / 2;

        let older_rows = sqlx::query_as::<_, MessageRow>(
            "SELECT * FROM messages WHERE conversation_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3",
        )
        .bind(conversation_id)
        .bind(target_msg.created_at)
        .bind(half + 1)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        let newer_rows = sqlx::query_as::<_, MessageRow>(
            "SELECT * FROM messages WHERE conversation_id = $1 AND created_at > $2 ORDER BY created_at ASC LIMIT $3",
        )
        .bind(conversation_id)
        .bind(target_msg.created_at)
        .bind(half + 1)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        let has_more = older_rows.len() as i64 > half;

        let mut all_items: Vec<MessageRow> = Vec::new();
        for m in older_rows
            .into_iter()
            .take(half as usize)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
        {
            all_items.push(m);
        }
        all_items.push(target_msg);
        for m in newer_rows.into_iter().take(half as usize) {
            all_items.push(m);
        }

        let messages = with_attachments(&state.db, &state.config, &all_items, None).await;
        let next_cursor = if has_more {
            all_items.first().map(|m| json!(m.id))
        } else {
            None
        };

        return Json(json!({
            "messages": messages,
            "hasMore": has_more,
            "nextCursor": next_cursor,
        }))
        .into_response();
    }

    // After mode
    if let Some(ref after_id) = query.after {
        let after_uuid = match Uuid::parse_str(after_id) {
            Ok(u) => u,
            Err(_) => {
                return Json(json!({ "messages": [], "hasMore": false })).into_response()
            }
        };

        let cursor_msg = sqlx::query_as::<_, CursorTimestamp>(
            "SELECT created_at FROM messages WHERE id = $1",
        )
        .bind(after_uuid)
        .fetch_optional(&state.db)
        .await;

        let cursor_ts = match cursor_msg {
            Ok(Some(c)) => c.created_at,
            _ => return Json(json!({ "messages": [], "hasMore": false })).into_response(),
        };

        let result = sqlx::query_as::<_, MessageRow>(
            "SELECT * FROM messages WHERE conversation_id = $1 AND created_at > $2 ORDER BY created_at ASC LIMIT $3",
        )
        .bind(conversation_id)
        .bind(cursor_ts)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        let has_more = result.len() as i64 > limit;
        let items: Vec<MessageRow> = result.into_iter().take(limit as usize).collect();
        let messages = with_attachments(&state.db, &state.config, &items, None).await;

        return Json(json!({
            "messages": messages,
            "hasMore": has_more,
        }))
        .into_response();
    }

    // Default: before mode
    if let Some(ref before_id) = query.before {
        let before_uuid = match Uuid::parse_str(before_id) {
            Ok(u) => u,
            Err(_) => {
                return load_messages_page(&state, conversation_id, limit, None).await;
            }
        };

        let cursor_msg = sqlx::query_as::<_, CursorTimestamp>(
            "SELECT created_at FROM messages WHERE id = $1",
        )
        .bind(before_uuid)
        .fetch_optional(&state.db)
        .await;

        match cursor_msg {
            Ok(Some(c)) => {
                return load_messages_page(&state, conversation_id, limit, Some(c.created_at))
                    .await;
            }
            _ => {
                return load_messages_page(&state, conversation_id, limit, None).await;
            }
        }
    }

    load_messages_page(&state, conversation_id, limit, None).await
}

async fn load_messages_page(
    state: &AppState,
    conversation_id: Uuid,
    limit: i64,
    cursor_ts: Option<NaiveDateTime>,
) -> Response {
    let result = if let Some(ts) = cursor_ts {
        sqlx::query_as::<_, MessageRow>(
            "SELECT * FROM messages WHERE conversation_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT $3",
        )
        .bind(conversation_id)
        .bind(ts)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    } else {
        sqlx::query_as::<_, MessageRow>(
            "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2",
        )
        .bind(conversation_id)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    };

    let has_more = result.len() as i64 > limit;
    let mut items: Vec<MessageRow> = result.into_iter().take(limit as usize).collect();
    items.reverse();

    let next_cursor = if has_more {
        items.first().map(|m| json!(m.id))
    } else {
        None
    };

    let messages = with_attachments(&state.db, &state.config, &items, None).await;

    Json(json!({
        "messages": messages,
        "hasMore": has_more,
        "nextCursor": next_cursor,
    }))
    .into_response()
}

// ═══════════════════════════════════════════════════════════════════════════
// Memories
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct ListMemoriesQuery {
    agent_id: Uuid,
    tier: Option<String>,
    category: Option<String>,
}

#[derive(sqlx::FromRow)]
struct MemoryRow {
    id: Uuid,
    agent_id: Uuid,
    category: String,
    tier: String,
    summary: String,
    detail: Option<String>,
    pattern_key: Option<String>,
    hit_count: i32,
    source_conversation_id: Option<Uuid>,
    first_seen_at: chrono::DateTime<chrono::Utc>,
    last_used_at: chrono::DateTime<chrono::Utc>,
    created_at: chrono::DateTime<chrono::Utc>,
}

fn memory_to_json(m: &MemoryRow) -> Value {
    json!({
        "id": m.id,
        "agentId": m.agent_id,
        "category": m.category,
        "tier": m.tier,
        "summary": m.summary,
        "detail": m.detail,
        "patternKey": m.pattern_key,
        "hitCount": m.hit_count,
        "sourceConversationId": m.source_conversation_id,
        "firstSeenAt": m.first_seen_at.to_rfc3339(),
        "lastUsedAt": m.last_used_at.to_rfc3339(),
        "createdAt": m.created_at.to_rfc3339(),
    })
}

/// Verify caller owns the agent
async fn verify_agent_ownership(
    db: &sqlx::PgPool,
    agent_id: Uuid,
    owner_id: &Uuid,
) -> Result<(), Response> {
    let owns = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM agents WHERE id = $1 AND owner_id = $2)",
    )
    .bind(agent_id)
    .bind(owner_id.to_string())
    .fetch_one(db)
    .await;

    match owns {
        Ok(true) => Ok(()),
        Ok(false) => Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not agent owner"})),
        )
            .into_response()),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response()),
    }
}

/// GET /api/v1/memories
async fn v1_list_memories(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Query(q): Query<ListMemoriesQuery>,
) -> Response {
    if let Err(resp) = verify_agent_ownership(&state.db, q.agent_id, caller.owner_id()).await {
        return resp;
    }

    let mut sql = String::from("SELECT * FROM agent_memories WHERE agent_id = $1");
    let mut bind_idx = 2u32;

    if q.tier.is_some() {
        sql.push_str(&format!(" AND tier = ${bind_idx}"));
        bind_idx += 1;
    }
    if q.category.is_some() {
        sql.push_str(&format!(" AND category = ${bind_idx}"));
    }
    let _ = bind_idx;
    sql.push_str(" ORDER BY last_used_at DESC LIMIT 200");

    let mut query = sqlx::query_as::<_, MemoryRow>(&sql).bind(q.agent_id);
    if let Some(ref tier) = q.tier {
        query = query.bind(tier);
    }
    if let Some(ref category) = q.category {
        query = query.bind(category);
    }

    match query.fetch_all(&state.db).await {
        Ok(rows) => {
            let items: Vec<Value> = rows.iter().map(memory_to_json).collect();
            Json(json!({ "memories": items })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct CreateMemoryBody {
    agent_id: Uuid,
    category: String,
    summary: String,
    detail: Option<String>,
    pattern_key: Option<String>,
}

/// POST /api/v1/memories
async fn v1_create_memory(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Json(body): Json<CreateMemoryBody>,
) -> Response {
    if let Err(resp) = verify_agent_ownership(&state.db, body.agent_id, caller.owner_id()).await {
        return resp;
    }

    let valid_categories = ["correction", "preference", "knowledge", "error"];
    if !valid_categories.contains(&body.category.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid category"})),
        )
            .into_response();
    }

    let pattern_key = body
        .pattern_key
        .as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let row = if let Some(ref pk) = pattern_key {
        sqlx::query_as::<_, MemoryRow>(
            r#"INSERT INTO agent_memories (agent_id, category, summary, detail, pattern_key)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (agent_id, pattern_key) DO UPDATE
                 SET summary = EXCLUDED.summary,
                     detail = EXCLUDED.detail,
                     hit_count = agent_memories.hit_count + 1,
                     last_used_at = NOW()
               RETURNING *"#,
        )
        .bind(body.agent_id)
        .bind(&body.category)
        .bind(&body.summary)
        .bind(&body.detail)
        .bind(pk)
        .fetch_one(&state.db)
        .await
    } else {
        sqlx::query_as::<_, MemoryRow>(
            r#"INSERT INTO agent_memories (agent_id, category, summary, detail)
               VALUES ($1, $2, $3, $4)
               RETURNING *"#,
        )
        .bind(body.agent_id)
        .bind(&body.category)
        .bind(&body.summary)
        .bind(&body.detail)
        .fetch_one(&state.db)
        .await
    };

    match row {
        Ok(m) => (StatusCode::CREATED, Json(memory_to_json(&m))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/v1/memories/{id}
async fn v1_get_memory(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(id): Path<Uuid>,
) -> Response {
    let row = sqlx::query_as::<_, MemoryRow>(
        r#"SELECT am.* FROM agent_memories am
           JOIN agents a ON a.id = am.agent_id
           WHERE am.id = $1 AND a.owner_id = $2"#,
    )
    .bind(id)
    .bind(caller.owner_id().to_string())
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(m)) => Json(memory_to_json(&m)).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({"error": "Not found"}))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct UpdateMemoryBody {
    category: Option<String>,
    tier: Option<String>,
    summary: Option<String>,
    detail: Option<String>,
}

/// PATCH /api/v1/memories/{id}
async fn v1_update_memory(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateMemoryBody>,
) -> Response {
    let existing = sqlx::query_as::<_, MemoryRow>(
        r#"SELECT am.* FROM agent_memories am
           JOIN agents a ON a.id = am.agent_id
           WHERE am.id = $1 AND a.owner_id = $2"#,
    )
    .bind(id)
    .bind(caller.owner_id().to_string())
    .fetch_optional(&state.db)
    .await;

    let existing = match existing {
        Ok(Some(m)) => m,
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(json!({"error": "Not found"}))).into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    };

    let category = body.category.as_deref().unwrap_or(&existing.category);
    let tier = body.tier.as_deref().unwrap_or(&existing.tier);
    let summary = body.summary.as_deref().unwrap_or(&existing.summary);
    let detail = body.detail.as_deref().or(existing.detail.as_deref());

    let valid_categories = ["correction", "preference", "knowledge", "error"];
    if !valid_categories.contains(&category) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid category"})),
        )
            .into_response();
    }
    let valid_tiers = ["hot", "warm", "cold"];
    if !valid_tiers.contains(&tier) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid tier"})),
        )
            .into_response();
    }

    match sqlx::query_as::<_, MemoryRow>(
        r#"UPDATE agent_memories
           SET category = $2, tier = $3, summary = $4, detail = $5, last_used_at = NOW()
           WHERE id = $1
           RETURNING *"#,
    )
    .bind(id)
    .bind(category)
    .bind(tier)
    .bind(summary)
    .bind(detail)
    .fetch_one(&state.db)
    .await
    {
        Ok(m) => Json(memory_to_json(&m)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// DELETE /api/v1/memories/{id}
async fn v1_delete_memory(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(id): Path<Uuid>,
) -> Response {
    let result = sqlx::query(
        r#"DELETE FROM agent_memories
           WHERE id = $1
             AND agent_id IN (SELECT id FROM agents WHERE owner_id = $2)"#,
    )
    .bind(id)
    .bind(caller.owner_id().to_string())
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Not found"}))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct ExtractMemoriesBody {
    agent_id: Uuid,
    conversation_id: Uuid,
    since: Option<String>,
}

/// POST /api/v1/memories/extract
async fn v1_extract_memories(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Json(body): Json<ExtractMemoriesBody>,
) -> Response {
    if let Err(resp) = verify_agent_ownership(&state.db, body.agent_id, caller.owner_id()).await {
        return resp;
    }

    let owner_id = caller.owner_id().to_string();

    // Verify caller is in the conversation
    let in_conv = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM conversations c
            WHERE c.id = $1 AND (c.user_id = $2 OR EXISTS(
                SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $2
            ))
        )"#,
    )
    .bind(body.conversation_id)
    .bind(&owner_id)
    .fetch_one(&state.db)
    .await;

    match in_conv {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Not in conversation"})),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    }

    // Fetch recent messages
    let mut msg_sql = String::from(
        r#"SELECT
             CASE WHEN m.role::text = 'user' THEN COALESCE(u.name, 'User') ELSE COALESCE(a.name, 'Agent') END AS sender_name,
             m.content,
             m.created_at::timestamptz
           FROM messages m
           LEFT JOIN "user" u ON m.sender_user_id = u.id::text
           LEFT JOIN agents a ON m.sender_agent_id = a.id
           WHERE m.conversation_id = $1 AND m.content IS NOT NULL AND m.content != ''"#,
    );
    if body.since.is_some() {
        msg_sql.push_str(" AND m.created_at > $2::timestamptz");
    }
    msg_sql.push_str(" ORDER BY m.created_at ASC LIMIT 500");

    let messages: Vec<(String, String, chrono::DateTime<chrono::Utc>)> = {
        let result = if let Some(ref since) = body.since {
            sqlx::query_as(&msg_sql)
                .bind(body.conversation_id)
                .bind(since)
                .fetch_all(&state.db)
                .await
        } else {
            sqlx::query_as(&msg_sql)
                .bind(body.conversation_id)
                .fetch_all(&state.db)
                .await
        };
        match result {
            Ok(rows) => rows,
            Err(e) => {
                tracing::error!("v1_extract_memories: failed to fetch messages: {e}");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("Failed to fetch messages: {e}")})),
                )
                    .into_response();
            }
        }
    };

    if messages.is_empty() {
        return Json(json!({ "extracted": 0, "memories": [] })).into_response();
    }

    let conv_text: String = messages
        .iter()
        .map(|(name, content, ts)| format!("[{}] {}: {}", ts.format("%H:%M"), name, content))
        .collect::<Vec<_>>()
        .join("\n");

    let output =
        match crate::routes::agent_memories::call_claude_extract_public(&conv_text).await {
            Ok(text) => text,
            Err(e) => {
                tracing::error!("v1 extract_memories: claude failed: {e}");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("Extraction failed: {e}")})),
                )
                    .into_response();
            }
        };

    // Parse JSON lines and upsert
    let mut extracted: Vec<Value> = Vec::new();
    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() || !line.starts_with('{') {
            continue;
        }
        if let Ok(parsed) = serde_json::from_str::<Value>(line) {
            let category = parsed["category"].as_str().unwrap_or("knowledge");
            let summary = match parsed["summary"].as_str() {
                Some(s) if !s.is_empty() => s,
                _ => continue,
            };
            let detail = parsed["detail"].as_str();
            let pattern_key = parsed["pattern_key"]
                .as_str()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty());

            let valid_categories = ["correction", "preference", "knowledge", "error"];
            let cat = if valid_categories.contains(&category) {
                category
            } else {
                "knowledge"
            };

            let row = if let Some(pk) = pattern_key {
                sqlx::query_as::<_, MemoryRow>(
                    r#"INSERT INTO agent_memories (agent_id, category, summary, detail, pattern_key, source_conversation_id)
                       VALUES ($1, $2, $3, $4, $5, $6)
                       ON CONFLICT (agent_id, pattern_key) DO UPDATE
                         SET summary = EXCLUDED.summary,
                             detail = EXCLUDED.detail,
                             hit_count = agent_memories.hit_count + 1,
                             last_used_at = NOW()
                       RETURNING *"#,
                )
                .bind(body.agent_id)
                .bind(cat)
                .bind(summary)
                .bind(detail)
                .bind(pk)
                .bind(body.conversation_id)
                .fetch_one(&state.db)
                .await
            } else {
                sqlx::query_as::<_, MemoryRow>(
                    r#"INSERT INTO agent_memories (agent_id, category, summary, detail, source_conversation_id)
                       VALUES ($1, $2, $3, $4, $5)
                       RETURNING *"#,
                )
                .bind(body.agent_id)
                .bind(cat)
                .bind(summary)
                .bind(detail)
                .bind(body.conversation_id)
                .fetch_one(&state.db)
                .await
            };

            if let Ok(m) = row {
                extracted.push(memory_to_json(&m));
            }
        }
    }

    Json(json!({
        "extracted": extracted.len(),
        "memories": extracted,
    }))
    .into_response()
}

// ═══════════════════════════════════════════════════════════════════════════
// Skills
// ═══════════════════════════════════════════════════════════════════════════

/// GET /api/v1/skills/installed
async fn v1_list_installed_skills(
    State(state): State<AppState>,
    caller: CallerIdentity,
) -> Response {
    // For agent callers, use agent_id directly. For user callers, return 400.
    let agent_id = match caller.agent_id() {
        Some(id) => *id,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "This endpoint requires an agent caller (use agent bot token)"})),
            )
                .into_response()
        }
    };

    #[derive(sqlx::FromRow)]
    struct InstalledSkillRow {
        id: Uuid,
        name: String,
        slug: String,
        description: String,
        category: String,
        slash_command: Option<String>,
        prompt_template: String,
        prompt_content: String,
        parameters: serde_json::Value,
        is_enabled: bool,
        config: serde_json::Value,
        installed_at: chrono::DateTime<chrono::Utc>,
    }

    let rows = sqlx::query_as::<_, InstalledSkillRow>(
        r#"
        SELECT s.id, s.name, s.slug, s.description, s.category,
               s.slash_command, s.prompt_template, s.prompt_content, s.parameters,
               ask.is_enabled, ask.config, ask.installed_at
        FROM agent_skills ask
        JOIN skills s ON s.id = ask.skill_id
        WHERE ask.agent_id = $1 AND ask.is_enabled = true
        ORDER BY s.name
        "#,
    )
    .bind(agent_id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(skills) => {
            let items: Vec<_> = skills
                .iter()
                .map(|s| {
                    json!({
                        "id": s.id.to_string(),
                        "name": &s.name,
                        "slug": &s.slug,
                        "description": &s.description,
                        "category": &s.category,
                        "slashCommand": &s.slash_command,
                        "promptTemplate": &s.prompt_template,
                        "promptContent": &s.prompt_content,
                        "parameters": &s.parameters,
                        "isEnabled": s.is_enabled,
                        "config": &s.config,
                        "installedAt": s.installed_at.to_rfc3339(),
                    })
                })
                .collect();
            Json(json!({ "skills": items })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/v1/skills/{slug}/prompt
async fn v1_get_skill_prompt(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(slug): Path<String>,
) -> Response {
    let agent_id = match caller.agent_id() {
        Some(id) => *id,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "This endpoint requires an agent caller (use agent bot token)"})),
            )
                .into_response()
        }
    };

    #[derive(sqlx::FromRow)]
    struct SkillPromptRow {
        prompt_content: String,
        prompt_template: String,
        parameters: serde_json::Value,
    }

    let row = sqlx::query_as::<_, SkillPromptRow>(
        r#"
        SELECT s.prompt_content, s.prompt_template, s.parameters
        FROM agent_skills ask
        JOIN skills s ON s.id = ask.skill_id
        WHERE ask.agent_id = $1 AND s.slug = $2 AND ask.is_enabled = true
        LIMIT 1
        "#,
    )
    .bind(agent_id)
    .bind(&slug)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(s)) => Json(json!({
            "promptContent": &s.prompt_content,
            "promptTemplate": &s.prompt_template,
            "parameters": &s.parameters,
        }))
        .into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Skill not found or not installed"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Files
// ═══════════════════════════════════════════════════════════════════════════

/// Blocked MIME types
const BLOCKED_TYPES: &[&str] = &[
    "application/x-executable",
    "application/x-msdos-program",
    "application/x-msdownload",
    "application/x-sh",
    "application/x-bat",
    "application/x-csh",
];

/// POST /api/v1/files/upload
async fn v1_upload_file(
    State(state): State<AppState>,
    caller: CallerIdentity,
    mut multipart: Multipart,
) -> Response {
    let mut conversation_id: Option<Uuid> = None;
    let mut file_data: Option<(String, String, Vec<u8>)> = None;
    let max_size = state.config.max_file_size;

    while let Ok(Some(field)) = multipart.next_field().await {
        let field_name = field.name().unwrap_or("").to_string();

        if field_name == "conversationId" {
            let text = field.text().await.unwrap_or_default();
            conversation_id = text.parse::<Uuid>().ok();
            continue;
        }

        if field_name == "file" {
            let content_type = field
                .content_type()
                .unwrap_or("application/octet-stream")
                .to_string();
            let file_name = field.file_name().unwrap_or("upload").to_string();

            if BLOCKED_TYPES.contains(&content_type.as_str()) {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": format!("File type '{}' is not allowed", content_type)})),
                )
                    .into_response();
            }

            let data = match field.bytes().await {
                Ok(d) => d.to_vec(),
                Err(_) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({"error": "Failed to read file data"})),
                    )
                        .into_response()
                }
            };

            if data.len() > max_size {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": format!(
                            "File size ({} bytes) exceeds maximum allowed size ({} bytes)",
                            data.len(), max_size
                        )
                    })),
                )
                    .into_response();
            }

            file_data = Some((file_name, content_type, data));
            continue;
        }
    }

    let conversation_id = match conversation_id {
        Some(id) => id,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "conversationId is required"})),
            )
                .into_response()
        }
    };

    let (file_name, content_type, data) = match file_data {
        Some(f) => f,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "file is required"})),
            )
                .into_response()
        }
    };

    // Verify caller belongs to this conversation
    let has_access = if let Some(aid) = caller.agent_id() {
        let is_direct = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM conversations WHERE id = $1 AND agent_id = $2)",
        )
        .bind(conversation_id)
        .bind(aid)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);

        if is_direct {
            true
        } else {
            sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND agent_id = $2)",
            )
            .bind(conversation_id)
            .bind(aid)
            .fetch_one(&state.db)
            .await
            .unwrap_or(false)
        }
    } else {
        let owner_id = caller.owner_id().to_string();
        sqlx::query_scalar::<_, bool>(
            r#"SELECT EXISTS(
                SELECT 1 FROM conversations c
                WHERE c.id = $1 AND (c.user_id = $2 OR EXISTS (
                    SELECT 1 FROM conversation_user_members cum WHERE cum.conversation_id = c.id AND cum.user_id = $2
                ))
            )"#,
        )
        .bind(conversation_id)
        .bind(&owner_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false)
    };

    if !has_access {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Caller does not belong to this conversation"})),
        )
            .into_response();
    }

    // Build storage key and upload
    let attachment_id = Uuid::new_v4();
    let ext = file_name.rsplit('.').next().unwrap_or("bin");
    let stored_name = format!(
        "{}_{}.{}",
        attachment_id,
        chrono::Utc::now().timestamp(),
        ext
    );
    let r2_key = format!("attachments/{}/{}", conversation_id, stored_name);
    let file_size = data.len();

    let storage_path = if let Some(s3) = &state.s3 {
        match crate::services::r2::upload_to_r2(
            s3,
            &state.config.r2_bucket,
            &r2_key,
            data.clone(),
            &content_type,
            &state.config.r2_public_url,
        )
        .await
        {
            Ok(url) => url,
            Err(_) => {
                let dir = std::path::Path::new(&state.config.upload_dir)
                    .join("attachments")
                    .join(conversation_id.to_string());
                let _ = tokio::fs::create_dir_all(&dir).await;
                let local_path = dir.join(&stored_name);
                if let Err(e) = tokio::fs::write(&local_path, &data).await {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({"error": format!("Failed to store file: {}", e)})),
                    )
                        .into_response();
                }
                format!("/uploads/attachments/{}/{}", conversation_id, stored_name)
            }
        }
    } else {
        let dir = std::path::Path::new(&state.config.upload_dir)
            .join("attachments")
            .join(conversation_id.to_string());
        let _ = tokio::fs::create_dir_all(&dir).await;
        let local_path = dir.join(&stored_name);
        if let Err(e) = tokio::fs::write(&local_path, &data).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Failed to store file: {}", e)})),
            )
                .into_response();
        }
        format!("/uploads/attachments/{}/{}", conversation_id, stored_name)
    };

    (
        StatusCode::CREATED,
        Json(json!({
            "url": storage_path,
            "fileName": file_name,
            "fileType": content_type,
            "fileSize": file_size,
        })),
    )
        .into_response()
}

// ═══════════════════════════════════════════════════════════════════════════
// Wiki
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWikiBody {
    conversation_id: Option<String>,
    community_id: Option<String>,
    title: String,
    content: Option<String>,
}

/// POST /api/v1/wiki
async fn v1_create_wiki_page(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Json(body): Json<CreateWikiBody>,
) -> Response {
    let title = body.title.trim();
    if title.is_empty() || title.len() > 200 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Title is required (max 200 characters)"})),
        )
            .into_response();
    }

    // Resolve conversation_id
    let conversation_id: Option<Uuid> = if let Some(ref cid) = body.conversation_id {
        Uuid::parse_str(cid).ok()
    } else if let Some(ref com_id) = body.community_id {
        let com_uuid = match Uuid::parse_str(com_id) {
            Ok(u) => u,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "Invalid communityId"})),
                )
                    .into_response()
            }
        };
        sqlx::query_scalar::<_, Uuid>("SELECT conversation_id FROM communities WHERE id = $1")
            .bind(com_uuid)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten()
    } else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "conversationId or communityId required"})),
        )
            .into_response();
    };

    let conv_id = match conversation_id {
        Some(id) => id,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Conversation not found"})),
            )
                .into_response()
        }
    };

    // Verify membership
    let is_member = if let Some(aid) = caller.agent_id() {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND agent_id = $2)",
        )
        .bind(conv_id)
        .bind(aid)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false)
    } else {
        let owner_id = caller.owner_id().to_string();
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2)",
        )
        .bind(conv_id)
        .bind(&owner_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false)
    };

    if !is_member {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    let created_by = if let Some(aid) = caller.agent_id() {
        aid.to_string()
    } else {
        caller.owner_id().to_string()
    };

    let page_id = Uuid::new_v4();
    let now = chrono::Utc::now();
    let result = sqlx::query(
        r#"INSERT INTO wiki_pages (id, conversation_id, title, content, created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6)"#,
    )
    .bind(page_id)
    .bind(conv_id)
    .bind(title)
    .bind(body.content.as_deref().unwrap_or(""))
    .bind(&created_by)
    .bind(now)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (
            StatusCode::CREATED,
            Json(json!({
                "id": page_id,
                "conversationId": conv_id,
                "title": title,
                "content": body.content.as_deref().unwrap_or(""),
                "createdAt": now.to_rfc3339(),
            })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateWikiBody {
    title: Option<String>,
    content: Option<String>,
}

/// PATCH /api/v1/wiki/{pageId}
async fn v1_update_wiki_page(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(page_id): Path<Uuid>,
    Json(body): Json<UpdateWikiBody>,
) -> Response {
    // Get page's conversation_id
    let page = sqlx::query_as::<_, (Uuid,)>(
        "SELECT conversation_id FROM wiki_pages WHERE id = $1",
    )
    .bind(page_id)
    .fetch_optional(&state.db)
    .await;

    let conv_id = match page {
        Ok(Some((cid,))) => cid,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Wiki page not found"})),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    };

    // Verify membership
    let is_member = if let Some(aid) = caller.agent_id() {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND agent_id = $2)",
        )
        .bind(conv_id)
        .bind(aid)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false)
    } else {
        let owner_id = caller.owner_id().to_string();
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2)",
        )
        .bind(conv_id)
        .bind(&owner_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false)
    };

    if !is_member {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    // Build dynamic update
    let mut set_parts: Vec<String> = vec!["updated_at = NOW()".to_string()];
    let mut param_idx = 1u32;
    if body.title.is_some() {
        param_idx += 1;
        set_parts.push(format!("title = ${}", param_idx));
    }
    if body.content.is_some() {
        param_idx += 1;
        set_parts.push(format!("content = ${}", param_idx));
    }

    let sql = format!(
        "UPDATE wiki_pages SET {} WHERE id = $1",
        set_parts.join(", ")
    );
    let mut query = sqlx::query(&sql).bind(page_id);
    if let Some(ref t) = body.title {
        query = query.bind(t.trim());
    }
    if let Some(ref c) = body.content {
        query = query.bind(c.as_str());
    }

    match query.execute(&state.db).await {
        Ok(r) if r.rows_affected() > 0 => Json(json!({"ok": true})).into_response(),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Wiki page not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// Capsules
// ═══════════════════════════════════════════════════════════════════════════

#[derive(Deserialize)]
struct CapsuleQuery {
    query: String,
    limit: Option<i32>,
    /// Required for agent callers (derived from agent_id).
    /// For user callers this is ignored — we need agent_id to look up grants.
    agent_id: Option<Uuid>,
}

/// GET /api/v1/capsules
async fn v1_query_capsules(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Query(params): Query<CapsuleQuery>,
) -> Response {
    let query = params.query.trim().to_string();
    if query.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "query parameter is required"})),
        )
            .into_response();
    }

    let limit = params.limit.unwrap_or(10).min(20).max(1);

    // Determine agent_id for grant lookup
    let agent_id = match caller.agent_id() {
        Some(id) => *id,
        None => match params.agent_id {
            Some(id) => {
                // Verify ownership
                if let Err(resp) =
                    verify_agent_ownership(&state.db, id, caller.owner_id()).await
                {
                    return resp;
                }
                id
            }
            None => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "agent_id query parameter is required for user callers"})),
                )
                    .into_response()
            }
        },
    };

    let openai_key = match state.config.openai_api_key.as_deref() {
        Some(key) => key.to_string(),
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "Memory search is not available (embedding service not configured)"})),
            )
                .into_response()
        }
    };

    let capsule_ids = sqlx::query_scalar::<_, Uuid>(
        r#"SELECT DISTINCT capsule_id FROM (
            SELECT capsule_id FROM memory_capsule_grants WHERE agent_id = $1
            UNION
            SELECT capsule_id FROM agent_capsule_access WHERE agent_id = $1
        ) sub"#,
    )
    .bind(agent_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    if capsule_ids.is_empty() {
        return (StatusCode::OK, Json(json!([]))).into_response();
    }

    let client = reqwest::Client::new();
    let query_texts = vec![query.clone()];
    let embeddings = match crate::services::embedding::generate_embeddings(
        &client,
        &openai_key,
        &query_texts,
        crate::services::embedding::EMBEDDING_MODEL,
    )
    .await
    {
        Ok(e) => e,
        Err(e) => {
            tracing::error!("v1_query_capsules: embedding failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to generate query embedding"})),
            )
                .into_response();
        }
    };

    let query_embedding = match embeddings.into_iter().next() {
        Some(emb) => emb,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Empty embedding response"})),
            )
                .into_response()
        }
    };

    match crate::services::memory::hybrid_search(
        &state.db,
        &capsule_ids,
        query_embedding,
        &query,
        limit,
    )
    .await
    {
        Ok(results) => {
            let items: Vec<Value> = results
                .into_iter()
                .map(|r| {
                    json!({
                        "content": r.content,
                        "capsule_name": r.capsule_name,
                        "capsule_id": r.capsule_id,
                        "score": (r.score * 100.0).round() / 100.0,
                        "importance": r.importance,
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!(items))).into_response()
        }
        Err(e) => {
            tracing::error!("v1_query_capsules: search failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Memory search failed"})),
            )
                .into_response()
        }
    }
}
