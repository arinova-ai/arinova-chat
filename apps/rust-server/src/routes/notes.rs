use axum::{
    extract::{Multipart, Path, Query, State},
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
use crate::ws::handler::trigger_agent_response;
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
        .route(
            "/api/conversations/{id}/notes/{noteId}/ask-ai",
            post(ask_ai),
        )
        .route(
            "/api/conversations/{id}/notes/{noteId}/auto-tag",
            post(auto_tag_note),
        )
        // User-level note endpoints
        .route("/api/users/me/notes", get(list_user_notes))
        .route(
            "/api/notes/{noteId}/links",
            post(link_note_to_conversation),
        )
        .route(
            "/api/notes/{noteId}/links/{conversationId}",
            delete(unlink_note_from_conversation),
        )
        .route(
            "/api/notes/{noteId}/public-share",
            post(create_public_share).delete(revoke_public_share),
        )
        .route("/api/public/notes/{shareToken}", get(get_public_note))
        .route(
            "/api/notes/{noteId}/share-to/{conversationId}",
            post(share_note_to_conversation),
        )
        .route(
            "/api/conversations/{id}/notes/upload",
            post(upload_note_image),
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
    summary: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    creator_name: String,
    agent_name: Option<String>,
    share_token: Option<String>,
    is_public: bool,
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
        "summary": n.summary,
        "archivedAt": n.archived_at.map(|t| t.to_rfc3339()),
        "createdAt": n.created_at.to_rfc3339(),
        "updatedAt": n.updated_at.to_rfc3339(),
        "shareToken": n.share_token,
        "isPublic": n.is_public,
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
           n.title, n.content, n.tags, n.archived_at, n.summary,
           n.created_at, n.updated_at,
           COALESCE(CASE WHEN n.creator_type = 'agent' THEN a.name END, u.name, 'Unknown') AS creator_name,
           a.name AS agent_name,
           n.share_token, COALESCE(n.is_public, false) AS is_public
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
        "{} JOIN note_conversation_links ncl ON ncl.note_id = n.id WHERE n.id = $1 AND ncl.conversation_id = $2",
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
            let related_capsules = get_related_capsules(&state.db, &user.id, &note.content).await;
            j.as_object_mut().unwrap().insert("backlinks".into(), json!(backlinks));
            j.as_object_mut().unwrap().insert("linkedCards".into(), json!(linked_cards));
            j.as_object_mut().unwrap().insert("relatedCapsules".into(), json!(related_capsules));
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
            "{} JOIN note_conversation_links ncl ON ncl.note_id = n.id WHERE ncl.conversation_id = $1 AND {} {} AND n.created_at < $2 ORDER BY n.created_at DESC LIMIT $3",
            NOTE_QUERY_BASE, archive_cond, tag_cond
        ))
        .bind(conv_id)
        .bind(ts)
        .bind(limit + 1)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as::<_, NoteRow>(&format!(
            "{} JOIN note_conversation_links ncl ON ncl.note_id = n.id WHERE ncl.conversation_id = $1 AND {} {} ORDER BY n.created_at DESC LIMIT $2",
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
        r#"INSERT INTO conversation_notes (id, conversation_id, creator_id, creator_type, owner_id, title, content, tags, created_at, updated_at)
           VALUES ($1, $2, $3, 'user', $3, $4, $5, $6, $7, $7)"#,
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
            // Insert note_conversation_links entry
            let _ = sqlx::query(
                "INSERT INTO note_conversation_links (note_id, conversation_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            )
            .bind(note_id)
            .bind(conv_id)
            .execute(&state.db)
            .await;

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

            // Auto-summary (background, Task 2)
            if let Some(ref gk) = state.config.gemini_api_key {
                spawn_summary_if_needed(state.db.clone(), gk.clone(), note_id, body.content.clone());
            }

            // AI tag suggestions (Task 4)
            let mut resp = note_json;
            if let Some(ref gk) = state.config.gemini_api_key {
                let suggested = suggest_tags(gk, title, &body.content).await;
                if !suggested.is_empty() {
                    resp.as_object_mut().unwrap().insert("suggestedTags".into(), json!(suggested));
                }
            }

            (StatusCode::CREATED, Json(resp)).into_response()
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
    is_pinned: Option<bool>,
    notebook_id: Option<String>,
}

/// PATCH /api/conversations/:id/notes/:noteId
async fn update_note(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, note_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateNoteBody>,
) -> Response {
    if body.title.is_none() && body.content.is_none() && body.tags.is_none() && body.is_pinned.is_none() && body.notebook_id.is_none() {
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
        is_pinned: Option<bool>,
        notebook_id: Option<Option<Uuid>>,
    }
    let mut dyn_params = DynParam {
        title: body.title.as_ref().map(|t| t.trim().to_string()),
        content: body.content.clone(),
        tags: body.tags.as_ref().map(|t| t.iter().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect()),
        is_pinned: body.is_pinned,
        notebook_id: None,
    };

    // Validate notebook_id: empty string → clear (None), valid UUID → Some, invalid → 400
    if let Some(ref nb_str) = body.notebook_id {
        if nb_str.is_empty() {
            dyn_params.notebook_id = Some(None);
        } else {
            match Uuid::parse_str(nb_str) {
                Ok(nb_id) => {
                    // Verify notebook ownership
                    let nb_owner: Option<(String,)> = sqlx::query_as(
                        "SELECT owner_id FROM notebooks WHERE id = $1",
                    )
                    .bind(nb_id)
                    .fetch_optional(&state.db)
                    .await
                    .unwrap_or(None);
                    match nb_owner {
                        Some((oid,)) if oid == user.id => {
                            dyn_params.notebook_id = Some(Some(nb_id));
                        }
                        Some(_) => {
                            return (
                                StatusCode::FORBIDDEN,
                                Json(json!({"error": "Notebook does not belong to you"})),
                            )
                                .into_response();
                        }
                        None => {
                            return (
                                StatusCode::NOT_FOUND,
                                Json(json!({"error": "Notebook not found"})),
                            )
                                .into_response();
                        }
                    }
                }
                Err(_) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({"error": "Invalid notebookId"})),
                    )
                        .into_response();
                }
            }
        }
    }

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
    if dyn_params.is_pinned.is_some() {
        set_clauses.push(format!("is_pinned = ${param_idx}"));
        param_idx += 1;
    }
    if dyn_params.notebook_id.is_some() {
        set_clauses.push(format!("notebook_id = ${param_idx}"));
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
    if let Some(is_pinned) = dyn_params.is_pinned { q = q.bind(is_pinned); }
    if let Some(ref notebook_id) = dyn_params.notebook_id { q = q.bind(*notebook_id); }
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

                    // Re-generate or clear summary if content was updated (Task 2)
                    if dyn_params.content.is_some() {
                        if note.content.len() < 500 {
                            // Content too short — clear stale summary
                            let _ = sqlx::query("UPDATE conversation_notes SET summary = NULL WHERE id = $1")
                                .bind(note_id)
                                .execute(&state.db)
                                .await;
                        } else if let Some(ref gk) = state.config.gemini_api_key {
                            spawn_summary_if_needed(state.db.clone(), gk.clone(), note_id, note.content.clone());
                        }
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
    let note = sqlx::query_as::<_, (String, String, Vec<String>, Option<String>)>(
        "SELECT title, content, tags, summary FROM conversation_notes WHERE id = $1 AND conversation_id = $2",
    )
    .bind(note_id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    let (title, content, tags, summary) = match note {
        Ok(Some(n)) => n,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    let preview = summary.unwrap_or_else(|| {
        if content.len() > 100 { format!("{}...", &content[..content.char_indices().nth(100).map(|(i, _)| i).unwrap_or(content.len())]) } else { content.clone() }
    });
    let metadata = json!({
        "noteId": note_id,
        "title": title,
        "preview": preview,
        "tags": tags,
    });

    // Build full note message content for agent consumption
    let tags_str = if tags.is_empty() { String::new() } else { format!("\n\nTags: {}", tags.join(", ")) };
    let msg_content = format!("用戶分享了一篇筆記：{}\n\n{}{}", title, content, tags_str);

    // Insert a user message with note_share metadata
    let msg_id = Uuid::new_v4();
    let result = sqlx::query(
        r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_user_id, metadata, created_at, updated_at)
           VALUES ($1, $2, 0, 'user', $3, 'completed', $4, $5, NOW(), NOW())"#,
    )
    .bind(msg_id)
    .bind(conv_id)
    .bind(&msg_content)
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
                        "role": "user",
                        "content": &msg_content,
                        "status": "completed",
                        "senderUserId": &user.id,
                        "metadata": metadata,
                        "createdAt": Utc::now().to_rfc3339(),
                        "updatedAt": Utc::now().to_rfc3339(),
                    },
                }),
                &state.redis,
            );

            // Trigger agent dispatch so agent can see and respond to the shared note
            let conv_id_str = conv_id.to_string();
            let state_clone = state.clone();
            let user_id = user.id.clone();
            let msg_content_clone = msg_content.clone();
            tokio::spawn(async move {
                trigger_agent_response(
                    &user_id,
                    &conv_id_str,
                    &msg_content_clone,
                    true, // skip_user_message — already saved above
                    None,
                    None,
                    &[],
                    None,
                    &state_clone.ws,
                    &state_clone.db,
                    &state_clone.redis,
                    &state_clone.config,
                )
                .await;
            });

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

/// POST /api/notes/:noteId/share-to/:conversationId — share note as Rich Card to another conversation
async fn share_note_to_conversation(
    State(state): State<AppState>,
    user: AuthUser,
    Path((note_id, target_conv_id)): Path<(Uuid, Uuid)>,
) -> Response {
    // Verify user owns the note OR is a member of a conversation it's linked to
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM conversation_notes WHERE id = $1 AND owner_id IS NOT NULL",
    )
    .bind(note_id)
    .fetch_optional(&state.db)
    .await;

    match &owner {
        Ok(Some(oid)) if oid == &user.id => {}
        _ => {
            // Fallback: check if user is a member of any linked conversation
            let linked = sqlx::query_scalar::<_, i64>(
                r#"SELECT COUNT(*) FROM note_conversation_links ncl
                   JOIN conversation_user_members cum ON cum.conversation_id = ncl.conversation_id AND cum.user_id = $1
                   WHERE ncl.note_id = $2"#,
            )
            .bind(&user.id)
            .bind(note_id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);
            if linked == 0 {
                return (StatusCode::FORBIDDEN, Json(json!({"error": "Not authorized to share this note"}))).into_response();
            }
        }
    }

    // Verify user is a member of the target conversation
    if !is_member(&state.db, target_conv_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member of target conversation"}))).into_response();
    }

    // Fetch the note
    let note = sqlx::query_as::<_, (String, String, Vec<String>, Option<String>)>(
        "SELECT title, content, tags, summary FROM conversation_notes WHERE id = $1",
    )
    .bind(note_id)
    .fetch_optional(&state.db)
    .await;

    let (title, content, tags, summary) = match note {
        Ok(Some(n)) => n,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    let preview = summary.unwrap_or_else(|| {
        if content.len() > 100 {
            format!("{}...", &content[..content.char_indices().nth(100).map(|(i, _)| i).unwrap_or(content.len())])
        } else {
            content.clone()
        }
    });
    let metadata = json!({
        "noteId": note_id,
        "title": title,
        "preview": preview,
        "tags": tags,
    });

    // Build full note message content for agent consumption
    let tags_str = if tags.is_empty() { String::new() } else { format!("\n\nTags: {}", tags.join(", ")) };
    let msg_content = format!("用戶分享了一篇筆記：{}\n\n{}{}", title, content, tags_str);

    // Insert a user message with note_share metadata
    let msg_id = Uuid::new_v4();
    let result = sqlx::query(
        r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_user_id, metadata, created_at, updated_at)
           VALUES ($1, $2, 0, 'user', $3, 'completed', $4, $5, NOW(), NOW())"#,
    )
    .bind(msg_id)
    .bind(target_conv_id)
    .bind(&msg_content)
    .bind(&user.id)
    .bind(metadata.clone())
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            let member_ids = get_conv_member_ids(&state.db, target_conv_id).await;
            state.ws.broadcast_to_members(
                &member_ids,
                &json!({
                    "type": "new_message",
                    "conversationId": target_conv_id.to_string(),
                    "message": {
                        "id": msg_id.to_string(),
                        "conversationId": target_conv_id.to_string(),
                        "seq": 0,
                        "role": "user",
                        "content": &msg_content,
                        "status": "completed",
                        "senderUserId": &user.id,
                        "metadata": metadata,
                        "createdAt": Utc::now().to_rfc3339(),
                        "updatedAt": Utc::now().to_rfc3339(),
                    },
                }),
                &state.redis,
            );

            // Trigger agent dispatch so agent can see and respond to the shared note
            let conv_id_str = target_conv_id.to_string();
            let state_clone = state.clone();
            let user_id = user.id.clone();
            let msg_content_clone = msg_content.clone();
            tokio::spawn(async move {
                trigger_agent_response(
                    &user_id,
                    &conv_id_str,
                    &msg_content_clone,
                    true, // skip_user_message — already saved above
                    None,
                    None,
                    &[],
                    None,
                    &state_clone.ws,
                    &state_clone.db,
                    &state_clone.redis,
                    &state_clone.config,
                )
                .await;
            });

            Json(json!({
                "messageId": msg_id,
                "noteId": note_id,
                "conversationId": target_conv_id,
                "title": title,
                "preview": preview,
                "tags": tags,
            }))
            .into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ===== Gemini helper =====

const GEMINI_URL: &str =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

#[derive(Deserialize)]
struct GeminiResp {
    candidates: Option<Vec<GeminiCandidate>>,
}
#[derive(Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiContentPart>,
}
#[derive(Deserialize)]
struct GeminiContentPart {
    parts: Option<Vec<GeminiPart>>,
}
#[derive(Deserialize)]
struct GeminiPart {
    text: Option<String>,
}

/// Shared reqwest client with 30s timeout for all Gemini calls.
fn gemini_client() -> &'static reqwest::Client {
    use std::sync::OnceLock;
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("Failed to build reqwest client")
    })
}

/// Call Gemini 2.0 Flash with a system instruction and user prompt.
/// API key sent via header (x-goog-api-key), never in URL.
/// Errors logged server-side; only generic message returned to caller.
async fn call_gemini(
    api_key: &str,
    system: &str,
    user_prompt: &str,
    max_tokens: u32,
) -> Result<String, String> {
    let body = json!({
        "systemInstruction": {
            "parts": [{ "text": system }]
        },
        "contents": [{
            "role": "user",
            "parts": [{ "text": user_prompt }]
        }],
        "generationConfig": {
            "maxOutputTokens": max_tokens
        }
    });

    let resp = gemini_client()
        .post(GEMINI_URL)
        .header("x-goog-api-key", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            tracing::error!("Gemini request failed: {}", e);
            "AI service error".to_string()
        })?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        tracing::error!("Gemini API error {}: {}", status, text);
        return Err("AI service error".to_string());
    }

    let parsed: GeminiResp = resp.json().await.map_err(|e| {
        tracing::error!("Gemini response parse error: {}", e);
        "AI service error".to_string()
    })?;
    let text = parsed
        .candidates
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.content)
        .and_then(|c| c.parts)
        .map(|parts| parts.into_iter().filter_map(|p| p.text).collect::<Vec<_>>().join("\n"))
        .unwrap_or_default();

    Ok(text)
}

/// Per-user rate limit check via Redis. Returns Ok(()) if allowed, Err(Response) if rate limited.
async fn check_ai_rate_limit(redis: &deadpool_redis::Pool, user_id: &str) -> Result<(), Response> {
    use deadpool_redis::redis::AsyncCommands;
    let key = format!("ai_ratelimit:{}:{}", user_id, chrono::Utc::now().format("%Y%m%d%H%M"));
    let mut conn = match redis.get().await {
        Ok(c) => c,
        Err(_) => return Ok(()), // fail open if Redis unavailable
    };
    let count: i64 = conn.incr(&key, 1i64).await.unwrap_or(1);
    if count == 1 {
        let _: Result<(), _> = conn.expire(&key, 60).await;
    }
    if count > 10 {
        return Err((StatusCode::TOO_MANY_REQUESTS, Json(json!({"error": "Rate limit exceeded. Max 10 AI requests per minute."}))).into_response());
    }
    Ok(())
}

// ===== Task 1: Ask AI =====

#[derive(Deserialize)]
struct AskAiBody {
    question: String,
}

/// POST /api/conversations/:id/notes/:noteId/ask-ai
async fn ask_ai(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, note_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<AskAiBody>,
) -> Response {
    let question = body.question.trim();
    if question.is_empty() || question.len() > 2000 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Question is required (max 2000 chars)"}))).into_response();
    }

    if !is_member(&state.db, conv_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    // Use user's own Gemini API key
    let gemini_key = match sqlx::query_scalar::<_, Option<String>>(
        "SELECT gemini_api_key FROM user_settings WHERE user_id = $1",
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await
    {
        Ok(Some(Some(k))) if !k.is_empty() => crate::routes::user_settings::decrypt_api_key(&state.config, &k),
        _ => return (StatusCode::PAYMENT_REQUIRED, Json(json!({"error": "Please set your Gemini API key in Settings to use Ask AI."}))).into_response(),
    };

    if let Err(resp) = check_ai_rate_limit(&state.redis, &user.id).await {
        return resp;
    }

    let note = sqlx::query_as::<_, (String, String)>(
        "SELECT title, content FROM conversation_notes WHERE id = $1 AND conversation_id = $2",
    )
    .bind(note_id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    let (title, content) = match note {
        Ok(Some(n)) => n,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    let system = "You are a helpful AI assistant. The user will provide a note and ask a question about it. \
                  Answer concisely based on the note content. If the answer is not in the note, say so.";
    let prompt = format!("# Note: {}\n\n{}\n\n---\nQuestion: {}", title, content, question);

    match call_gemini(&gemini_key, system, &prompt, 1024).await {
        Ok(answer) => Json(json!({ "answer": answer })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e}))).into_response(),
    }
}

// ===== Task 2: Auto-summary helper =====

/// Generate a summary for note content and store it. Runs as a background task.
pub fn spawn_summary_if_needed(db: PgPool, gemini_key: String, note_id: Uuid, content: String) {
    if content.len() < 500 {
        return;
    }
    tokio::spawn(async move {
        let system = "Summarize the following note in 1-2 concise sentences. Output only the summary, nothing else.";
        match call_gemini(&gemini_key, system, &content, 256).await {
            Ok(summary) => {
                let _ = sqlx::query("UPDATE conversation_notes SET summary = $1 WHERE id = $2")
                    .bind(summary.trim())
                    .bind(note_id)
                    .execute(&db)
                    .await;
            }
            Err(e) => {
                tracing::warn!("Summary generation failed for note {}: {}", note_id, e);
            }
        }
    });
}

// ===== Task 3: Extract capsule from note =====

/// POST /api/conversations/:id/notes/:noteId/extract-capsule
async fn extract_capsule_from_note(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, note_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    let gemini_key = match &state.config.gemini_api_key {
        Some(k) => k.clone(),
        None => return (StatusCode::NOT_IMPLEMENTED, Json(json!({"error": "AI features not configured"}))).into_response(),
    };

    if let Err(resp) = check_ai_rate_limit(&state.redis, &user.id).await {
        return resp;
    }

    let note = sqlx::query_as::<_, (String, String)>(
        "SELECT title, content FROM conversation_notes WHERE id = $1 AND conversation_id = $2",
    )
    .bind(note_id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    let (title, content) = match note {
        Ok(Some(n)) => n,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    if content.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Note has no content to extract from"}))).into_response();
    }

    let system = "Extract key facts, preferences, decisions, and action items from this note. \
                  Output each memory as a separate line. Be concise — each line should be one self-contained fact or item.";
    let prompt = format!("# {}\n\n{}", title, content);

    let entries = match call_gemini(&gemini_key, system, &prompt, 1024).await {
        Ok(text) => text.lines().map(|l| l.trim().to_string()).filter(|l| !l.is_empty()).collect::<Vec<_>>(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e}))).into_response(),
    };

    // Find or create a capsule for this conversation
    let capsule_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM memory_capsules WHERE owner_id = $1 AND source_conversation_id = $2 AND status = 'ready' LIMIT 1",
    )
    .bind(&user.id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    let capsule_id = match capsule_id {
        Some(id) => id,
        None => {
            match sqlx::query_scalar::<_, Uuid>(
                "INSERT INTO memory_capsules (owner_id, name, source_conversation_id, status) VALUES ($1, $2, $3, 'ready') RETURNING id",
            )
            .bind(&user.id)
            .bind(format!("Note: {}", title))
            .bind(conv_id)
            .fetch_one(&state.db)
            .await
            {
                Ok(id) => id,
                Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
            }
        }
    };

    let mut inserted = 0u32;
    for entry in &entries {
        if sqlx::query(
            "INSERT INTO memory_entries (capsule_id, content, importance) VALUES ($1, $2, 0.7)",
        )
        .bind(capsule_id)
        .bind(entry)
        .execute(&state.db)
        .await
        .is_ok()
        {
            inserted += 1;
        }
    }

    let _ = sqlx::query("UPDATE memory_capsules SET entry_count = (SELECT COUNT(*) FROM memory_entries WHERE capsule_id = $1) WHERE id = $1")
        .bind(capsule_id)
        .execute(&state.db)
        .await;

    Json(json!({
        "capsuleId": capsule_id,
        "entriesCreated": inserted,
        "entries": entries,
    }))
    .into_response()
}

/// Get related memory capsule entries for a note.
pub async fn get_related_capsules(db: &PgPool, user_id: &str, content: &str) -> Vec<serde_json::Value> {
    if content.trim().len() < 20 {
        return vec![];
    }
    let query_text = &content[..content.len().min(200)];
    let tsquery = query_text
        .split_whitespace()
        .take(8)
        .map(|w| w.replace('\'', ""))
        .filter(|w| w.len() > 2)
        .collect::<Vec<_>>()
        .join(" | ");

    if tsquery.is_empty() {
        return vec![];
    }

    let rows: Vec<(Uuid, String, f64, Uuid, String, Option<DateTime<Utc>>, Option<DateTime<Utc>>)> = sqlx::query_as(
        r#"SELECT me.id, me.content, me.importance, mc.id AS capsule_id, mc.name AS capsule_name,
                  me.source_start, me.source_end
           FROM memory_entries me
           JOIN memory_capsules mc ON mc.id = me.capsule_id
           WHERE mc.owner_id = $1
             AND me.search_vector @@ to_tsquery('english', $2)
           ORDER BY ts_rank(me.search_vector, to_tsquery('english', $2)) DESC
           LIMIT 5"#,
    )
    .bind(user_id)
    .bind(&tsquery)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    rows.iter()
        .map(|(id, content, importance, capsule_id, capsule_name, source_start, source_end)| {
            json!({
                "id": id,
                "content": content,
                "importance": importance,
                "capsuleId": capsule_id,
                "capsuleName": capsule_name,
                "sourceStart": source_start.map(|t| t.to_rfc3339()),
                "sourceEnd": source_end.map(|t| t.to_rfc3339()),
            })
        })
        .collect()
}

// ===== Task 4: AI tag suggestions =====

/// Generate tag suggestions for note content using AI.
pub async fn suggest_tags(gemini_key: &str, title: &str, content: &str) -> Vec<String> {
    if content.trim().len() < 20 && title.trim().len() < 5 {
        return vec![];
    }
    let system = "Based on the note title and content, suggest 2-3 short tags (single words, lowercase, no #). \
                  Output only the tags separated by commas. Example: feature, urgent, design";
    let prompt = format!("Title: {}\n\nContent: {}", title, &content[..content.len().min(1000)]);

    match call_gemini(gemini_key, system, &prompt, 64).await {
        Ok(text) => text
            .split(',')
            .map(|t| t.trim().to_lowercase().replace('#', ""))
            .filter(|t| !t.is_empty() && t.len() <= 30)
            .take(3)
            .collect(),
        Err(_) => vec![],
    }
}

// ===== Auto Tag from Related Memories =====

/// POST /api/conversations/:id/notes/:noteId/auto-tag
/// Uses note content to find related memory entries, collects their tags, deduplicates,
/// and updates the note's tags. No API key needed — pure DB query.
async fn auto_tag_note(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, note_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    let note = sqlx::query_as::<_, (String, String, Vec<String>)>(
        "SELECT title, content, tags FROM conversation_notes WHERE id = $1 AND conversation_id = $2",
    )
    .bind(note_id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    let (title, content, existing_tags) = match note {
        Ok(Some(n)) => n,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    if content.trim().len() < 20 && title.trim().len() < 5 {
        return Json(json!({"tags": existing_tags})).into_response();
    }

    // Build tsquery from note content
    let query_text = format!("{} {}", title, &content[..content.len().min(200)]);
    let tsquery = query_text
        .split_whitespace()
        .take(8)
        .map(|w| w.replace('\'', ""))
        .filter(|w| w.len() > 2)
        .collect::<Vec<_>>()
        .join(" | ");

    if tsquery.is_empty() {
        return Json(json!({"tags": existing_tags})).into_response();
    }

    // Find related memory entries and collect their tags
    let memory_tags: Vec<Vec<String>> = sqlx::query_scalar(
        r#"SELECT me.tags
           FROM memory_entries me
           JOIN memory_capsules mc ON mc.id = me.capsule_id
           WHERE mc.owner_id = $1
             AND me.search_vector @@ to_tsquery('english', $2)
             AND array_length(me.tags, 1) > 0
           ORDER BY ts_rank(me.search_vector, to_tsquery('english', $2)) DESC
           LIMIT 10"#,
    )
    .bind(&user.id)
    .bind(&tsquery)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Collect and deduplicate tags
    let mut tag_set: std::collections::HashSet<String> = existing_tags.iter().cloned().collect();
    for tags in &memory_tags {
        for tag in tags {
            tag_set.insert(tag.clone());
        }
    }

    let mut merged_tags: Vec<String> = tag_set.into_iter().collect();
    merged_tags.sort_unstable();

    // Update note tags
    let _ = sqlx::query(
        "UPDATE conversation_notes SET tags = $1, updated_at = NOW() WHERE id = $2",
    )
    .bind(&merged_tags)
    .bind(note_id)
    .execute(&state.db)
    .await;

    Json(json!({"tags": merged_tags})).into_response()
}

// ===== User-level note endpoints =====

#[derive(Deserialize)]
struct ListUserNotesQuery {
    before: Option<String>,
    limit: Option<String>,
    archived: Option<String>,
    tags: Option<String>,
    search: Option<String>,
}

/// GET /api/users/me/notes — list all notes owned by the authenticated user (across conversations)
async fn list_user_notes(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<ListUserNotesQuery>,
) -> Response {
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
        .map(|t| {
            t.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default();

    let search_term = query.search.as_deref().unwrap_or("").trim().to_string();

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

    let archive_cond = if show_archived {
        "n.archived_at IS NOT NULL"
    } else {
        "n.archived_at IS NULL"
    };

    // Build search pattern for ILIKE
    let search_pattern = if search_term.is_empty() {
        None
    } else {
        Some(format!("%{}%", search_term))
    };

    // Build query dynamically with correct parameter numbering
    // $1 = user.id, then optional params follow in order
    let mut conditions = format!("n.owner_id = $1 AND {}", archive_cond);
    let mut param_idx = 2u32;

    let tag_param = if !tag_filter.is_empty() {
        let p = param_idx;
        param_idx += 1;
        conditions.push_str(&format!(" AND n.tags @> ${}::text[]", p));
        Some(p)
    } else {
        None
    };

    let cursor_param = if cursor_ts.is_some() {
        let p = param_idx;
        param_idx += 1;
        Some(p)
    } else {
        None
    };

    let search_param = if search_pattern.is_some() {
        let p = param_idx;
        param_idx += 1;
        Some(p)
    } else {
        None
    };

    let limit_param = param_idx;

    if let Some(p) = cursor_param {
        conditions.push_str(&format!(" AND n.created_at < ${}", p));
    }
    if let Some(p) = search_param {
        conditions.push_str(&format!(
            " AND (n.title ILIKE ${p} OR n.content ILIKE ${p})"
        ));
    }

    let q = format!(
        r#"SELECT n.id, n.conversation_id, n.creator_id, n.creator_type, n.agent_id,
                  n.title, n.content, n.tags, n.archived_at, n.summary,
                  n.created_at, n.updated_at,
                  COALESCE(CASE WHEN n.creator_type = 'agent' THEN a.name END, u.name, 'Unknown') AS creator_name,
                  a.name AS agent_name,
                  n.share_token, COALESCE(n.is_public, false) AS is_public
           FROM conversation_notes n
           LEFT JOIN "user" u ON u.id = n.creator_id
           LEFT JOIN agents a ON a.id = n.agent_id
           WHERE {}
           ORDER BY n.created_at DESC LIMIT ${}"#,
        conditions, limit_param
    );

    // Bind all parameters dynamically using sqlx::query + manual row mapping
    // Since sqlx doesn't support conditional binding easily, use explicit match arms
    // for the 8 possible combinations of (tags, cursor, search)
    let rows = match (tag_param.is_some(), cursor_ts, &search_pattern) {
        (true, Some(ts), Some(sp)) => {
            sqlx::query_as::<_, NoteRow>(&q)
                .bind(&user.id)
                .bind(&tag_filter)
                .bind(ts)
                .bind(sp)
                .bind(limit + 1)
                .fetch_all(&state.db)
                .await
        }
        (true, Some(ts), None) => {
            sqlx::query_as::<_, NoteRow>(&q)
                .bind(&user.id)
                .bind(&tag_filter)
                .bind(ts)
                .bind(limit + 1)
                .fetch_all(&state.db)
                .await
        }
        (true, None, Some(sp)) => {
            sqlx::query_as::<_, NoteRow>(&q)
                .bind(&user.id)
                .bind(&tag_filter)
                .bind(sp)
                .bind(limit + 1)
                .fetch_all(&state.db)
                .await
        }
        (true, None, None) => {
            sqlx::query_as::<_, NoteRow>(&q)
                .bind(&user.id)
                .bind(&tag_filter)
                .bind(limit + 1)
                .fetch_all(&state.db)
                .await
        }
        (false, Some(ts), Some(sp)) => {
            sqlx::query_as::<_, NoteRow>(&q)
                .bind(&user.id)
                .bind(ts)
                .bind(sp)
                .bind(limit + 1)
                .fetch_all(&state.db)
                .await
        }
        (false, Some(ts), None) => {
            sqlx::query_as::<_, NoteRow>(&q)
                .bind(&user.id)
                .bind(ts)
                .bind(limit + 1)
                .fetch_all(&state.db)
                .await
        }
        (false, None, Some(sp)) => {
            sqlx::query_as::<_, NoteRow>(&q)
                .bind(&user.id)
                .bind(sp)
                .bind(limit + 1)
                .fetch_all(&state.db)
                .await
        }
        (false, None, None) => {
            sqlx::query_as::<_, NoteRow>(&q)
                .bind(&user.id)
                .bind(limit + 1)
                .fetch_all(&state.db)
                .await
        }
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

            // Fetch linked conversations for these notes
            let note_ids: Vec<Uuid> = rows.iter().take(limit as usize).map(|n| n.id).collect();
            let linked_convs = if !note_ids.is_empty() {
                sqlx::query_as::<_, (Uuid, Uuid, String)>(
                    r#"SELECT ncl.note_id, ncl.conversation_id,
                              COALESCE(c.title, 'Untitled') AS conv_title
                       FROM note_conversation_links ncl
                       LEFT JOIN conversations c ON c.id = ncl.conversation_id
                       WHERE ncl.note_id = ANY($1)"#,
                )
                .bind(&note_ids)
                .fetch_all(&state.db)
                .await
                .unwrap_or_default()
            } else {
                vec![]
            };

            // Build a map: note_id -> linked conversations
            let mut conv_map: std::collections::HashMap<Uuid, Vec<serde_json::Value>> =
                std::collections::HashMap::new();
            for (note_id, conv_id, conv_title) in &linked_convs {
                conv_map.entry(*note_id).or_default().push(json!({
                    "conversationId": conv_id,
                    "title": conv_title,
                }));
            }

            // Enrich items with linkedConversations
            let enriched_items: Vec<serde_json::Value> = items
                .into_iter()
                .map(|mut item| {
                    if let Some(id_str) = item.get("id").and_then(|v| v.as_str()) {
                        if let Ok(nid) = Uuid::parse_str(id_str) {
                            item.as_object_mut().unwrap().insert(
                                "linkedConversations".into(),
                                json!(conv_map.get(&nid).cloned().unwrap_or_default()),
                            );
                        }
                    }
                    item
                })
                .collect();

            Json(json!({
                "notes": enriched_items,
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
struct LinkNoteBody {
    #[serde(rename = "conversationId")]
    conversation_id: Uuid,
}

/// POST /api/notes/:noteId/links — link a note to a conversation
async fn link_note_to_conversation(
    State(state): State<AppState>,
    user: AuthUser,
    Path(note_id): Path<Uuid>,
    Json(body): Json<LinkNoteBody>,
) -> Response {
    // Verify the user owns this note
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM conversation_notes WHERE id = $1 AND owner_id IS NOT NULL",
    )
    .bind(note_id)
    .fetch_optional(&state.db)
    .await;

    match owner {
        Ok(Some(oid)) if oid == user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "You do not own this note"})),
            )
                .into_response()
        }
        _ => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Note not found"})),
            )
                .into_response()
        }
    }

    // Verify user is a member of the target conversation
    if !is_member(&state.db, body.conversation_id, &user.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of the target conversation"})),
        )
            .into_response();
    }

    let result = sqlx::query(
        "INSERT INTO note_conversation_links (note_id, conversation_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(note_id)
    .bind(body.conversation_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// DELETE /api/notes/:noteId/links/:conversationId — unlink a note from a conversation
async fn unlink_note_from_conversation(
    State(state): State<AppState>,
    user: AuthUser,
    Path((note_id, conversation_id)): Path<(Uuid, Uuid)>,
) -> Response {
    // Verify the user owns this note
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM conversation_notes WHERE id = $1 AND owner_id IS NOT NULL",
    )
    .bind(note_id)
    .fetch_optional(&state.db)
    .await;

    match owner {
        Ok(Some(oid)) if oid == user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "You do not own this note"})),
            )
                .into_response()
        }
        _ => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Note not found"})),
            )
                .into_response()
        }
    }

    // Don't allow unlinking from the original conversation
    let original_conv = sqlx::query_scalar::<_, Uuid>(
        "SELECT conversation_id FROM conversation_notes WHERE id = $1",
    )
    .bind(note_id)
    .fetch_optional(&state.db)
    .await;

    if let Ok(Some(orig)) = original_conv {
        if orig == conversation_id {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Cannot unlink from the original conversation"})),
            )
                .into_response();
        }
    }

    let result = sqlx::query(
        "DELETE FROM note_conversation_links WHERE note_id = $1 AND conversation_id = $2",
    )
    .bind(note_id)
    .bind(conversation_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ===== Public sharing =====

/// POST /api/notes/:noteId/public-share — create a public share link
async fn create_public_share(
    State(state): State<AppState>,
    user: AuthUser,
    Path(note_id): Path<Uuid>,
) -> Response {
    // Verify user owns the note
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM conversation_notes WHERE id = $1 AND owner_id IS NOT NULL",
    )
    .bind(note_id)
    .fetch_optional(&state.db)
    .await;

    match &owner {
        Ok(Some(oid)) if oid == &user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "You do not own this note"})),
            )
                .into_response()
        }
        _ => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Note not found"})),
            )
                .into_response()
        }
    }

    // Generate a 32-char hex token
    let token = Uuid::new_v4().to_string().replace("-", "");

    let result = sqlx::query(
        "UPDATE conversation_notes SET share_token = $1, is_public = true WHERE id = $2 AND owner_id = $3",
    )
    .bind(&token)
    .bind(note_id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({
            "shareToken": token,
            "shareUrl": format!("/shared/notes/{}", token),
        }))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// DELETE /api/notes/:noteId/public-share — revoke public sharing
async fn revoke_public_share(
    State(state): State<AppState>,
    user: AuthUser,
    Path(note_id): Path<Uuid>,
) -> Response {
    // Verify user owns the note
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM conversation_notes WHERE id = $1 AND owner_id IS NOT NULL",
    )
    .bind(note_id)
    .fetch_optional(&state.db)
    .await;

    match &owner {
        Ok(Some(oid)) if oid == &user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "You do not own this note"})),
            )
                .into_response()
        }
        _ => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Note not found"})),
            )
                .into_response()
        }
    }

    let result = sqlx::query(
        "UPDATE conversation_notes SET share_token = NULL, is_public = false WHERE id = $1 AND owner_id = $2",
    )
    .bind(note_id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({"ok": true})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/public/notes/:shareToken — view a publicly shared note (no auth required)
async fn get_public_note(
    State(state): State<AppState>,
    Path(share_token): Path<String>,
) -> Response {
    #[derive(FromRow)]
    struct PublicNoteRow {
        title: String,
        content: String,
        tags: Vec<String>,
        creator_type: String,
        created_at: DateTime<Utc>,
        updated_at: DateTime<Utc>,
        creator_name: String,
    }

    let row = sqlx::query_as::<_, PublicNoteRow>(
        r#"SELECT n.title, n.content, n.tags, n.creator_type,
                  n.created_at, n.updated_at,
                  COALESCE(u.name, 'Unknown') AS creator_name
           FROM conversation_notes n
           LEFT JOIN "user" u ON u.id = n.creator_id
           WHERE n.share_token = $1 AND n.is_public = true"#,
    )
    .bind(&share_token)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(n)) => Json(json!({
            "title": n.title,
            "content": n.content,
            "tags": n.tags,
            "creatorType": n.creator_type,
            "creatorName": n.creator_name,
            "createdAt": n.created_at.to_rfc3339(),
            "updatedAt": n.updated_at.to_rfc3339(),
        }))
        .into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Note not found or not publicly shared"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// Upload an image for use in notes without creating a message.
async fn upload_note_image(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conversation_id): Path<Uuid>,
    mut multipart: Multipart,
) -> Response {
    if !is_member(&state.db, conversation_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() != Some("file") {
            continue;
        }

        let data = match field.bytes().await {
            Ok(d) => d,
            Err(_) => {
                return (StatusCode::BAD_REQUEST, Json(json!({"error": "Failed to read file"}))).into_response();
            }
        };

        if data.len() > 5 * 1024 * 1024 {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "Image must be under 5MB"}))).into_response();
        }

        let (ext, content_type) = if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
            ("png", "image/png")
        } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
            ("jpg", "image/jpeg")
        } else if data.starts_with(&[0x47, 0x49, 0x46]) {
            ("gif", "image/gif")
        } else if data.len() >= 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WEBP" {
            ("webp", "image/webp")
        } else {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "Only PNG, JPEG, GIF, and WebP images are allowed"}))).into_response();
        };

        let stored = format!(
            "note_{}_{}.{}",
            conversation_id,
            chrono::Utc::now().timestamp_millis(),
            ext
        );
        let r2_key = format!("notes/{}/{}", conversation_id, stored);

        let url = if let Some(s3) = &state.s3 {
            match crate::services::r2::upload_to_r2(
                s3,
                &state.config.r2_bucket,
                &r2_key,
                data.to_vec(),
                content_type,
                &state.config.r2_public_url,
            )
            .await
            {
                Ok(url) => url,
                Err(e) => {
                    tracing::warn!("upload_note_image: R2 upload failed, fallback to local: {}", e);
                    let dir = std::path::Path::new(&state.config.upload_dir).join("notes");
                    if let Err(e) = tokio::fs::create_dir_all(&dir).await {
                        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("mkdir: {}", e)}))).into_response();
                    }
                    if let Err(e) = tokio::fs::write(dir.join(&stored), &data).await {
                        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("write: {}", e)}))).into_response();
                    }
                    format!("/uploads/notes/{}", stored)
                }
            }
        } else {
            let dir = std::path::Path::new(&state.config.upload_dir).join("notes");
            if let Err(e) = tokio::fs::create_dir_all(&dir).await {
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("mkdir: {}", e)}))).into_response();
            }
            if let Err(e) = tokio::fs::write(dir.join(&stored), &data).await {
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("write: {}", e)}))).into_response();
            }
            format!("/uploads/notes/{}", stored)
        };

        return (StatusCode::OK, Json(json!({"url": url}))).into_response();
    }

    (StatusCode::BAD_REQUEST, Json(json!({"error": "No file uploaded"}))).into_response()
}
