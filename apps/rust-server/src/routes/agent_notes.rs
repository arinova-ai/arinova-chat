use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::middleware::AuthAgent;
use crate::AppState;
use crate::routes::notes::{get_backlinks, get_linked_cards, normalize_tag, sync_note_links};

pub fn router() -> Router<AppState> {
    Router::new()
        // Standalone agent routes (notebook-based)
        .route(
            "/api/agent/notes",
            get(agent_list_notes_standalone).post(agent_create_note_standalone),
        )
        .route(
            "/api/agent/notes/{noteId}",
            get(agent_get_note_standalone).patch(agent_update_note_standalone).delete(agent_delete_note_standalone),
        )
        .route(
            "/api/agent/notes/{noteId}/thread",
            get(agent_get_note_thread).post(agent_post_note_thread),
        )
}

// ===== Internal types =====

#[derive(Debug, FromRow)]
struct NoteRow {
    id: Uuid,
    creator_id: String,
    creator_type: String,
    agent_id: Option<Uuid>,
    notebook_id: Option<Uuid>,
    title: String,
    content: String,
    tags: Vec<String>,
    archived_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    creator_name: String,
    agent_name: Option<String>,
}

const NOTE_QUERY_BASE: &str = r#"
    SELECT n.id, n.creator_id, n.creator_type, n.agent_id, n.notebook_id,
           n.title, n.content, n.tags, n.archived_at, n.created_at, n.updated_at,
           COALESCE(CASE WHEN n.creator_type = 'agent' THEN a.name END, u.name, 'Unknown') AS creator_name,
           a.name AS agent_name
    FROM notes n
    LEFT JOIN "user" u ON u.id = n.creator_id
    LEFT JOIN agents a ON a.id = n.agent_id
"#;

fn note_to_json(n: &NoteRow) -> serde_json::Value {
    json!({
        "id": n.id,
        "creatorId": n.creator_id,
        "creatorType": n.creator_type,
        "creatorName": n.creator_name,
        "agentId": n.agent_id,
        "agentName": n.agent_name,
        "notebookId": n.notebook_id,
        "title": n.title,
        "content": n.content,
        "tags": n.tags,
        "archivedAt": n.archived_at.map(|t| t.to_rfc3339()),
        "createdAt": n.created_at.to_rfc3339(),
        "updatedAt": n.updated_at.to_rfc3339(),
    })
}

// ===== Helpers =====

/// Check if the agent has permission on ANY notebook (for standalone routes).
/// Returns the first permitted notebook_id, or None.
async fn agent_permitted_notebook(db: &sqlx::PgPool, agent_id: Uuid) -> Option<Uuid> {
    sqlx::query_scalar::<_, Uuid>(
        r#"SELECT nap.notebook_id FROM notebook_agent_permissions nap
           WHERE nap.agent_id = $1 LIMIT 1"#,
    )
    .bind(agent_id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
}

/// Check if the agent has permission on a specific notebook.
async fn agent_has_notebook_permission(db: &sqlx::PgPool, agent_id: Uuid, notebook_id: Uuid) -> bool {
    sqlx::query_as::<_, (i64,)>(
        r#"SELECT COUNT(*) FROM notebook_agent_permissions nap
           WHERE nap.agent_id = $1 AND nap.notebook_id = $2"#,
    )
    .bind(agent_id)
    .bind(notebook_id)
    .fetch_one(db)
    .await
    .map(|(c,)| c > 0)
    .unwrap_or(false)
}

#[derive(Deserialize)]
struct UpdateNoteBody {
    title: Option<String>,
    content: Option<String>,
    tags: Option<Vec<String>>,
}

// ===== Standalone agent note handlers (notebook-based) =====

#[derive(Deserialize)]
struct StandaloneListNotesQuery {
    before: Option<String>,
    limit: Option<String>,
    archived: Option<String>,
    tags: Option<String>,
    search: Option<String>,
    #[serde(rename = "notebookId")]
    notebook_id: Option<String>,
}

/// GET /api/agent/notes — list notes from notebooks the agent has permission on
async fn agent_list_notes_standalone(
    State(state): State<AppState>,
    agent: AuthAgent,
    Query(query): Query<StandaloneListNotesQuery>,
) -> Response {
    // Resolve notebook: explicit param or first permitted
    let notebook_id = if let Some(ref nb_str) = query.notebook_id {
        match Uuid::parse_str(nb_str) {
            Ok(id) => {
                if !agent_has_notebook_permission(&state.db, agent.id, id).await {
                    return (StatusCode::FORBIDDEN, Json(json!({"error": "No permission on this notebook"}))).into_response();
                }
                id
            }
            Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid notebookId"}))).into_response(),
        }
    } else {
        match agent_permitted_notebook(&state.db, agent.id).await {
            Some(id) => id,
            None => return (StatusCode::FORBIDDEN, Json(json!({"error": "Agent has no notebook permissions"}))).into_response(),
        }
    };

    let limit: i64 = query.limit.as_deref().and_then(|v| v.parse::<i64>().ok()).unwrap_or(20).min(50);
    let show_archived = query.archived.as_deref() == Some("true");
    let tag_filter: Vec<String> = query.tags.as_deref()
        .map(|t| t.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();

    let cursor_ts: Option<DateTime<Utc>> = if let Some(ref before_id) = query.before {
        let before_uuid = match Uuid::parse_str(before_id) {
            Ok(u) => u,
            Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid cursor"}))).into_response(),
        };
        sqlx::query_as::<_, (DateTime<Utc>,)>("SELECT created_at FROM notes WHERE id = $1")
            .bind(before_uuid).fetch_optional(&state.db).await.ok().flatten().map(|(ts,)| ts)
    } else { None };

    let archive_cond = if show_archived { "n.archived_at IS NOT NULL" } else { "n.archived_at IS NULL" };
    let tag_cond = if tag_filter.is_empty() {
        String::new()
    } else {
        format!(" AND n.tags @> ARRAY[{}]::text[]",
            tag_filter.iter().map(|t| format!("'{}'", t.replace('\'', "''"))).collect::<Vec<_>>().join(","))
    };
    let search_cond = if let Some(ref s) = query.search {
        let s = s.trim();
        if !s.is_empty() {
            let escaped = s.replace('%', "\\%").replace('_', "\\_").replace('\'', "''");
            format!(" AND (n.title ILIKE '%{}%' OR n.content ILIKE '%{}%')", escaped, escaped)
        } else { String::new() }
    } else { String::new() };

    let rows = if let Some(ts) = cursor_ts {
        sqlx::query_as::<_, NoteRow>(&format!(
            "{} WHERE n.notebook_id = $1 AND {} {} {} AND n.created_at < $2 ORDER BY n.created_at DESC LIMIT $3",
            NOTE_QUERY_BASE, archive_cond, tag_cond, search_cond
        ))
        .bind(notebook_id).bind(ts).bind(limit + 1).fetch_all(&state.db).await
    } else {
        sqlx::query_as::<_, NoteRow>(&format!(
            "{} WHERE n.notebook_id = $1 AND {} {} {} ORDER BY n.created_at DESC LIMIT $2",
            NOTE_QUERY_BASE, archive_cond, tag_cond, search_cond
        ))
        .bind(notebook_id).bind(limit + 1).fetch_all(&state.db).await
    };

    match rows {
        Ok(rows) => {
            let has_more = rows.len() as i64 > limit;
            let items: Vec<serde_json::Value> = rows.iter().take(limit as usize).map(note_to_json).collect();
            let next_cursor = if has_more { items.last().and_then(|n| n.get("id").cloned()) } else { None };
            Json(json!({"notes": items, "hasMore": has_more, "nextCursor": next_cursor})).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

#[derive(Deserialize)]
struct StandaloneCreateNoteBody {
    title: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(rename = "notebookId")]
    notebook_id: String,
}

/// POST /api/agent/notes — create note in a notebook
async fn agent_create_note_standalone(
    State(state): State<AppState>,
    agent: AuthAgent,
    Json(body): Json<StandaloneCreateNoteBody>,
) -> Response {
    let title = body.title.trim();
    if title.is_empty() || title.len() > 200 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Title is required (max 200 characters)"}))).into_response();
    }

    let notebook_id = match Uuid::parse_str(&body.notebook_id) {
        Ok(id) => id,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid notebookId"}))).into_response(),
    };

    if !agent_has_notebook_permission(&state.db, agent.id, notebook_id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "No permission on this notebook"}))).into_response();
    }

    let note_id = Uuid::new_v4();
    let now = Utc::now();
    let tags: Vec<String> = body.tags.iter().map(|t| t.trim().to_string()).filter(|t| !t.is_empty()).collect();

    // Use agent's owner ID as creator_id
    let owner_id = match sqlx::query_as::<_, (String,)>("SELECT owner_id FROM agents WHERE id = $1")
        .bind(agent.id).fetch_optional(&state.db).await {
        Ok(Some((id,))) => id,
        _ => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to resolve agent owner"}))).into_response(),
    };

    // Resolve notebook owner for note owner_id
    let nb_owner_id = sqlx::query_scalar::<_, String>("SELECT owner_id FROM notebooks WHERE id = $1")
        .bind(notebook_id).fetch_optional(&state.db).await.ok().flatten().unwrap_or_else(|| owner_id.clone());

    let result = sqlx::query(
        r#"INSERT INTO notes (id, creator_id, creator_type, agent_id, owner_id, notebook_id, title, content, tags, created_at, updated_at)
           VALUES ($1, $2, 'agent', $3, $4, $5, $6, $7, $8, $9, $9)"#,
    )
    .bind(note_id).bind(&owner_id).bind(agent.id).bind(&nb_owner_id).bind(notebook_id)
    .bind(title).bind(&body.content).bind(&tags).bind(now)
    .execute(&state.db).await;

    match result {
        Ok(_) => {
            let note_json = json!({
                "id": note_id,
                "conversationId": null,
                "creatorId": &owner_id,
                "creatorType": "agent",
                "creatorName": &agent.name,
                "agentId": agent.id,
                "agentName": &agent.name,
                "title": title,
                "content": &body.content,
                "tags": &tags,
                "archivedAt": null,
                "createdAt": now.to_rfc3339(),
                "updatedAt": now.to_rfc3339(),
            });
            (StatusCode::CREATED, Json(note_json)).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// GET /api/agent/notes/:noteId — get a single note by ID
async fn agent_get_note_standalone(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(note_id): Path<Uuid>,
) -> Response {
    let row = sqlx::query_as::<_, NoteRow>(&format!("{} WHERE n.id = $1", NOTE_QUERY_BASE))
        .bind(note_id).fetch_optional(&state.db).await;

    match row {
        Ok(Some(note)) => {
            // Verify agent has permission on the note's notebook
            if let Some(nb_id) = sqlx::query_scalar::<_, Uuid>(
                "SELECT notebook_id FROM notes WHERE id = $1",
            ).bind(note_id).fetch_optional(&state.db).await.ok().flatten() {
                if !agent_has_notebook_permission(&state.db, agent.id, nb_id).await {
                    return (StatusCode::FORBIDDEN, Json(json!({"error": "No permission on this notebook"}))).into_response();
                }
            } else {
                return (StatusCode::FORBIDDEN, Json(json!({"error": "Note has no notebook"}))).into_response();
            }

            let mut j = note_to_json(&note);
            let backlinks = get_backlinks(&state.db, note.id).await;
            let linked_cards = get_linked_cards(&state.db, note.id).await;
            j.as_object_mut().unwrap().insert("backlinks".into(), json!(backlinks));
            j.as_object_mut().unwrap().insert("linkedCards".into(), json!(linked_cards));
            Json(j).into_response()
        }
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// PATCH /api/agent/notes/:noteId — update a note by ID
async fn agent_update_note_standalone(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(note_id): Path<Uuid>,
    Json(body): Json<UpdateNoteBody>,
) -> Response {
    if body.title.is_none() && body.content.is_none() && body.tags.is_none() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Nothing to update"}))).into_response();
    }

    // Verify agent has permission on the note's notebook and is the creator
    let note = sqlx::query_as::<_, (Option<Uuid>, Option<Uuid>)>(
        "SELECT agent_id, notebook_id FROM notes WHERE id = $1",
    ).bind(note_id).fetch_optional(&state.db).await;

    match note {
        Ok(Some((Some(note_agent_id), Some(nb_id)))) => {
            if note_agent_id != agent.id {
                return (StatusCode::FORBIDDEN, Json(json!({"error": "Not authorized to edit this note"}))).into_response();
            }
            if !agent_has_notebook_permission(&state.db, agent.id, nb_id).await {
                return (StatusCode::FORBIDDEN, Json(json!({"error": "No permission on this notebook"}))).into_response();
            }
        }
        Ok(Some((Some(note_agent_id), None))) if note_agent_id == agent.id => {}
        Ok(Some(_)) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Not authorized to edit this note"}))).into_response(),
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }

    if let Some(ref title) = body.title {
        let title = title.trim();
        if title.is_empty() || title.len() > 200 {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "Title is required (max 200 characters)"}))).into_response();
        }
    }

    let mut set_clauses = vec!["updated_at = NOW()".to_string()];
    let mut param_idx = 1u32;

    let title_val = body.title.as_ref().map(|t| t.trim().to_string());
    let content_val = body.content.clone();
    let tags_val: Option<Vec<String>> = body.tags.as_ref().map(|t| t.iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect());

    if title_val.is_some() { set_clauses.push(format!("title = ${param_idx}")); param_idx += 1; }
    if content_val.is_some() { set_clauses.push(format!("content = ${param_idx}")); param_idx += 1; }
    if tags_val.is_some() { set_clauses.push(format!("tags = ${param_idx}")); param_idx += 1; }

    let sql = format!("UPDATE notes SET {} WHERE id = ${}", set_clauses.join(", "), param_idx);

    let mut q = sqlx::query(&sql);
    if let Some(ref title) = title_val { q = q.bind(title); }
    if let Some(ref content) = content_val { q = q.bind(content); }
    if let Some(ref tags) = tags_val { q = q.bind(tags); }
    q = q.bind(note_id);

    let updated = q.execute(&state.db).await;

    match updated {
        Ok(r) if r.rows_affected() > 0 => {
            let row = sqlx::query_as::<_, NoteRow>(&format!("{} WHERE n.id = $1", NOTE_QUERY_BASE))
                .bind(note_id).fetch_optional(&state.db).await;
            match row {
                Ok(Some(note)) => {
                    let note_json = note_to_json(&note);
                    Json(note_json).into_response()
                }
                _ => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to fetch updated note"}))).into_response(),
            }
        }
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// DELETE /api/agent/notes/:noteId — delete a note by ID
async fn agent_delete_note_standalone(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(note_id): Path<Uuid>,
) -> Response {
    // Verify agent created the note and has notebook permission
    let note = sqlx::query_as::<_, (Option<Uuid>, Option<Uuid>)>(
        "SELECT agent_id, notebook_id FROM notes WHERE id = $1",
    ).bind(note_id).fetch_optional(&state.db).await;

    match note {
        Ok(Some((Some(note_agent_id), Some(nb_id)))) => {
            if note_agent_id != agent.id {
                return (StatusCode::FORBIDDEN, Json(json!({"error": "Not authorized to delete this note"}))).into_response();
            }
            if !agent_has_notebook_permission(&state.db, agent.id, nb_id).await {
                return (StatusCode::FORBIDDEN, Json(json!({"error": "No permission on this notebook"}))).into_response();
            }
        }
        Ok(Some((Some(note_agent_id), None))) if note_agent_id == agent.id => {}
        Ok(Some(_)) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Not authorized to delete this note"}))).into_response(),
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }

    let result = sqlx::query("DELETE FROM notes WHERE id = $1")
        .bind(note_id).execute(&state.db).await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ===== Agent Note Thread =====

/// GET /api/agent/notes/:noteId/thread — list thread messages
async fn agent_get_note_thread(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(note_id): Path<Uuid>,
) -> Response {
    // Verify agent has access (note belongs to agent's owner)
    let has_access = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM notes n JOIN agents a ON a.owner_id = n.owner_id WHERE n.id = $1 AND a.id = $2)",
    ).bind(note_id).bind(agent.id).fetch_one(&state.db).await.unwrap_or(false);
    if !has_access {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Access denied"}))).into_response();
    }

    let rows = sqlx::query_as::<_, (Uuid, String, String, DateTime<Utc>)>(
        "SELECT id, role, content, created_at FROM note_thread_messages WHERE note_id = $1 ORDER BY created_at",
    ).bind(note_id).fetch_all(&state.db).await;

    match rows {
        Ok(msgs) => {
            let items: Vec<_> = msgs.iter().map(|(id, role, content, created)| json!({
                "id": id, "role": role, "content": content, "createdAt": created.to_rfc3339(),
            })).collect();
            Json(json!({ "messages": items })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

#[derive(Deserialize)]
struct AgentThreadBody {
    content: String,
}

/// POST /api/agent/notes/:noteId/thread — agent replies to note thread (role=assistant)
async fn agent_post_note_thread(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(note_id): Path<Uuid>,
    Json(body): Json<AgentThreadBody>,
) -> Response {
    let content = body.content.trim();
    if content.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Content required"}))).into_response();
    }

    let has_access = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM notes n JOIN agents a ON a.owner_id = n.owner_id WHERE n.id = $1 AND a.id = $2)",
    ).bind(note_id).bind(agent.id).fetch_one(&state.db).await.unwrap_or(false);
    if !has_access {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Access denied"}))).into_response();
    }

    let msg_id = Uuid::new_v4();
    let _ = sqlx::query(
        "INSERT INTO note_thread_messages (id, note_id, role, content) VALUES ($1, $2, 'assistant', $3)",
    ).bind(msg_id).bind(note_id).bind(content).execute(&state.db).await;

    Json(json!({
        "id": msg_id,
        "role": "assistant",
        "content": content,
    })).into_response()
}
