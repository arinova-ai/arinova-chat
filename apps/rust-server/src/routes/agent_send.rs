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

    let (user_id, _conv_type) = match membership {
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
        let mid = msg_id.clone();
        let text = content.to_string();
        tokio::spawn(async move {
            crate::services::link_preview::attach_link_previews(&db2, &mid, &text).await;
        });
    }

    let _ = sqlx::query(
        r#"UPDATE conversations SET updated_at = NOW() WHERE id = $1::uuid"#,
    )
    .bind(conversation_id)
    .execute(&state.db)
    .await;

    // Deliver to user via stream_start + stream_end
    state.ws.send_to_user_or_queue(&user_id, &json!({
        "type": "stream_start",
        "conversationId": conversation_id,
        "messageId": &msg_id,
        "seq": seq,
        "senderAgentId": &agent_id,
        "senderAgentName": &agent.name
    }), &state.redis);

    state.ws.send_to_user_or_queue(&user_id, &json!({
        "type": "stream_end",
        "conversationId": conversation_id,
        "messageId": &msg_id,
        "seq": seq,
        "content": content,
        "reason": "agent_send"
    }), &state.redis);

    tracing::info!("stream_end reason=agent_send conv={} agent={} msgId={} seq={}", conversation_id, agent_id, msg_id, seq);

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
            if let Ok(false) = is_conversation_muted(db, mid, conversation_id).await {
                if let Ok(true) = should_send_push(db, mid, "message").await {
                    let _ = send_push_to_user(
                        db,
                        config,
                        mid,
                        &crate::services::push::PushPayload {
                            notification_type: "message".into(),
                            title: agent.name.clone(),
                            body: preview.clone(),
                            url: Some(format!("/chat/{}", conversation_id)),
                        },
                    )
                    .await;
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
