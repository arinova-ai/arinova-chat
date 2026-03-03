use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, patch, post},
    Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::{FromRow, PgPool};
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/conversations/{id}/notes",
            get(list_notes).post(create_note),
        )
        .route(
            "/api/conversations/{id}/notes/settings",
            patch(update_notes_settings),
        )
        .route(
            "/api/conversations/{id}/notes/{noteId}",
            patch(update_note).delete(delete_note),
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

// ===== Helpers =====

async fn is_member(db: &PgPool, conv_id: Uuid, user_id: &str) -> bool {
    let member = sqlx::query_as::<_, (i64,)>(
        r#"SELECT COUNT(*) FROM conversation_user_members
           WHERE conversation_id = $1 AND user_id = $2"#,
    )
    .bind(conv_id)
    .bind(user_id)
    .fetch_one(db)
    .await
    .map(|(c,)| c > 0)
    .unwrap_or(false);

    if member {
        return true;
    }

    // Fallback: direct conversation owner
    sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*) FROM conversations WHERE id = $1 AND user_id = $2",
    )
    .bind(conv_id)
    .bind(user_id)
    .fetch_one(db)
    .await
    .map(|(c,)| c > 0)
    .unwrap_or(false)
}

async fn get_conv_member_ids(db: &PgPool, conv_id: Uuid) -> Vec<String> {
    let members: Vec<(String,)> = sqlx::query_as(
        "SELECT user_id FROM conversation_user_members WHERE conversation_id = $1",
    )
    .bind(conv_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    if members.is_empty() {
        // Direct conversation: just the owner
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

/// Check if user can edit a note (creator or agent's owner)
async fn can_edit_note(
    db: &PgPool,
    user_id: &str,
    creator_id: &str,
    creator_type: &str,
    agent_id: Option<Uuid>,
) -> bool {
    if creator_type == "user" {
        return creator_id == user_id;
    }
    // Agent-created: check if user owns the agent
    if let Some(aid) = agent_id {
        sqlx::query_as::<_, (Uuid,)>("SELECT id FROM agents WHERE id = $1 AND owner_id = $2")
            .bind(aid)
            .bind(user_id)
            .fetch_optional(db)
            .await
            .ok()
            .flatten()
            .is_some()
    } else {
        creator_id == user_id
    }
}

/// Check if user is a moderator (admin or vice_admin) in a conversation
async fn is_moderator(db: &PgPool, conv_id: Uuid, user_id: &str) -> bool {
    let role = sqlx::query_as::<_, (String,)>(
        "SELECT role::text FROM conversation_user_members WHERE conversation_id = $1 AND user_id = $2",
    )
    .bind(conv_id)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
    .map(|(r,)| r);

    matches!(role.as_deref(), Some("admin") | Some("vice_admin"))
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

// ===== Handlers =====

#[derive(Deserialize)]
struct ListNotesQuery {
    before: Option<String>,
    limit: Option<String>,
}

/// GET /api/conversations/:id/notes
async fn list_notes(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conv_id): Path<Uuid>,
    Query(query): Query<ListNotesQuery>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    let limit: i64 = query
        .limit
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(20)
        .min(50);

    // Resolve cursor
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

/// POST /api/conversations/:id/notes
async fn create_note(
    State(state): State<AppState>,
    user: AuthUser,
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

    if !is_member(&state.db, conv_id, &user.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    let note_id = Uuid::new_v4();
    let now = Utc::now();

    let result = sqlx::query(
        r#"INSERT INTO conversation_notes (id, conversation_id, creator_id, creator_type, title, content, created_at, updated_at)
           VALUES ($1, $2, $3, 'user', $4, $5, $6, $6)"#,
    )
    .bind(note_id)
    .bind(conv_id)
    .bind(&user.id)
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
                "creatorId": &user.id,
                "creatorType": "user",
                "creatorName": &user.name,
                "agentId": null,
                "agentName": null,
                "title": title,
                "content": &body.content,
                "createdAt": now.to_rfc3339(),
                "updatedAt": now.to_rfc3339(),
            });

            // Broadcast to conversation members
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
struct UpdateNoteBody {
    title: Option<String>,
    content: Option<String>,
}

/// PATCH /api/conversations/:id/notes/:noteId
async fn update_note(
    State(state): State<AppState>,
    user: AuthUser,
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

    if !is_member(&state.db, conv_id, &user.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    // Fetch note metadata for permission check
    let note = sqlx::query_as::<_, (String, String, Option<Uuid>)>(
        "SELECT creator_id, creator_type, agent_id FROM conversation_notes WHERE id = $1 AND conversation_id = $2",
    )
    .bind(note_id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    let (note_creator_id, note_creator_type, note_agent_id) = match note {
        Ok(Some(n)) => n,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Note not found"})),
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

    // Permission: creator or agent's owner
    if !can_edit_note(&state.db, &user.id, &note_creator_id, &note_creator_type, note_agent_id)
        .await
    {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not authorized to edit this note"})),
        )
            .into_response();
    }

    // Validate title if provided
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

    // Dynamic UPDATE
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
            // Fetch updated note for response & broadcast
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

/// DELETE /api/conversations/:id/notes/:noteId
async fn delete_note(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, note_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    // Fetch note metadata
    let note = sqlx::query_as::<_, (String, String, Option<Uuid>)>(
        "SELECT creator_id, creator_type, agent_id FROM conversation_notes WHERE id = $1 AND conversation_id = $2",
    )
    .bind(note_id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    let (note_creator_id, note_creator_type, note_agent_id) = match note {
        Ok(Some(n)) => n,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Note not found"})),
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

    // Permission: creator/owner OR moderator
    let is_creator =
        can_edit_note(&state.db, &user.id, &note_creator_id, &note_creator_type, note_agent_id)
            .await;

    if !is_creator && !is_moderator(&state.db, conv_id, &user.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not authorized to delete this note"})),
        )
            .into_response();
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
            // Broadcast deletion
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateNotesSettingsBody {
    agent_notes_enabled: bool,
}

/// PATCH /api/conversations/:id/notes/settings
async fn update_notes_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conv_id): Path<Uuid>,
    Json(body): Json<UpdateNotesSettingsBody>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    let result = sqlx::query(
        "UPDATE conversation_user_members SET agent_notes_enabled = $1 WHERE conversation_id = $2 AND user_id = $3",
    )
    .bind(body.agent_notes_enabled)
    .bind(conv_id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => {
            Json(json!({ "agentNotesEnabled": body.agent_notes_enabled })).into_response()
        }
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Membership record not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
