use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, patch},
    Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::middleware::AuthAgent;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/agent/conversations/{convId}/notes",
            get(agent_list_notes).post(agent_create_note),
        )
        .route(
            "/api/agent/conversations/{convId}/notes/{noteId}",
            get(agent_get_note).patch(agent_update_note).delete(agent_delete_note),
        )
}

// ===== Internal types =====

#[derive(Debug, FromRow)]
struct NoteRow {
    id: Uuid,
    conversation_id: Uuid,
    creator_id: String,
    creator_type: String,
    agent_id: Option<Uuid>,
    title: String,
    content: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    creator_name: String,
    agent_name: Option<String>,
}

const NOTE_QUERY_BASE: &str = r#"
    SELECT n.id, n.conversation_id, n.creator_id, n.creator_type, n.agent_id,
           n.title, n.content, n.created_at, n.updated_at,
           COALESCE(CASE WHEN n.creator_type = 'agent' THEN a.name END, u.name, 'Unknown') AS creator_name,
           a.name AS agent_name
    FROM conversation_notes n
    LEFT JOIN "user" u ON u.id = n.creator_id
    LEFT JOIN agents a ON a.id = n.agent_id
"#;

fn note_to_json(n: &NoteRow) -> serde_json::Value {
    json!({
        "id": n.id,
        "conversationId": n.conversation_id,
        "creatorId": n.creator_id,
        "creatorType": n.creator_type,
        "creatorName": n.creator_name,
        "agentId": n.agent_id,
        "agentName": n.agent_name,
        "title": n.title,
        "content": n.content,
        "createdAt": n.created_at.to_rfc3339(),
        "updatedAt": n.updated_at.to_rfc3339(),
    })
}

// ===== Helpers =====

/// Validate agent is a member of the conversation
async fn agent_is_member(db: &sqlx::PgPool, conv_id: Uuid, agent_id: Uuid) -> bool {
    sqlx::query_as::<_, (i64,)>(
        r#"SELECT COUNT(*) FROM conversations c
           WHERE c.id = $1
             AND (
               c.agent_id = $2
               OR EXISTS (
                 SELECT 1 FROM conversation_members cm
                 WHERE cm.conversation_id = c.id AND cm.agent_id = $2
               )
             )"#,
    )
    .bind(conv_id)
    .bind(agent_id)
    .fetch_one(db)
    .await
    .map(|(c,)| c > 0)
    .unwrap_or(false)
}

/// Check if the user who owns the conversation has agent_notes_enabled
async fn agent_notes_allowed(db: &sqlx::PgPool, conv_id: Uuid) -> bool {
    // Check conversation_user_members for the owner — if all members have it enabled, allow
    // For simplicity: if ANY member has it disabled, deny
    let disabled = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*) FROM conversation_user_members WHERE conversation_id = $1 AND agent_notes_enabled = false",
    )
    .bind(conv_id)
    .fetch_one(db)
    .await
    .map(|(c,)| c)
    .unwrap_or(0);

    disabled == 0
}

/// Get user member IDs for WS broadcast
async fn get_conv_member_ids(db: &sqlx::PgPool, conv_id: Uuid) -> Vec<String> {
    let members: Vec<(String,)> = sqlx::query_as(
        "SELECT user_id FROM conversation_user_members WHERE conversation_id = $1",
    )
    .bind(conv_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    if members.is_empty() {
        sqlx::query_as::<_, (String,)>(
            "SELECT user_id FROM conversations WHERE id = $1",
        )
        .bind(conv_id)
        .fetch_optional(db)
        .await
        .ok()
        .flatten()
        .map(|(id,)| vec![id])
        .unwrap_or_default()
    } else {
        members.into_iter().map(|(id,)| id).collect()
    }
}

// ===== Handlers =====

/// GET /api/agent/conversations/:convId/notes/:noteId
async fn agent_get_note(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path((conv_id, note_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if !agent_is_member(&state.db, conv_id, agent.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Agent is not a member of this conversation"})),
        )
            .into_response();
    }

    let row = sqlx::query_as::<_, NoteRow>(&format!(
        "{} WHERE n.id = $1 AND n.conversation_id = $2",
        NOTE_QUERY_BASE
    ))
    .bind(note_id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(note)) => Json(note_to_json(&note)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Note not found"})),
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
struct ListNotesQuery {
    before: Option<String>,
    limit: Option<String>,
}

/// GET /api/agent/conversations/:convId/notes
async fn agent_list_notes(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(conv_id): Path<Uuid>,
    Query(query): Query<ListNotesQuery>,
) -> Response {
    if !agent_is_member(&state.db, conv_id, agent.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Agent does not belong to this conversation"})),
        )
            .into_response();
    }

    if !agent_notes_allowed(&state.db, conv_id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Note access is disabled by conversation owner"})),
        )
            .into_response();
    }

    let limit: i64 = query
        .limit
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(20)
        .min(50);

    let cursor_ts: Option<DateTime<Utc>> = if let Some(ref before_id) = query.before {
        let before_uuid = match Uuid::parse_str(before_id) {
            Ok(u) => u,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "Invalid cursor"})),
                )
                    .into_response()
            }
        };
        sqlx::query_as::<_, (DateTime<Utc>,)>(
            "SELECT created_at FROM conversation_notes WHERE id = $1",
        )
        .bind(before_uuid)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten()
        .map(|(ts,)| ts)
    } else {
        None
    };

    let rows = if let Some(ts) = cursor_ts {
        sqlx::query_as::<_, NoteRow>(&format!(
            "{} WHERE n.conversation_id = $1 AND n.created_at < $2 ORDER BY n.created_at DESC LIMIT $3",
            NOTE_QUERY_BASE
        ))
        .bind(conv_id)
        .bind(ts)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as::<_, NoteRow>(&format!(
            "{} WHERE n.conversation_id = $1 ORDER BY n.created_at DESC LIMIT $2",
            NOTE_QUERY_BASE
        ))
        .bind(conv_id)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await
    };

    match rows {
        Ok(rows) => {
            let has_more = rows.len() as i64 > limit;
            let items: Vec<serde_json::Value> = rows
                .iter()
                .take(limit as usize)
                .map(note_to_json)
                .collect();

            let next_cursor = if has_more {
                items.last().and_then(|n| n.get("id").cloned())
            } else {
                None
            };

            Json(json!({
                "notes": items,
                "hasMore": has_more,
                "nextCursor": next_cursor,
            }))
            .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct CreateNoteBody {
    title: String,
    #[serde(default)]
    content: String,
}

/// POST /api/agent/conversations/:convId/notes
async fn agent_create_note(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(conv_id): Path<Uuid>,
    Json(body): Json<CreateNoteBody>,
) -> Response {
    let title = body.title.trim();
    if title.is_empty() || title.len() > 200 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Title is required (max 200 characters)"})),
        )
            .into_response();
    }

    if !agent_is_member(&state.db, conv_id, agent.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Agent does not belong to this conversation"})),
        )
            .into_response();
    }

    if !agent_notes_allowed(&state.db, conv_id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Note access is disabled by conversation owner"})),
        )
            .into_response();
    }

    let note_id = Uuid::new_v4();
    let now = Utc::now();

    // Use agent's owner ID as creator_id for DB FK constraint
    let owner_id = sqlx::query_as::<_, (String,)>(
        "SELECT owner_id FROM agents WHERE id = $1",
    )
    .bind(agent.id)
    .fetch_optional(&state.db)
    .await;

    let creator_id = match owner_id {
        Ok(Some((id,))) => id,
        _ => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to resolve agent owner"})),
            )
                .into_response();
        }
    };

    let result = sqlx::query(
        r#"INSERT INTO conversation_notes (id, conversation_id, creator_id, creator_type, agent_id, title, content, created_at, updated_at)
           VALUES ($1, $2, $3, 'agent', $4, $5, $6, $7, $7)"#,
    )
    .bind(note_id)
    .bind(conv_id)
    .bind(&creator_id)
    .bind(agent.id)
    .bind(title)
    .bind(&body.content)
    .bind(now)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            let note_json = json!({
                "id": note_id,
                "conversationId": conv_id,
                "creatorId": &creator_id,
                "creatorType": "agent",
                "creatorName": &agent.name,
                "agentId": agent.id,
                "agentName": &agent.name,
                "title": title,
                "content": &body.content,
                "createdAt": now.to_rfc3339(),
                "updatedAt": now.to_rfc3339(),
            });

            let member_ids = get_conv_member_ids(&state.db, conv_id).await;
            state.ws.broadcast_to_members(
                &member_ids,
                &json!({
                    "type": "note:created",
                    "conversationId": conv_id.to_string(),
                    "note": &note_json,
                }),
                &state.redis,
            );

            (StatusCode::CREATED, Json(note_json)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateNoteBody {
    title: Option<String>,
    content: Option<String>,
}

/// PATCH /api/agent/conversations/:convId/notes/:noteId
async fn agent_update_note(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path((conv_id, note_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateNoteBody>,
) -> Response {
    if body.title.is_none() && body.content.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Nothing to update"})),
        )
            .into_response();
    }

    if !agent_is_member(&state.db, conv_id, agent.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Agent does not belong to this conversation"})),
        )
            .into_response();
    }

    // Only the agent that created the note can edit it
    let note = sqlx::query_as::<_, (Option<Uuid>,)>(
        "SELECT agent_id FROM conversation_notes WHERE id = $1 AND conversation_id = $2",
    )
    .bind(note_id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    match note {
        Ok(Some((Some(note_agent_id),))) if note_agent_id == agent.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Not authorized to edit this note"})),
            )
                .into_response();
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Note not found"})),
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
    }

    if let Some(ref title) = body.title {
        let title = title.trim();
        if title.is_empty() || title.len() > 200 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Title is required (max 200 characters)"})),
            )
                .into_response();
        }
    }

    let now = Utc::now();
    let updated = match (&body.title, &body.content) {
        (Some(title), Some(content)) => {
            sqlx::query(
                "UPDATE conversation_notes SET title = $1, content = $2, updated_at = $3 WHERE id = $4 AND conversation_id = $5",
            )
            .bind(title.trim())
            .bind(content)
            .bind(now)
            .bind(note_id)
            .bind(conv_id)
            .execute(&state.db)
            .await
        }
        (Some(title), None) => {
            sqlx::query(
                "UPDATE conversation_notes SET title = $1, updated_at = $2 WHERE id = $3 AND conversation_id = $4",
            )
            .bind(title.trim())
            .bind(now)
            .bind(note_id)
            .bind(conv_id)
            .execute(&state.db)
            .await
        }
        (None, Some(content)) => {
            sqlx::query(
                "UPDATE conversation_notes SET content = $1, updated_at = $2 WHERE id = $3 AND conversation_id = $4",
            )
            .bind(content)
            .bind(now)
            .bind(note_id)
            .bind(conv_id)
            .execute(&state.db)
            .await
        }
        (None, None) => unreachable!(),
    };

    match updated {
        Ok(r) if r.rows_affected() > 0 => {
            let row = sqlx::query_as::<_, NoteRow>(&format!(
                "{} WHERE n.id = $1",
                NOTE_QUERY_BASE
            ))
            .bind(note_id)
            .fetch_optional(&state.db)
            .await;

            match row {
                Ok(Some(note)) => {
                    let note_json = note_to_json(&note);

                    let member_ids = get_conv_member_ids(&state.db, conv_id).await;
                    state.ws.broadcast_to_members(
                        &member_ids,
                        &json!({
                            "type": "note:updated",
                            "conversationId": conv_id.to_string(),
                            "note": &note_json,
                        }),
                        &state.redis,
                    );

                    Json(note_json).into_response()
                }
                _ => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": "Failed to fetch updated note"})),
                )
                    .into_response(),
            }
        }
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Note not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// DELETE /api/agent/conversations/:convId/notes/:noteId
async fn agent_delete_note(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path((conv_id, note_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if !agent_is_member(&state.db, conv_id, agent.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Agent does not belong to this conversation"})),
        )
            .into_response();
    }

    // Only the agent that created the note can delete it
    let note = sqlx::query_as::<_, (Option<Uuid>,)>(
        "SELECT agent_id FROM conversation_notes WHERE id = $1 AND conversation_id = $2",
    )
    .bind(note_id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    match note {
        Ok(Some((Some(note_agent_id),))) if note_agent_id == agent.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Not authorized to delete this note"})),
            )
                .into_response();
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Note not found"})),
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
    }

    let result = sqlx::query(
        "DELETE FROM conversation_notes WHERE id = $1 AND conversation_id = $2",
    )
    .bind(note_id)
    .bind(conv_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => {
            let member_ids = get_conv_member_ids(&state.db, conv_id).await;
            state.ws.broadcast_to_members(
                &member_ids,
                &json!({
                    "type": "note:deleted",
                    "conversationId": conv_id.to_string(),
                    "noteId": note_id.to_string(),
                }),
                &state.redis,
            );

            StatusCode::NO_CONTENT.into_response()
        }
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Note not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
