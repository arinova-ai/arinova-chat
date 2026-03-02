use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use chrono::NaiveDateTime;
use serde::Deserialize;
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::middleware::AuthAgent;
use crate::routes::messages::{with_attachments, CursorTimestamp, MessageRow};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/api/agent/messages/{conversationId}",
        get(agent_get_messages),
    )
}

#[derive(Deserialize)]
struct AgentMessagesQuery {
    before: Option<String>,
    after: Option<String>,
    around: Option<String>,
    limit: Option<String>,
}

#[derive(Debug, FromRow)]
struct ConvMemberCheck {
    id: Uuid,
}

async fn agent_get_messages(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(conversation_id): Path<Uuid>,
    Query(query): Query<AgentMessagesQuery>,
) -> Response {
    let limit: i64 = query
        .limit
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(50)
        .min(100);

    // Validate agent belongs to this conversation
    let membership = sqlx::query_as::<_, ConvMemberCheck>(
        r#"SELECT c.id FROM conversations c
           WHERE c.id = $1
             AND (
               c.agent_id = $2
               OR EXISTS (
                 SELECT 1 FROM conversation_members cm
                 WHERE cm.conversation_id = c.id AND cm.agent_id = $2
               )
             )"#,
    )
    .bind(conversation_id)
    .bind(agent.id)
    .fetch_optional(&state.db)
    .await;

    match membership {
        Ok(None) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Agent does not belong to this conversation"})),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
        Ok(Some(_)) => {}
    }

    // --- Around mode ---
    if let Some(ref around_id) = query.around {
        let around_uuid = match Uuid::parse_str(around_id) {
            Ok(u) => u,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "Invalid around ID"})),
                )
                    .into_response();
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
                    .into_response();
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": e.to_string()})),
                )
                    .into_response();
            }
        };

        let half = limit / 2;

        let older_rows = sqlx::query_as::<_, MessageRow>(
            "SELECT * FROM messages
             WHERE conversation_id = $1 AND created_at < $2
             ORDER BY created_at DESC
             LIMIT $3",
        )
        .bind(conversation_id)
        .bind(target_msg.created_at)
        .bind(half + 1)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        let newer_rows = sqlx::query_as::<_, MessageRow>(
            "SELECT * FROM messages
             WHERE conversation_id = $1 AND created_at > $2
             ORDER BY created_at ASC
             LIMIT $3",
        )
        .bind(conversation_id)
        .bind(target_msg.created_at)
        .bind(half + 1)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        let has_more = older_rows.len() as i64 > half;

        let mut all_items: Vec<MessageRow> = Vec::new();
        for m in older_rows.into_iter().take(half as usize).collect::<Vec<_>>().into_iter().rev() {
            all_items.push(m);
        }
        all_items.push(target_msg);
        for m in newer_rows.into_iter().take(half as usize) {
            all_items.push(m);
        }

        let messages = with_attachments(&state.db, &state.config, &all_items).await;
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

    // --- After mode ---
    if let Some(ref after_id) = query.after {
        let after_uuid = match Uuid::parse_str(after_id) {
            Ok(u) => u,
            Err(_) => {
                return Json(json!({
                    "messages": [],
                    "hasMore": false,
                }))
                .into_response();
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
            _ => {
                return Json(json!({
                    "messages": [],
                    "hasMore": false,
                }))
                .into_response();
            }
        };

        let result = sqlx::query_as::<_, MessageRow>(
            "SELECT * FROM messages
             WHERE conversation_id = $1 AND created_at > $2
             ORDER BY created_at ASC
             LIMIT $3",
        )
        .bind(conversation_id)
        .bind(cursor_ts)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        let has_more = result.len() as i64 > limit;
        let items: Vec<MessageRow> = result.into_iter().take(limit as usize).collect();
        let messages = with_attachments(&state.db, &state.config, &items).await;

        return Json(json!({
            "messages": messages,
            "hasMore": has_more,
        }))
        .into_response();
    }

    // --- Default: before mode ---
    let result = if let Some(ref before_id) = query.before {
        let before_uuid = match Uuid::parse_str(before_id) {
            Ok(u) => u,
            Err(_) => {
                return load_agent_messages(&state, conversation_id, limit, None).await;
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
                return load_agent_messages(&state, conversation_id, limit, Some(c.created_at))
                    .await;
            }
            _ => {
                return load_agent_messages(&state, conversation_id, limit, None).await;
            }
        }
    } else {
        return load_agent_messages(&state, conversation_id, limit, None).await;
    };
}

async fn load_agent_messages(
    state: &AppState,
    conversation_id: Uuid,
    limit: i64,
    cursor_ts: Option<NaiveDateTime>,
) -> Response {
    let result = if let Some(ts) = cursor_ts {
        sqlx::query_as::<_, MessageRow>(
            "SELECT * FROM messages
             WHERE conversation_id = $1 AND created_at < $2
             ORDER BY created_at DESC
             LIMIT $3",
        )
        .bind(conversation_id)
        .bind(ts)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    } else {
        sqlx::query_as::<_, MessageRow>(
            "SELECT * FROM messages
             WHERE conversation_id = $1
             ORDER BY created_at DESC
             LIMIT $2",
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

    let messages = with_attachments(&state.db, &state.config, &items).await;

    Json(json!({
        "messages": messages,
        "hasMore": has_more,
        "nextCursor": next_cursor,
    }))
    .into_response()
}
