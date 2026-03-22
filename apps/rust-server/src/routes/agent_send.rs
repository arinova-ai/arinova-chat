use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::post,
    Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::auth::middleware::AuthAgent;
use crate::services::message_seq::get_next_seq;
use crate::services::push::send_push_to_user;
use crate::services::push_trigger::{is_conversation_muted, should_send_push};
use crate::ws::handler::{filter_agents_for_dispatch, get_conv_member_ids, do_trigger_agent_response, AgentFilterConfig};
use crate::ws::state::QueuedResponse;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/agent/send", post(agent_send))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentSendBody {
    conversation_id: String,
    content: String,
}

async fn agent_send(
    State(state): State<AppState>,
    agent: AuthAgent,
    Json(body): Json<AgentSendBody>,
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

    let agent_id = agent.id.to_string();

    // Validate agent belongs to this conversation and get user_id
    let membership = sqlx::query_as::<_, (String, String)>(
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
    .bind(&agent_id)
    .fetch_optional(&state.db)
    .await;

    let (user_id, conv_type) = match membership {
        Ok(Some(m)) => m,
        Ok(None) => {
            tracing::warn!("agent_send REST: agent {} not a member of conversation {}", agent_id, conversation_id);
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Agent does not belong to this conversation"})),
            )
                .into_response();
        }
        Err(e) => {
            tracing::error!("agent_send REST: DB error: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Internal server error"})),
            )
                .into_response();
        }
    };

    // Create message in DB
    let seq = match get_next_seq(&state.db, conversation_id).await {
        Ok(s) => s,
        Err(e) => {
            tracing::error!("agent_send REST: failed to get next seq: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Internal server error"})),
            )
                .into_response();
        }
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
    .bind(&agent_id)
    .execute(&state.db)
    .await;

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
            let previews = crate::services::link_preview::attach_link_previews(&db2, &mid, &text).await;
            if !previews.is_empty() {
                let members = crate::ws::handler::get_conv_member_ids(&ws2, &db2, &cid, &uid).await;
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
    .execute(&state.db)
    .await;

    // Deliver stream_start + stream_end to all relevant users
    let stream_start = json!({
        "type": "stream_start",
        "conversationId": conversation_id,
        "messageId": &msg_id,
        "seq": seq,
        "senderAgentId": &agent_id,
        "senderAgentName": &agent.name
    });
    let stream_end = json!({
        "type": "stream_end",
        "conversationId": conversation_id,
        "messageId": &msg_id,
        "seq": seq,
        "content": content,
        "senderAgentId": &agent_id,
        "senderAgentName": &agent.name,
        "reason": "agent_send"
    });

    if conv_type == "group" {
        // Broadcast to all user members in the group
        let member_ids = get_conv_member_ids(&state.ws, &state.db, conversation_id, "").await;
        state.ws.broadcast_to_members(&member_ids, &stream_start, &state.redis);
        state.ws.broadcast_to_members(&member_ids, &stream_end, &state.redis);
    } else {
        // Direct conversation: send to the owner only
        state.ws.send_to_user_or_queue(&user_id, &stream_start, &state.redis);
        state.ws.send_to_user_or_queue(&user_id, &stream_end, &state.redis);
    }

    tracing::info!("stream_end reason=agent_send conv={} agent={} msgId={} seq={}", conversation_id, agent_id, msg_id, seq);

    // --- Agent-to-agent dispatch (groups only) ---
    {
        let other_agents: Vec<String> = sqlx::query_as::<_, (String,)>(
            r#"SELECT agent_id::text FROM conversation_members
               WHERE conversation_id = $1::uuid AND agent_id IS NOT NULL AND agent_id != $2::uuid"#,
        )
        .bind(conversation_id)
        .bind(&agent_id)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(id,)| id)
        .collect();

        if !other_agents.is_empty() {
            let mentions = crate::services::mention::resolve_mentions_from_content(
                &state.db, conversation_id, content, Some(&agent_id),
            ).await;
            let mention_only = !mentions.is_empty();

            let mut agent_configs = Vec::new();
            for aid in &other_agents {
                let agent_perms = sqlx::query_as::<_, (String, Option<String>)>(
                    r#"SELECT listen_mode::text, owner_user_id FROM conversation_members
                       WHERE conversation_id = $1::uuid AND agent_id = $2::uuid"#,
                )
                .bind(conversation_id)
                .bind(aid)
                .fetch_optional(&state.db)
                .await;

                if let Ok(Some((listen_mode, owner_id))) = agent_perms {
                    let allowed_user_ids = if matches!(listen_mode.as_str(), "owner_and_allowlist" | "allowlist_mentions" | "allowed_users") {
                        sqlx::query_as::<_, (String,)>(
                            r#"SELECT user_id FROM agent_listen_allowed_users
                               WHERE agent_id = $1::uuid AND conversation_id = $2::uuid"#,
                        )
                        .bind(aid)
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
                        agent_id: aid.clone(),
                        listen_mode,
                        owner_user_id: owner_id.unwrap_or_default(),
                        allowed_user_ids,
                    });
                }
            }

            // Use agent owner as "sender" for listen mode checks
            let dispatch_ids = filter_agents_for_dispatch(
                mention_only,
                &conv_type,
                &user_id,
                &mentions,
                &agent_configs,
            );

            for dispatch_agent_id in dispatch_ids {
                if state.ws.has_active_stream_for_agent(conversation_id, &dispatch_agent_id) {
                    let queue_key = format!("{}:{}", conversation_id, dispatch_agent_id);
                    state.ws
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

    // Push notification to all conversation members
    {
        let db = &state.db;
        let config = &state.config;

        // Get all user members of this conversation
        let members = sqlx::query_as::<_, (String,)>(
            "SELECT user_id FROM conversation_user_members WHERE conversation_id = $1::uuid",
        )
        .bind(conversation_id)
        .fetch_all(db)
        .await
        .unwrap_or_default();

        let member_ids: Vec<String> = if members.is_empty() {
            // Fallback: single-user conversation
            tracing::info!("push: conversation_user_members empty, fallback to user_id={}", user_id);
            vec![user_id.clone()]
        } else {
            members.into_iter().map(|(id,)| id).collect()
        };

        tracing::info!("push: member_ids={:?} conv={}", member_ids, conversation_id);

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
            // Skip push if user has the app in foreground
            if state.ws.is_user_foreground(mid) {
                tracing::info!("push skip: mid={} is foreground", mid);
                continue;
            }
            let muted = is_conversation_muted(db, mid, conversation_id).await;
            tracing::info!("push check: mid={} muted={:?}", mid, muted);
            if let Ok(false) = muted {
                let should_push = should_send_push(db, mid, "message").await;
                tracing::info!("push check: mid={} should_send={:?}", mid, should_push);
                if let Ok(true) = should_push {
                    let result = send_push_to_user(
                        db,
                        config,
                        mid,
                        &crate::services::push::PushPayload {
                            notification_type: "message".into(),
                            title: agent.name.clone(),
                            body: preview.clone(),
                            url: Some(format!("/?c={}&m={}", conversation_id, msg_id)),
                            message_id: Some(msg_id.clone()),
                        },
                    )
                    .await;
                    tracing::info!("push result: mid={} result={:?}", mid, result);
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
