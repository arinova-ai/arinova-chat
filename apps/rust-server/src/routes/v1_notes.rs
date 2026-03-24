use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::caller_identity::CallerIdentity;
use crate::routes::notes::{get_backlinks, get_linked_cards, sync_note_links};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Notes
        .route(
            "/api/v1/notes",
            get(list_notes).post(create_note),
        )
        .route(
            "/api/v1/notes/{noteId}",
            get(get_note).patch(update_note).delete(delete_note),
        )
        .route(
            "/api/v1/notes/{noteId}/thread",
            get(get_note_thread).post(post_note_thread),
        )
        // Notebooks
        .route(
            "/api/v1/notebooks",
            get(list_notebooks).post(create_notebook),
        )
        .route(
            "/api/v1/notebooks/{id}",
            get(get_notebook).patch(update_notebook).delete(delete_notebook),
        )
        .route("/api/v1/notebooks/{id}/notes", get(list_notebook_notes))
}

// ===== Types =====

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

#[derive(Debug, FromRow)]
struct NotebookRow {
    id: Uuid,
    owner_id: String,
    name: String,
    is_default: bool,
    sort_order: i32,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    note_count: Option<i64>,
}

fn notebook_to_json(row: &NotebookRow) -> serde_json::Value {
    json!({
        "id": row.id.to_string(),
        "ownerId": &row.owner_id,
        "name": &row.name,
        "isDefault": row.is_default,
        "sortOrder": row.sort_order,
        "noteCount": row.note_count.unwrap_or(0),
        "createdAt": row.created_at.to_rfc3339(),
        "updatedAt": row.updated_at.to_rfc3339(),
    })
}

// ===== Permission helpers =====

/// Check if the caller has access to a specific notebook.
async fn has_notebook_access(
    db: &sqlx::PgPool,
    caller: &CallerIdentity,
    notebook_id: Uuid,
) -> bool {
    match caller {
        CallerIdentity::Agent { agent_id, .. } => {
            sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM notebook_agent_permissions WHERE agent_id = $1 AND notebook_id = $2",
            )
            .bind(agent_id)
            .bind(notebook_id)
            .fetch_one(db)
            .await
            .map(|(c,)| c > 0)
            .unwrap_or(false)
        }
        _ => {
            let owner_id = caller.owner_id().to_string();
            sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM notebooks WHERE id = $1 AND owner_id = $2",
            )
            .bind(notebook_id)
            .bind(&owner_id)
            .fetch_one(db)
            .await
            .map(|(c,)| c > 0)
            .unwrap_or(false)
        }
    }
}

/// Get the first accessible notebook for the caller (fallback when no notebookId is specified).
async fn first_accessible_notebook(
    db: &sqlx::PgPool,
    caller: &CallerIdentity,
) -> Option<Uuid> {
    match caller {
        CallerIdentity::Agent { agent_id, .. } => {
            sqlx::query_scalar::<_, Uuid>(
                "SELECT notebook_id FROM notebook_agent_permissions WHERE agent_id = $1 LIMIT 1",
            )
            .bind(agent_id)
            .fetch_optional(db)
            .await
            .ok()
            .flatten()
        }
        _ => {
            let owner_id = caller.owner_id().to_string();
            sqlx::query_scalar::<_, Uuid>(
                "SELECT id FROM notebooks WHERE owner_id = $1 ORDER BY is_default DESC, sort_order LIMIT 1",
            )
            .bind(&owner_id)
            .fetch_optional(db)
            .await
            .ok()
            .flatten()
        }
    }
}

/// Ensure the owner has a default notebook.
async fn ensure_default_notebook(db: &sqlx::PgPool, owner_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO notebooks (owner_id, name, is_default, sort_order) VALUES ($1, 'My Notebook', true, 0) ON CONFLICT DO NOTHING",
    )
    .bind(owner_id)
    .execute(db)
    .await?;

    let default_id: (Uuid,) = sqlx::query_as(
        "SELECT id FROM notebooks WHERE owner_id = $1 AND is_default = true LIMIT 1",
    )
    .bind(owner_id)
    .fetch_one(db)
    .await?;

    sqlx::query(
        "UPDATE notes SET notebook_id = $1 WHERE owner_id = $2 AND notebook_id IS NULL",
    )
    .bind(default_id.0)
    .bind(owner_id)
    .execute(db)
    .await?;

    Ok(())
}

/// Check if the caller can modify a specific note.
/// Agents: must be the note creator (agent_id matches).
/// Users: must own the note (owner_id matches).
async fn can_modify_note(
    db: &sqlx::PgPool,
    caller: &CallerIdentity,
    note_id: Uuid,
) -> Result<bool, sqlx::Error> {
    match caller {
        CallerIdentity::Agent { agent_id, .. } => {
            let row = sqlx::query_as::<_, (Option<Uuid>, Option<Uuid>)>(
                "SELECT agent_id, notebook_id FROM notes WHERE id = $1",
            )
            .bind(note_id)
            .fetch_optional(db)
            .await?;

            match row {
                Some((Some(note_agent_id), Some(nb_id))) => {
                    if note_agent_id != *agent_id {
                        return Ok(false);
                    }
                    Ok(has_notebook_access(db, caller, nb_id).await)
                }
                Some((Some(note_agent_id), None)) => Ok(note_agent_id == *agent_id),
                _ => Ok(false),
            }
        }
        _ => {
            let owner_id = caller.owner_id().to_string();
            let count = sqlx::query_as::<_, (i64,)>(
                "SELECT COUNT(*) FROM notes WHERE id = $1 AND owner_id = $2",
            )
            .bind(note_id)
            .bind(&owner_id)
            .fetch_one(db)
            .await?;
            Ok(count.0 > 0)
        }
    }
}

// ===== Note handlers =====

#[derive(Deserialize)]
struct ListNotesQuery {
    before: Option<String>,
    limit: Option<String>,
    archived: Option<String>,
    tags: Option<String>,
    search: Option<String>,
    #[serde(rename = "notebookId")]
    notebook_id: Option<String>,
}

/// GET /api/v1/notes
async fn list_notes(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Query(query): Query<ListNotesQuery>,
) -> Response {
    // Resolve notebook
    let notebook_id = if let Some(ref nb_str) = query.notebook_id {
        match Uuid::parse_str(nb_str) {
            Ok(id) => {
                if !has_notebook_access(&state.db, &caller, id).await {
                    return (StatusCode::FORBIDDEN, Json(json!({"error": "No permission on this notebook"}))).into_response();
                }
                id
            }
            Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid notebookId"}))).into_response(),
        }
    } else {
        match first_accessible_notebook(&state.db, &caller).await {
            Some(id) => id,
            None => return (StatusCode::FORBIDDEN, Json(json!({"error": "No accessible notebooks"}))).into_response(),
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
struct CreateNoteBody {
    title: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(rename = "notebookId")]
    notebook_id: String,
}

/// POST /api/v1/notes
async fn create_note(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Json(body): Json<CreateNoteBody>,
) -> Response {
    let title = body.title.trim();
    if title.is_empty() || title.len() > 200 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Title is required (max 200 characters)"}))).into_response();
    }

    let notebook_id = match Uuid::parse_str(&body.notebook_id) {
        Ok(id) => id,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid notebookId"}))).into_response(),
    };

    if !has_notebook_access(&state.db, &caller, notebook_id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "No permission on this notebook"}))).into_response();
    }

    let note_id = Uuid::new_v4();
    let now = Utc::now();
    let tags: Vec<String> = body.tags.iter().map(|t| t.trim().to_string()).filter(|t| !t.is_empty()).collect();

    let owner_id = caller.owner_id().to_string();

    // Resolve notebook owner for note owner_id
    let nb_owner_id = sqlx::query_scalar::<_, String>("SELECT owner_id FROM notebooks WHERE id = $1")
        .bind(notebook_id).fetch_optional(&state.db).await.ok().flatten().unwrap_or_else(|| owner_id.clone());

    let (creator_id, creator_type, agent_id) = match &caller {
        CallerIdentity::Agent { agent_id, owner_id, .. } => (owner_id.to_string(), "agent", Some(*agent_id)),
        CallerIdentity::User { user_id } => (user_id.to_string(), "user", None),
        CallerIdentity::App { user_id, .. } => (user_id.to_string(), "user", None),
    };

    let result = sqlx::query(
        r#"INSERT INTO notes (id, creator_id, creator_type, agent_id, owner_id, notebook_id, title, content, tags, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)"#,
    )
    .bind(note_id)
    .bind(&creator_id)
    .bind(creator_type)
    .bind(agent_id)
    .bind(&nb_owner_id)
    .bind(notebook_id)
    .bind(title)
    .bind(&body.content)
    .bind(&tags)
    .bind(now)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            // Sync note links (fire-and-forget style, but await for correctness)
            let _ = sync_note_links(&state.db, note_id, Uuid::nil(), &body.content).await;

            let note_json = json!({
                "id": note_id,
                "creatorId": &creator_id,
                "creatorType": creator_type,
                "agentId": agent_id,
                "notebookId": notebook_id,
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

/// GET /api/v1/notes/:noteId
async fn get_note(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(note_id): Path<Uuid>,
) -> Response {
    let row = sqlx::query_as::<_, NoteRow>(&format!("{} WHERE n.id = $1", NOTE_QUERY_BASE))
        .bind(note_id).fetch_optional(&state.db).await;

    match row {
        Ok(Some(note)) => {
            // Check access: note must be in an accessible notebook
            if let Some(nb_id) = note.notebook_id {
                if !has_notebook_access(&state.db, &caller, nb_id).await {
                    return (StatusCode::FORBIDDEN, Json(json!({"error": "No permission on this notebook"}))).into_response();
                }
            } else {
                // Note has no notebook — check owner_id match
                let owner_id = caller.owner_id().to_string();
                if note.creator_id != owner_id {
                    return (StatusCode::FORBIDDEN, Json(json!({"error": "Access denied"}))).into_response();
                }
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

#[derive(Deserialize)]
struct UpdateNoteBody {
    title: Option<String>,
    content: Option<String>,
    tags: Option<Vec<String>>,
}

/// PATCH /api/v1/notes/:noteId
async fn update_note(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(note_id): Path<Uuid>,
    Json(body): Json<UpdateNoteBody>,
) -> Response {
    if body.title.is_none() && body.content.is_none() && body.tags.is_none() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Nothing to update"}))).into_response();
    }

    // Check note exists
    let note_exists = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM notes WHERE id = $1")
        .bind(note_id).fetch_one(&state.db).await.map(|(c,)| c > 0).unwrap_or(false);
    if !note_exists {
        return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response();
    }

    // Check modify permission
    match can_modify_note(&state.db, &caller, note_id).await {
        Ok(true) => {}
        Ok(false) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Not authorized to edit this note"}))).into_response(),
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
            // Sync links if content changed
            if let Some(ref content) = content_val {
                let _ = sync_note_links(&state.db, note_id, Uuid::nil(), content).await;
            }

            let row = sqlx::query_as::<_, NoteRow>(&format!("{} WHERE n.id = $1", NOTE_QUERY_BASE))
                .bind(note_id).fetch_optional(&state.db).await;
            match row {
                Ok(Some(note)) => Json(note_to_json(&note)).into_response(),
                _ => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to fetch updated note"}))).into_response(),
            }
        }
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// DELETE /api/v1/notes/:noteId
async fn delete_note(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(note_id): Path<Uuid>,
) -> Response {
    // Check note exists
    let note_exists = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM notes WHERE id = $1")
        .bind(note_id).fetch_one(&state.db).await.map(|(c,)| c > 0).unwrap_or(false);
    if !note_exists {
        return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response();
    }

    match can_modify_note(&state.db, &caller, note_id).await {
        Ok(true) => {}
        Ok(false) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Not authorized to delete this note"}))).into_response(),
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

// ===== Thread handlers =====

/// GET /api/v1/notes/:noteId/thread
async fn get_note_thread(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(note_id): Path<Uuid>,
) -> Response {
    // Verify caller has access to the note's owner data
    let owner_id = caller.owner_id().to_string();
    let has_access = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM notes WHERE id = $1 AND owner_id = $2)",
    )
    .bind(note_id)
    .bind(&owner_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !has_access {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Access denied"}))).into_response();
    }

    let rows = sqlx::query_as::<_, (Uuid, String, String, DateTime<Utc>)>(
        "SELECT id, role, content, created_at FROM note_thread_messages WHERE note_id = $1 ORDER BY created_at",
    )
    .bind(note_id)
    .fetch_all(&state.db)
    .await;

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
struct ThreadBody {
    content: String,
}

/// POST /api/v1/notes/:noteId/thread
async fn post_note_thread(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(note_id): Path<Uuid>,
    Json(body): Json<ThreadBody>,
) -> Response {
    let content = body.content.trim();
    if content.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Content required"}))).into_response();
    }

    let owner_id = caller.owner_id().to_string();
    let has_access = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM notes WHERE id = $1 AND owner_id = $2)",
    )
    .bind(note_id)
    .bind(&owner_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !has_access {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Access denied"}))).into_response();
    }

    // Agents post as "assistant", users post as "user"
    let role = if caller.is_agent() { "assistant" } else { "user" };

    let msg_id = Uuid::new_v4();
    let _ = sqlx::query(
        "INSERT INTO note_thread_messages (id, note_id, role, content) VALUES ($1, $2, $3, $4)",
    )
    .bind(msg_id)
    .bind(note_id)
    .bind(role)
    .bind(content)
    .execute(&state.db)
    .await;

    Json(json!({
        "id": msg_id,
        "role": role,
        "content": content,
    })).into_response()
}

// ===== Notebook handlers =====

/// GET /api/v1/notebooks
async fn list_notebooks(
    State(state): State<AppState>,
    caller: CallerIdentity,
) -> Response {
    let owner_id = caller.owner_id().to_string();

    // Ensure default notebook exists
    if let Err(e) = ensure_default_notebook(&state.db, &owner_id).await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response();
    }

    let rows = match &caller {
        CallerIdentity::Agent { agent_id, .. } => {
            // Agents only see notebooks they have permission on
            sqlx::query_as::<_, NotebookRow>(
                r#"
                SELECT n.id, n.owner_id, n.name, n.is_default, n.sort_order, n.created_at, n.updated_at,
                       (SELECT COUNT(*) FROM notes cn WHERE cn.notebook_id = n.id) AS note_count
                FROM notebooks n
                WHERE n.owner_id = $1
                  AND EXISTS (SELECT 1 FROM notebook_agent_permissions WHERE notebook_id = n.id AND agent_id = $2)
                ORDER BY n.sort_order, n.created_at
                "#,
            )
            .bind(&owner_id)
            .bind(agent_id)
            .fetch_all(&state.db)
            .await
        }
        _ => {
            // Users see all their own notebooks
            sqlx::query_as::<_, NotebookRow>(
                r#"
                SELECT n.id, n.owner_id, n.name, n.is_default, n.sort_order, n.created_at, n.updated_at,
                       (SELECT COUNT(*) FROM notes cn WHERE cn.notebook_id = n.id) AS note_count
                FROM notebooks n
                WHERE n.owner_id = $1
                ORDER BY n.sort_order, n.created_at
                "#,
            )
            .bind(&owner_id)
            .fetch_all(&state.db)
            .await
        }
    };

    match rows {
        Ok(notebooks) => {
            let items: Vec<_> = notebooks.iter().map(notebook_to_json).collect();
            Json(json!({ "notebooks": items })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

#[derive(Deserialize)]
struct CreateNotebookBody {
    name: String,
}

/// POST /api/v1/notebooks
async fn create_notebook(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Json(body): Json<CreateNotebookBody>,
) -> Response {
    let name = body.name.trim();
    if name.is_empty() || name.len() > 255 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Name is required (max 255 characters)"}))).into_response();
    }

    let owner_id = caller.owner_id().to_string();

    let max_order: Option<(i32,)> = sqlx::query_as(
        "SELECT COALESCE(MAX(sort_order), -1) FROM notebooks WHERE owner_id = $1",
    )
    .bind(&owner_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    let next_order = max_order.map(|r| r.0 + 1).unwrap_or(0);

    let row = sqlx::query_as::<_, NotebookRow>(
        r#"
        INSERT INTO notebooks (owner_id, name, sort_order)
        VALUES ($1, $2, $3)
        RETURNING id, owner_id, name, is_default, sort_order, created_at, updated_at, 0::bigint AS note_count
        "#,
    )
    .bind(&owner_id)
    .bind(name)
    .bind(next_order)
    .fetch_one(&state.db)
    .await;

    match row {
        Ok(nb) => {
            // If caller is an agent, auto-grant permission on the new notebook
            if let CallerIdentity::Agent { agent_id, .. } = &caller {
                let _ = sqlx::query(
                    "INSERT INTO notebook_agent_permissions (notebook_id, agent_id, granted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                )
                .bind(nb.id)
                .bind(agent_id)
                .bind(caller.owner_id().to_string())
                .execute(&state.db)
                .await;
            }

            (StatusCode::CREATED, Json(notebook_to_json(&nb))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// GET /api/v1/notebooks/:id
async fn get_notebook(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(id): Path<Uuid>,
) -> Response {
    if !has_notebook_access(&state.db, &caller, id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not authorized"}))).into_response();
    }

    let row = sqlx::query_as::<_, NotebookRow>(
        r#"
        SELECT n.id, n.owner_id, n.name, n.is_default, n.sort_order, n.created_at, n.updated_at,
               (SELECT COUNT(*) FROM notes cn WHERE cn.notebook_id = n.id) AS note_count
        FROM notebooks n
        WHERE n.id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(nb)) => Json(notebook_to_json(&nb)).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({"error": "Notebook not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateNotebookBody {
    name: Option<String>,
    sort_order: Option<i32>,
}

/// PATCH /api/v1/notebooks/:id
async fn update_notebook(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateNotebookBody>,
) -> Response {
    if body.name.is_none() && body.sort_order.is_none() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Nothing to update"}))).into_response();
    }

    if !has_notebook_access(&state.db, &caller, id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not authorized"}))).into_response();
    }

    // Verify notebook exists
    let nb_exists = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM notebooks WHERE id = $1")
        .bind(id).fetch_one(&state.db).await.map(|(c,)| c > 0).unwrap_or(false);
    if !nb_exists {
        return (StatusCode::NOT_FOUND, Json(json!({"error": "Notebook not found"}))).into_response();
    }

    if let Some(ref name) = body.name {
        let name = name.trim();
        if name.is_empty() || name.len() > 255 {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "Name is required (max 255 characters)"}))).into_response();
        }
    }

    let mut sets = vec!["updated_at = NOW()".to_string()];
    let mut idx = 1u32;

    if body.name.is_some() {
        sets.push(format!("name = ${idx}"));
        idx += 1;
    }
    if body.sort_order.is_some() {
        sets.push(format!("sort_order = ${idx}"));
        idx += 1;
    }

    let sql = format!(
        "UPDATE notebooks SET {} WHERE id = ${} RETURNING id, owner_id, name, is_default, sort_order, created_at, updated_at, 0::bigint AS note_count",
        sets.join(", "),
        idx
    );

    let mut q = sqlx::query_as::<_, NotebookRow>(&sql);
    if let Some(ref name) = body.name {
        q = q.bind(name.trim());
    }
    if let Some(sort_order) = body.sort_order {
        q = q.bind(sort_order);
    }
    q = q.bind(id);

    match q.fetch_one(&state.db).await {
        Ok(nb) => Json(notebook_to_json(&nb)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// DELETE /api/v1/notebooks/:id
async fn delete_notebook(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(id): Path<Uuid>,
) -> Response {
    // Check access
    if !has_notebook_access(&state.db, &caller, id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not authorized"}))).into_response();
    }

    let row: Option<(String, bool)> =
        sqlx::query_as("SELECT owner_id, is_default FROM notebooks WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);

    match row {
        None => {
            return (StatusCode::NOT_FOUND, Json(json!({"error": "Notebook not found"}))).into_response();
        }
        Some((_, true)) => {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "Cannot delete default notebook"}))).into_response();
        }
        Some((ref owner_id, _)) => {
            // Move notes to default notebook
            let default_id: Option<(Uuid,)> = sqlx::query_as(
                "SELECT id FROM notebooks WHERE owner_id = $1 AND is_default = true LIMIT 1",
            )
            .bind(owner_id)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);

            if let Some((default_id,)) = default_id {
                let _ = sqlx::query("UPDATE notes SET notebook_id = $1 WHERE notebook_id = $2")
                    .bind(default_id)
                    .bind(id)
                    .execute(&state.db)
                    .await;
            }
        }
    }

    match sqlx::query("DELETE FROM notebooks WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await
    {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// GET /api/v1/notebooks/:id/notes
async fn list_notebook_notes(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(id): Path<Uuid>,
) -> Response {
    // Check notebook exists and caller has access
    let owner: Option<(String,)> =
        sqlx::query_as("SELECT owner_id FROM notebooks WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);

    if owner.is_none() {
        return (StatusCode::NOT_FOUND, Json(json!({"error": "Notebook not found"}))).into_response();
    }

    if !has_notebook_access(&state.db, &caller, id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not authorized"}))).into_response();
    }

    #[derive(FromRow)]
    struct NoteListRow {
        id: Uuid,
        title: String,
        tags: Vec<String>,
        is_pinned: bool,
        created_at: DateTime<Utc>,
        updated_at: DateTime<Utc>,
    }

    let rows = sqlx::query_as::<_, NoteListRow>(
        r#"
        SELECT id, title, tags,
               COALESCE(is_pinned, false) AS is_pinned,
               created_at, updated_at
        FROM notes
        WHERE notebook_id = $1 AND archived_at IS NULL
        ORDER BY is_pinned DESC, updated_at DESC
        "#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(notes) => {
            let items: Vec<_> = notes
                .iter()
                .map(|n| {
                    json!({
                        "id": n.id.to_string(),
                        "title": &n.title,
                        "tags": &n.tags,
                        "isPinned": n.is_pinned,
                        "createdAt": n.created_at.to_rfc3339(),
                        "updatedAt": n.updated_at.to_rfc3339(),
                    })
                })
                .collect();
            Json(json!({ "notes": items })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}
