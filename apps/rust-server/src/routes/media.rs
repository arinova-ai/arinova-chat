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

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/conversations/{id}/media", get(get_media))
        .route("/api/conversations/{id}/files", get(get_files))
}

#[derive(Deserialize)]
struct MediaQuery {
    before: Option<String>,
    limit: Option<String>,
}

#[derive(Debug, FromRow)]
struct MediaRow {
    id: Uuid,
    message_id: Uuid,
    file_name: String,
    file_type: String,
    file_size: i32,
    storage_path: String,
    duration_seconds: Option<i32>,
    created_at: NaiveDateTime,
    sender_user_id: Option<String>,
    sender_agent_id: Option<Uuid>,
    message_created_at: NaiveDateTime,
}

#[derive(Debug, FromRow)]
struct ConvCheck {
    id: Uuid,
}

fn resolve_url(config: &crate::config::Config, storage_path: &str) -> String {
    if storage_path.starts_with("http://") || storage_path.starts_with("https://") {
        storage_path.to_string()
    } else if storage_path.starts_with("/uploads/") {
        // Local fallback path — always serve directly, even when R2 is configured
        storage_path.to_string()
    } else if config.is_r2_configured() {
        format!("{}/{}", config.r2_public_url, storage_path)
    } else {
        format!("/uploads/{}", storage_path)
    }
}

async fn fetch_attachments(
    state: &AppState,
    user: &AuthUser,
    conv_id: Uuid,
    query: &MediaQuery,
    type_filter: &str,
) -> Response {
    let limit: i64 = query
        .limit
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(30)
        .clamp(1, 60);

    // Verify conversation access
    let conv = sqlx::query_as::<_, ConvCheck>(
        r#"SELECT id FROM conversations WHERE id = $1 AND (
            user_id = $2
            OR EXISTS (SELECT 1 FROM conversation_user_members cum WHERE cum.conversation_id = $1 AND cum.user_id = $2)
        )"#,
    )
    .bind(conv_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match conv {
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(json!({"error": "Conversation not found"}))).into_response();
        }
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response();
        }
        Ok(Some(_)) => {}
    }

    // Build query with optional cursor
    let rows = if let Some(ref before) = query.before {
        let cursor = match chrono::NaiveDateTime::parse_from_str(before, "%Y-%m-%dT%H:%M:%S%.fZ")
            .or_else(|_| chrono::DateTime::parse_from_rfc3339(before).map(|dt| dt.naive_utc()))
        {
            Ok(ts) => ts,
            Err(_) => {
                return (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid cursor"}))).into_response();
            }
        };

        let sql = format!(
            r#"SELECT a.id, a.message_id, a.file_name, a.file_type, a.file_size,
                      a.storage_path, a.duration_seconds, a.created_at,
                      m.sender_user_id, m.sender_agent_id, m.created_at AS message_created_at
               FROM attachments a
               JOIN messages m ON m.id = a.message_id
               WHERE m.conversation_id = $1 AND {} AND a.created_at < $2
               ORDER BY a.created_at DESC
               LIMIT $3"#,
            type_filter
        );
        sqlx::query_as::<_, MediaRow>(&sql)
            .bind(conv_id)
            .bind(cursor)
            .bind(limit + 1)
            .fetch_all(&state.db)
            .await
    } else {
        let sql = format!(
            r#"SELECT a.id, a.message_id, a.file_name, a.file_type, a.file_size,
                      a.storage_path, a.duration_seconds, a.created_at,
                      m.sender_user_id, m.sender_agent_id, m.created_at AS message_created_at
               FROM attachments a
               JOIN messages m ON m.id = a.message_id
               WHERE m.conversation_id = $1 AND {}
               ORDER BY a.created_at DESC
               LIMIT $2"#,
            type_filter
        );
        sqlx::query_as::<_, MediaRow>(&sql)
            .bind(conv_id)
            .bind(limit + 1)
            .fetch_all(&state.db)
            .await
    };

    let rows = match rows {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("media query error: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Internal server error"}))).into_response();
        }
    };

    let has_more = rows.len() as i64 > limit;
    let items: Vec<&MediaRow> = rows.iter().take(limit as usize).collect();

    // Batch resolve sender names
    let user_ids: Vec<String> = items.iter().filter_map(|r| r.sender_user_id.clone()).collect();
    let user_names: std::collections::HashMap<String, (String, Option<String>)> = if !user_ids.is_empty() {
        sqlx::query_as::<_, (String, String, Option<String>)>(
            r#"SELECT id, name, image FROM "user" WHERE id = ANY($1)"#,
        )
        .bind(&user_ids)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(id, name, image)| (id, (name, image)))
        .collect()
    } else {
        std::collections::HashMap::new()
    };

    let agent_ids: Vec<Uuid> = items.iter().filter_map(|r| r.sender_agent_id).collect();
    let agent_names: std::collections::HashMap<Uuid, String> = if !agent_ids.is_empty() {
        sqlx::query_as::<_, (Uuid, String)>(
            "SELECT id, name FROM agents WHERE id = ANY($1)",
        )
        .bind(&agent_ids)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .collect()
    } else {
        std::collections::HashMap::new()
    };

    let next_cursor = if has_more {
        items.last().map(|r| r.created_at.and_utc().to_rfc3339())
    } else {
        None
    };

    let config = &state.config;
    let json_items: Vec<serde_json::Value> = items
        .iter()
        .map(|r| {
            let url = resolve_url(config, &r.storage_path);
            let (sender_name, sender_image) = r
                .sender_user_id
                .as_ref()
                .and_then(|uid| user_names.get(uid))
                .map(|(n, img)| (Some(n.clone()), img.clone()))
                .unwrap_or((None, None));
            let sender_agent_name = r.sender_agent_id.and_then(|aid| agent_names.get(&aid).cloned());

            json!({
                "id": r.id,
                "messageId": r.message_id,
                "fileName": r.file_name,
                "fileType": r.file_type,
                "fileSize": r.file_size,
                "url": url,
                "duration": r.duration_seconds,
                "createdAt": r.created_at.and_utc().to_rfc3339(),
                "senderUserId": r.sender_user_id,
                "senderUserName": sender_name,
                "senderUserImage": sender_image,
                "senderAgentId": r.sender_agent_id,
                "senderAgentName": sender_agent_name,
                "messageCreatedAt": r.message_created_at.and_utc().to_rfc3339(),
            })
        })
        .collect();

    (StatusCode::OK, Json(json!({
        "items": json_items,
        "hasMore": has_more,
        "nextCursor": next_cursor,
    })))
        .into_response()
}

async fn get_media(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Query(query): Query<MediaQuery>,
) -> Response {
    fetch_attachments(&state, &user, id, &query, "a.file_type LIKE 'image/%'").await
}

async fn get_files(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Query(query): Query<MediaQuery>,
) -> Response {
    fetch_attachments(
        &state,
        &user,
        id,
        &query,
        "a.file_type NOT LIKE 'image/%' AND a.file_type NOT LIKE 'audio/%'",
    )
    .await
}
