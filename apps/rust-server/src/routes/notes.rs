use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, patch, post},
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
            get(get_note).patch(update_note).delete(delete_note),
        )
        .route(
            "/api/conversations/{id}/notes/{noteId}/archive",
            post(archive_note),
        )
        .route(
            "/api/conversations/{id}/notes/{noteId}/unarchive",
            post(unarchive_note),
        )
        .route(
            "/api/conversations/{id}/notes/{noteId}/share",
            post(share_note),
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
    tags: Vec<String>,
    archived_at: Option<DateTime<Utc>>,
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
        "tags": n.tags,
        "archivedAt": n.archived_at.map(|t| t.to_rfc3339()),
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

/// Normalize a tag for comparison: trim, lowercase, strip leading '#'.
pub fn normalize_tag(tag: &str) -> String {
    let s = tag.trim().to_lowercase();
    s.strip_prefix('#').unwrap_or(&s).to_string()
}

/// Auto-create a Kanban card in Backlog when note gets #prd tag.
/// Auto-creates a default board if user has none. Deduplicates by note_id via kanban_card_notes.
pub async fn auto_create_prd_card(db: &PgPool, owner_id: &str, note_id: Uuid, note_title: &str) {
    // Ensure user has a board; create default if missing
    let board_id = match sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM kanban_boards WHERE owner_id = $1 LIMIT 1",
    )
    .bind(owner_id)
    .fetch_optional(db)
    .await
    {
        Ok(Some(id)) => id,
        Ok(None) => {
            // Auto-create default board with 5 columns
            let new_board = sqlx::query_scalar::<_, Uuid>(
                "INSERT INTO kanban_boards (owner_id, name) VALUES ($1, 'My Board') RETURNING id",
            )
            .bind(owner_id)
            .fetch_one(db)
            .await;

            let new_board = match new_board {
                Ok(id) => id,
                Err(_) => return,
            };

            for (name, order) in [("Backlog", 0), ("To Do", 1), ("In Progress", 2), ("Review", 3), ("Done", 4)] {
                let _ = sqlx::query(
                    "INSERT INTO kanban_columns (board_id, name, sort_order) VALUES ($1, $2, $3)",
                )
                .bind(new_board)
                .bind(name)
                .bind(order)
                .execute(db)
                .await;
            }

            new_board
        }
        Err(_) => return,
    };

    // Find the Backlog column
    let backlog_id = match sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM kanban_columns WHERE board_id = $1 AND name = 'Backlog' LIMIT 1",
    )
    .bind(board_id)
    .fetch_optional(db)
    .await
    {
        Ok(Some(id)) => id,
        _ => return,
    };

    // Deduplicate by note_id — skip if this note already has a linked card
    let already_linked = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM kanban_card_notes WHERE note_id = $1)",
    )
    .bind(note_id)
    .fetch_one(db)
    .await
    .unwrap_or(false);

    if already_linked {
        // Sync card title to latest note title
        let _ = sqlx::query(
            r#"UPDATE kanban_cards SET title = $1
               WHERE id = (SELECT card_id FROM kanban_card_notes WHERE note_id = $2 LIMIT 1)"#,
        )
        .bind(note_title)
        .bind(note_id)
        .execute(db)
        .await;
        return;
    }

    // Create the card
    let card_id = sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO kanban_cards (column_id, title, priority, sort_order, created_by)
           VALUES ($1, $2, 'medium', 0, $3)
           RETURNING id"#,
    )
    .bind(backlog_id)
    .bind(note_title)
    .bind(owner_id)
    .fetch_optional(db)
    .await;

    if let Ok(Some(card_id)) = card_id {
        let _ = sqlx::query(
            "INSERT INTO kanban_card_notes (card_id, note_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(card_id)
        .bind(note_id)
        .execute(db)
        .await;
    }
}

/// Parse [[Note Title]] references from content, returning unique titles.
pub fn parse_note_links(content: &str) -> Vec<String> {
    let mut titles = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut start = 0;
    let bytes = content.as_bytes();
    while start + 3 < bytes.len() {
        if bytes[start] == b'[' && bytes.get(start + 1) == Some(&b'[') {
            if let Some(end) = content[start + 2..].find("]]") {
                let title = content[start + 2..start + 2 + end].trim().to_string();
                if !title.is_empty() && seen.insert(title.clone()) {
                    titles.push(title);
                }
                start = start + 2 + end + 2;
                continue;
            }
        }
        start += 1;
    }
    titles
}

/// Sync note_links table for a given source note based on parsed [[]] references.
pub async fn sync_note_links(db: &PgPool, source_note_id: Uuid, conv_id: Uuid, content: &str) {
    let titles = parse_note_links(content);

    // Delete old links from this source
    let _ = sqlx::query("DELETE FROM note_links WHERE source_note_id = $1")
        .bind(source_note_id)
        .execute(db)
        .await;

    if titles.is_empty() {
        return;
    }

    // Find target notes by title within the same conversation
    for title in &titles {
        let target = sqlx::query_as::<_, (Uuid,)>(
            "SELECT id FROM conversation_notes WHERE conversation_id = $1 AND LOWER(title) = LOWER($2) AND id != $3 LIMIT 1",
        )
        .bind(conv_id)
        .bind(title)
        .bind(source_note_id)
        .fetch_optional(db)
        .await;

        if let Ok(Some((target_id,))) = target {
            let _ = sqlx::query(
                "INSERT INTO note_links (source_note_id, target_note_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            )
            .bind(source_note_id)
            .bind(target_id)
            .execute(db)
            .await;
        }
    }
}

#[derive(Debug, sqlx::FromRow)]
struct BacklinkRow {
    id: Uuid,
    title: String,
}

/// Get backlinks (notes that reference this note via [[]]).
pub async fn get_backlinks(db: &PgPool, note_id: Uuid) -> Vec<serde_json::Value> {
    let rows = sqlx::query_as::<_, BacklinkRow>(
        r#"SELECT n.id, n.title
           FROM note_links nl
           JOIN conversation_notes n ON n.id = nl.source_note_id
           WHERE nl.target_note_id = $1
           ORDER BY n.title"#,
    )
    .bind(note_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    rows.iter()
        .map(|r| serde_json::json!({ "id": r.id, "title": r.title }))
        .collect()
}

/// Get kanban cards linked to a note.
pub async fn get_linked_cards(db: &PgPool, note_id: Uuid) -> Vec<serde_json::Value> {
    let rows = sqlx::query_as::<_, (Uuid, String)>(
        r#"SELECT c.id, c.title
           FROM kanban_cards c
           JOIN kanban_card_notes cn ON cn.card_id = c.id
           WHERE cn.note_id = $1
           ORDER BY c.title"#,
    )
    .bind(note_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    rows.iter()
        .map(|(id, title)| serde_json::json!({ "id": id, "title": title }))
        .collect()
}

const NOTE_QUERY_BASE: &str = r#"
    SELECT n.id, n.conversation_id, n.creator_id, n.creator_type, n.agent_id,
           n.title, n.content, n.tags, n.archived_at, n.created_at, n.updated_at,
           COALESCE(CASE WHEN n.creator_type = 'agent' THEN a.name END, u.name, 'Unknown') AS creator_name,
           a.name AS agent_name
    FROM conversation_notes n
    LEFT JOIN "user" u ON u.id = n.creator_id
    LEFT JOIN agents a ON a.id = n.agent_id
"#;

// ===== Handlers =====

/// GET /api/conversations/:id/notes/:noteId
async fn get_note(
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

    let row = sqlx::query_as::<_, NoteRow>(&format!(
        "{} WHERE n.id = $1 AND n.conversation_id = $2",
        NOTE_QUERY_BASE
    ))
    .bind(note_id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(note)) => {
            let mut j = note_to_json(&note);
            let backlinks = get_backlinks(&state.db, note.id).await;
            let linked_cards = get_linked_cards(&state.db, note.id).await;
            j.as_object_mut().unwrap().insert("backlinks".into(), json!(backlinks));
            j.as_object_mut().unwrap().insert("linkedCards".into(), json!(linked_cards));
            Json(j).into_response()
        }
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
    archived: Option<String>,
    tags: Option<String>,
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

    let show_archived = query.archived.as_deref() == Some("true");
    let tag_filter: Vec<String> = query
        .tags
        .as_deref()
        .map(|t| t.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
        .unwrap_or_default();

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

    // Build archive condition
    let archive_cond = if show_archived {
        "n.archived_at IS NOT NULL"
    } else {
        "n.archived_at IS NULL"
    };

    // Build tag condition
    let tag_cond = if tag_filter.is_empty() {
        String::new()
    } else {
        // AND logic: note must contain ALL specified tags
        format!(" AND n.tags @> ARRAY[{}]::text[]",
            tag_filter.iter().map(|t| format!("'{}'", t.replace('\'', "''"))).collect::<Vec<_>>().join(","))
    };

    let rows = if let Some(ts) = cursor_ts {
        sqlx::query_as::<_, NoteRow>(&format!(
            "{} WHERE n.conversation_id = $1 AND {} {} AND n.created_at < $2 ORDER BY n.created_at DESC LIMIT $3",
            NOTE_QUERY_BASE, archive_cond, tag_cond
        ))
        .bind(conv_id)
        .bind(ts)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as::<_, NoteRow>(&format!(
            "{} WHERE n.conversation_id = $1 AND {} {} ORDER BY n.created_at DESC LIMIT $2",
            NOTE_QUERY_BASE, archive_cond, tag_cond
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
    #[serde(default)]
    tags: Vec<String>,
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
    let tags: Vec<String> = body.tags.iter().map(|t| t.trim().to_string()).filter(|t| !t.is_empty()).collect();

    let result = sqlx::query(
        r#"INSERT INTO conversation_notes (id, conversation_id, creator_id, creator_type, title, content, tags, created_at, updated_at)
           VALUES ($1, $2, $3, 'user', $4, $5, $6, $7, $7)"#,
    )
    .bind(note_id)
    .bind(conv_id)
    .bind(&user.id)
    .bind(title)
    .bind(&body.content)
    .bind(&tags)
    .bind(now)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            // Sync [[Note Title]] backlinks
            if !body.content.is_empty() {
                sync_note_links(&state.db, note_id, conv_id, &body.content).await;
            }

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
                "tags": &tags,
                "archivedAt": null,
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

            // #urgent tag → notify agents
            if tags.iter().any(|t| normalize_tag(t) == "urgent") {
                state.ws.broadcast_to_members(
                    &member_ids,
                    &json!({
                        "type": "note:urgent",
                        "conversationId": conv_id.to_string(),
                        "noteId": note_id.to_string(),
                        "title": title,
                        "tags": &tags,
                    }),
                    &state.redis,
                );
            }

            // #prd tag → auto-create Kanban card in Backlog
            if tags.iter().any(|t| normalize_tag(t) == "prd") {
                auto_create_prd_card(&state.db, &user.id, note_id, title).await;
            }

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
    tags: Option<Vec<String>>,
}

/// PATCH /api/conversations/:id/notes/:noteId
async fn update_note(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, note_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateNoteBody>,
) -> Response {
    if body.title.is_none() && body.content.is_none() && body.tags.is_none() {
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

    // Dynamic UPDATE — build SET clauses
    let now = Utc::now();
    let mut set_clauses = vec!["updated_at = NOW()".to_string()];
    let mut param_idx = 1u32;

    // We'll build a raw SQL string with positional params
    // Collect bind values in order
    struct DynParam {
        title: Option<String>,
        content: Option<String>,
        tags: Option<Vec<String>>,
    }
    let dyn_params = DynParam {
        title: body.title.as_ref().map(|t| t.trim().to_string()),
        content: body.content.clone(),
        tags: body.tags.as_ref().map(|t| t.iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()),
    };

    if dyn_params.title.is_some() {
        set_clauses.push(format!("title = ${param_idx}"));
        param_idx += 1;
    }
    if dyn_params.content.is_some() {
        set_clauses.push(format!("content = ${param_idx}"));
        param_idx += 1;
    }
    if dyn_params.tags.is_some() {
        set_clauses.push(format!("tags = ${param_idx}"));
        param_idx += 1;
    }

    let sql = format!(
        "UPDATE conversation_notes SET {} WHERE id = ${} AND conversation_id = ${}",
        set_clauses.join(", "),
        param_idx,
        param_idx + 1
    );

    let mut q = sqlx::query(&sql);
    if let Some(ref title) = dyn_params.title { q = q.bind(title); }
    if let Some(ref content) = dyn_params.content { q = q.bind(content); }
    if let Some(ref tags) = dyn_params.tags { q = q.bind(tags); }
    q = q.bind(note_id).bind(conv_id);

    let updated = q.execute(&state.db).await;

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
                    // Sync [[Note Title]] backlinks if content was updated
                    if dyn_params.content.is_some() {
                        sync_note_links(&state.db, note_id, conv_id, &note.content).await;
                    }

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

                    // #urgent tag → notify agents
                    if note.tags.iter().any(|t| normalize_tag(t) == "urgent") {
                        state.ws.broadcast_to_members(
                            &member_ids,
                            &json!({
                                "type": "note:urgent",
                                "conversationId": conv_id.to_string(),
                                "noteId": note_id.to_string(),
                                "title": &note.title,
                                "tags": &note.tags,
                            }),
                            &state.redis,
                        );
                    }

                    // #prd tag → auto-create Kanban card in Backlog
                    if note.tags.iter().any(|t| normalize_tag(t) == "prd") {
                        auto_create_prd_card(&state.db, &user.id, note_id, &note.title).await;
                    }

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

/// POST /api/conversations/:id/notes/:noteId/archive
async fn archive_note(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, note_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    // Check permission
    let note = sqlx::query_as::<_, (String, String, Option<Uuid>)>(
        "SELECT creator_id, creator_type, agent_id FROM conversation_notes WHERE id = $1 AND conversation_id = $2",
    )
    .bind(note_id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    let (cid, ctype, aid) = match note {
        Ok(Some(n)) => n,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    if !can_edit_note(&state.db, &user.id, &cid, &ctype, aid).await
        && !is_moderator(&state.db, conv_id, &user.id).await
    {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not authorized"}))).into_response();
    }

    let result = sqlx::query(
        "UPDATE conversation_notes SET archived_at = NOW() WHERE id = $1 AND conversation_id = $2 AND archived_at IS NULL",
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
                &json!({ "type": "note:archived", "conversationId": conv_id.to_string(), "noteId": note_id.to_string() }),
                &state.redis,
            );
            Json(json!({"archived": true})).into_response()
        }
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found or already archived"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// POST /api/conversations/:id/notes/:noteId/unarchive
async fn unarchive_note(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, note_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    let note = sqlx::query_as::<_, (String, String, Option<Uuid>)>(
        "SELECT creator_id, creator_type, agent_id FROM conversation_notes WHERE id = $1 AND conversation_id = $2",
    )
    .bind(note_id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    let (cid, ctype, aid) = match note {
        Ok(Some(n)) => n,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    if !can_edit_note(&state.db, &user.id, &cid, &ctype, aid).await
        && !is_moderator(&state.db, conv_id, &user.id).await
    {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not authorized"}))).into_response();
    }

    let result = sqlx::query(
        "UPDATE conversation_notes SET archived_at = NULL WHERE id = $1 AND conversation_id = $2 AND archived_at IS NOT NULL",
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
                &json!({ "type": "note:unarchived", "conversationId": conv_id.to_string(), "noteId": note_id.to_string() }),
                &state.redis,
            );
            Json(json!({"archived": false})).into_response()
        }
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found or not archived"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// POST /api/conversations/:id/notes/:noteId/share
async fn share_note(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, note_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    // Fetch the note
    let note = sqlx::query_as::<_, (String, String, Vec<String>)>(
        "SELECT title, content, tags FROM conversation_notes WHERE id = $1 AND conversation_id = $2",
    )
    .bind(note_id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    let (title, content, tags) = match note {
        Ok(Some(n)) => n,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    let preview = if content.len() > 100 { format!("{}...", &content[..content.char_indices().nth(100).map(|(i, _)| i).unwrap_or(content.len())]) } else { content.clone() };
    let metadata = json!({
        "noteId": note_id,
        "title": title,
        "preview": preview,
        "tags": tags,
    });

    // Insert a system message with note_share type via metadata
    let msg_id = Uuid::new_v4();
    let result = sqlx::query(
        r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_user_id, metadata, created_at, updated_at)
           VALUES ($1, $2, 0, 'system', $3, 'completed', $4, $5, NOW(), NOW())"#,
    )
    .bind(msg_id)
    .bind(conv_id)
    .bind(format!("shared a note: {}", title))
    .bind(&user.id)
    .bind(metadata.clone())
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            // Broadcast to conversation members
            let member_ids = get_conv_member_ids(&state.db, conv_id).await;
            state.ws.broadcast_to_members(
                &member_ids,
                &json!({
                    "type": "new_message",
                    "conversationId": conv_id.to_string(),
                    "message": {
                        "id": msg_id.to_string(),
                        "conversationId": conv_id.to_string(),
                        "seq": 0,
                        "role": "system",
                        "content": format!("shared a note: {}", title),
                        "status": "completed",
                        "senderUserId": &user.id,
                        "metadata": metadata,
                        "createdAt": Utc::now().to_rfc3339(),
                        "updatedAt": Utc::now().to_rfc3339(),
                    },
                }),
                &state.redis,
            );

            Json(json!({
                "messageId": msg_id,
                "noteId": note_id,
                "title": title,
                "preview": preview,
                "tags": tags,
            }))
            .into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}
