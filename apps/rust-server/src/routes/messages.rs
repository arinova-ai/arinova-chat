use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get},
    Router,
};
use chrono::NaiveDateTime;
use serde::Deserialize;
use serde_json::json;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/messages/search", get(search_messages))
        .route("/api/conversations/:id/messages", get(get_messages))
        .route(
            "/api/conversations/:conversationId/messages/:messageId",
            delete(delete_message),
        )
}

// ── Row types for SQL queries ──────────────────────────────────────────

#[derive(Debug, FromRow)]
struct MessageRow {
    id: Uuid,
    conversation_id: Uuid,
    seq: i32,
    role: String,
    content: String,
    status: String,
    created_at: NaiveDateTime,
    updated_at: NaiveDateTime,
}

#[derive(Debug, FromRow)]
struct AttachmentRow {
    id: Uuid,
    message_id: Uuid,
    file_name: String,
    file_type: String,
    file_size: i32,
    storage_path: String,
    created_at: NaiveDateTime,
}

#[derive(Debug, FromRow)]
struct SearchResultRow {
    message_id: Uuid,
    conversation_id: Uuid,
    content: String,
    role: String,
    created_at: NaiveDateTime,
    conversation_title: Option<String>,
    agent_id: Option<Uuid>,
    agent_name: Option<String>,
    agent_avatar_url: Option<String>,
}

#[derive(Debug, FromRow)]
struct CountRow {
    count: i64,
}

#[derive(Debug, FromRow)]
struct CursorTimestamp {
    created_at: NaiveDateTime,
}

#[derive(Debug, FromRow)]
struct ConvCheck {
    id: Uuid,
}

// ── Attachment enrichment ──────────────────────────────────────────────

/// Fetch attachments for a batch of messages and merge them into JSON values.
async fn with_attachments(
    db: &PgPool,
    config: &crate::config::Config,
    items: &[MessageRow],
) -> Vec<serde_json::Value> {
    if items.is_empty() {
        return vec![];
    }

    let message_ids: Vec<Uuid> = items.iter().map(|m| m.id).collect();

    let attachments = sqlx::query_as::<_, AttachmentRow>(
        "SELECT id, message_id, file_name, file_type, file_size, storage_path, created_at
         FROM attachments
         WHERE message_id = ANY($1)",
    )
    .bind(&message_ids)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    // Group attachments by message_id
    let mut by_msg: std::collections::HashMap<Uuid, Vec<&AttachmentRow>> =
        std::collections::HashMap::new();
    for att in &attachments {
        by_msg.entry(att.message_id).or_default().push(att);
    }

    let is_r2 = config.is_r2_configured();

    items
        .iter()
        .map(|m| {
            let atts = by_msg.get(&m.id).cloned().unwrap_or_default();
            let att_json: Vec<serde_json::Value> = atts
                .iter()
                .map(|a| {
                    let url = if is_r2 {
                        format!("{}/{}", config.r2_public_url, a.storage_path)
                    } else {
                        format!("/uploads/{}", a.storage_path)
                    };
                    json!({
                        "id": a.id,
                        "messageId": a.message_id,
                        "fileName": a.file_name,
                        "fileType": a.file_type,
                        "fileSize": a.file_size,
                        "url": url,
                        "createdAt": a.created_at,
                    })
                })
                .collect();

            json!({
                "id": m.id,
                "conversationId": m.conversation_id,
                "seq": m.seq,
                "role": m.role,
                "content": m.content,
                "status": m.status,
                "createdAt": m.created_at,
                "updatedAt": m.updated_at,
                "attachments": att_json,
            })
        })
        .collect()
}

// ── Streaming enrichment ───────────────────────────────────────────────

/// For messages with status='streaming' that have an active stream,
/// replace content with the latest buffered content from Redis.
async fn enrich_streaming(
    redis_pool: &deadpool_redis::Pool,
    ws_state: &crate::ws::state::WsState,
    items: Vec<serde_json::Value>,
) -> Vec<serde_json::Value> {
    // Collect streaming message indices and their keys
    let streaming: Vec<(usize, String, Uuid)> = items
        .iter()
        .enumerate()
        .filter_map(|(i, m)| {
            let status = m.get("status")?.as_str()?;
            if status != "streaming" {
                return None;
            }
            let conv_id_str = m.get("conversationId")?.as_str()?;
            let conv_id = Uuid::parse_str(conv_id_str).ok()?;
            if !ws_state.has_active_stream(conv_id_str) {
                return None;
            }
            let msg_id_str = m.get("id")?.as_str()?;
            let msg_id = Uuid::parse_str(msg_id_str).ok()?;
            Some((i, format!("stream:{}", msg_id), msg_id))
        })
        .collect();

    if streaming.is_empty() {
        return items;
    }

    // Batch fetch from Redis
    let mut conn = match redis_pool.get().await {
        Ok(c) => c,
        Err(_) => return items,
    };

    let keys: Vec<&str> = streaming.iter().map(|(_, k, _)| k.as_str()).collect();
    let values: Vec<Option<String>> = match deadpool_redis::redis::cmd("MGET")
        .arg(&keys)
        .query_async(&mut *conn)
        .await
    {
        Ok(v) => v,
        Err(_) => return items,
    };

    // Build a map of message_id -> cached content
    let mut content_map: std::collections::HashMap<Uuid, String> =
        std::collections::HashMap::new();
    for (idx, (_, _, msg_id)) in streaming.iter().enumerate() {
        if let Some(Some(ref val)) = values.get(idx) {
            content_map.insert(*msg_id, val.clone());
        }
    }

    if content_map.is_empty() {
        return items;
    }

    items
        .into_iter()
        .map(|mut m| {
            if let Some(id_str) = m.get("id").and_then(|v| v.as_str()) {
                if let Ok(id) = Uuid::parse_str(id_str) {
                    if let Some(cached) = content_map.get(&id) {
                        m.as_object_mut()
                            .unwrap()
                            .insert("content".to_string(), json!(cached));
                    }
                }
            }
            m
        })
        .collect()
}

// ── 1. GET /api/messages/search ────────────────────────────────────────

#[derive(Deserialize)]
struct SearchQuery {
    q: Option<String>,
    limit: Option<String>,
    offset: Option<String>,
}

async fn search_messages(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<SearchQuery>,
) -> Response {
    let q = match &query.q {
        Some(q) if !q.trim().is_empty() => q.trim().to_string(),
        _ => return Json(json!({"results": [], "total": 0})).into_response(),
    };

    let limit: i64 = query
        .limit
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(20)
        .min(50);

    let offset: i64 = query
        .offset
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);

    let pattern = format!("%{}%", q);

    // Get all conversation IDs belonging to this user
    let user_convs = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM conversations WHERE user_id = $1",
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    let conv_ids: Vec<Uuid> = match user_convs {
        Ok(rows) => rows.into_iter().map(|r| r.0).collect(),
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    if conv_ids.is_empty() {
        return Json(json!({"results": [], "total": 0})).into_response();
    }

    // Count total matches
    let count_result = sqlx::query_as::<_, CountRow>(
        "SELECT COUNT(*)::bigint AS count
         FROM messages
         WHERE conversation_id = ANY($1)
           AND content ILIKE $2",
    )
    .bind(&conv_ids)
    .bind(&pattern)
    .fetch_one(&state.db)
    .await;

    let total = match count_result {
        Ok(row) => row.count,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    // Fetch matching messages with conversation + agent info
    let results = sqlx::query_as::<_, SearchResultRow>(
        r#"SELECT
             m.id AS message_id,
             m.conversation_id,
             m.content,
             m.role,
             m.created_at,
             c.title AS conversation_title,
             c.agent_id,
             a.name AS agent_name,
             a.avatar_url AS agent_avatar_url
           FROM messages m
           INNER JOIN conversations c ON m.conversation_id = c.id
           LEFT JOIN agents a ON c.agent_id = a.id
           WHERE m.conversation_id = ANY($1)
             AND m.content ILIKE $2
           ORDER BY m.created_at DESC
           LIMIT $3
           OFFSET $4"#,
    )
    .bind(&conv_ids)
    .bind(&pattern)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await;

    match results {
        Ok(rows) => {
            let results: Vec<serde_json::Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "messageId": r.message_id,
                        "conversationId": r.conversation_id,
                        "content": r.content,
                        "role": r.role,
                        "createdAt": r.created_at,
                        "conversationTitle": r.conversation_title,
                        "agentId": r.agent_id,
                        "agentName": r.agent_name,
                        "agentAvatarUrl": r.agent_avatar_url,
                    })
                })
                .collect();
            Json(json!({"results": results, "total": total})).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ── 2. GET /api/conversations/:id/messages ─────────────────────────────

#[derive(Deserialize)]
struct MessagesQuery {
    before: Option<String>,
    after: Option<String>,
    around: Option<String>,
    limit: Option<String>,
}

async fn get_messages(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Query(query): Query<MessagesQuery>,
) -> Response {
    let limit: i64 = query
        .limit
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(50)
        .min(100);

    // Verify conversation belongs to user
    let conv = sqlx::query_as::<_, ConvCheck>(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match conv {
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Conversation not found"})),
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

    // --- Around mode: load messages centered on target ---
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
        .bind(id)
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

        // Messages before target (older)
        let older_rows = sqlx::query_as::<_, MessageRow>(
            "SELECT * FROM messages
             WHERE conversation_id = $1 AND created_at < $2
             ORDER BY created_at DESC
             LIMIT $3",
        )
        .bind(id)
        .bind(target_msg.created_at)
        .bind(half + 1)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        // Messages after target (newer)
        let newer_rows = sqlx::query_as::<_, MessageRow>(
            "SELECT * FROM messages
             WHERE conversation_id = $1 AND created_at > $2
             ORDER BY created_at ASC
             LIMIT $3",
        )
        .bind(id)
        .bind(target_msg.created_at)
        .bind(half + 1)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        let has_more_up = older_rows.len() as i64 > half;
        let has_more_down = newer_rows.len() as i64 > half;

        // Take only `half` items, reversing older so they're in chronological order
        let mut older_items: Vec<&MessageRow> = older_rows
            .iter()
            .take(half as usize)
            .collect();
        older_items.reverse();

        let newer_items: Vec<&MessageRow> = newer_rows
            .iter()
            .take(half as usize)
            .collect();

        // Combine: older + target + newer
        let mut all_items: Vec<MessageRow> = Vec::new();
        for m in &older_items {
            all_items.push(clone_message_row(m));
        }
        all_items.push(target_msg);
        for m in &newer_items {
            all_items.push(clone_message_row(m));
        }

        let messages_with_atts = with_attachments(&state.db, &state.config, &all_items).await;
        let messages_enriched =
            enrich_streaming(&state.redis, &state.ws, messages_with_atts).await;

        let next_cursor = if has_more_up {
            older_items.first().map(|m| json!(m.id))
        } else {
            None
        };

        return Json(json!({
            "messages": messages_enriched,
            "hasMore": has_more_up,
            "hasMoreUp": has_more_up,
            "hasMoreDown": has_more_down,
            "nextCursor": next_cursor,
        }))
        .into_response();
    }

    // --- After mode: load newer messages (for downward scroll) ---
    if let Some(ref after_id) = query.after {
        let after_uuid = match Uuid::parse_str(after_id) {
            Ok(u) => u,
            Err(_) => {
                return Json(json!({
                    "messages": [],
                    "hasMore": false,
                    "hasMoreDown": false,
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
                    "hasMoreDown": false,
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
        .bind(id)
        .bind(cursor_ts)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        let has_more_down = result.len() as i64 > limit;
        let items: Vec<MessageRow> = result.into_iter().take(limit as usize).collect();

        let messages_with_atts = with_attachments(&state.db, &state.config, &items).await;
        let messages_enriched =
            enrich_streaming(&state.redis, &state.ws, messages_with_atts).await;

        return Json(json!({
            "messages": messages_enriched,
            "hasMore": false,
            "hasMoreDown": has_more_down,
        }))
        .into_response();
    }

    // --- Default: before mode (load older messages from bottom) ---
    let (query_str, bind_cursor) = if let Some(ref before_id) = query.before {
        let before_uuid = match Uuid::parse_str(before_id) {
            Ok(u) => u,
            Err(_) => {
                // Invalid cursor, just load from the end
                return load_default_messages(&state, id, limit, None).await;
            }
        };

        let cursor_msg = sqlx::query_as::<_, CursorTimestamp>(
            "SELECT created_at FROM messages WHERE id = $1",
        )
        .bind(before_uuid)
        .fetch_optional(&state.db)
        .await;

        match cursor_msg {
            Ok(Some(c)) => (true, Some(c.created_at)),
            _ => (false, None),
        }
    } else {
        (false, None)
    };

    load_default_messages(&state, id, limit, bind_cursor).await
}

/// Helper for the default (before) mode message loading.
async fn load_default_messages(
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
    items.reverse(); // Chronological order

    let next_cursor = if has_more {
        items.first().map(|m| json!(m.id))
    } else {
        None
    };

    let messages_with_atts = with_attachments(&state.db, &state.config, &items).await;
    let messages_enriched =
        enrich_streaming(&state.redis, &state.ws, messages_with_atts).await;

    Json(json!({
        "messages": messages_enriched,
        "hasMore": has_more,
        "nextCursor": next_cursor,
    }))
    .into_response()
}

// ── 3. DELETE /api/conversations/:conversationId/messages/:messageId ───

#[derive(Deserialize)]
struct DeleteMessagePath {
    #[serde(rename = "conversationId")]
    conversation_id: Uuid,
    #[serde(rename = "messageId")]
    message_id: Uuid,
}

async fn delete_message(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conversation_id, message_id)): Path<(Uuid, Uuid)>,
) -> Response {
    // Verify conversation belongs to user
    let conv = sqlx::query_as::<_, ConvCheck>(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
    )
    .bind(conversation_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match conv {
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Conversation not found"})),
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

    let deleted = sqlx::query(
        "DELETE FROM messages WHERE id = $1 AND conversation_id = $2",
    )
    .bind(message_id)
    .bind(conversation_id)
    .execute(&state.db)
    .await;

    match deleted {
        Ok(result) if result.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Message not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ── Helpers ────────────────────────────────────────────────────────────

fn clone_message_row(m: &MessageRow) -> MessageRow {
    MessageRow {
        id: m.id,
        conversation_id: m.conversation_id,
        seq: m.seq,
        role: m.role.clone(),
        content: m.content.clone(),
        status: m.status.clone(),
        created_at: m.created_at,
        updated_at: m.updated_at,
    }
}
