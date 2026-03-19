use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, post},
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
        // Conversation-independent note CRUD
        .route("/api/notes", post(create_note_standalone))
        .route(
            "/api/notes/{noteId}",
            get(get_note_by_id).patch(update_note_standalone).delete(delete_note_standalone),
        )
        .route("/api/notes/{noteId}/archive", post(archive_note_standalone))
        .route("/api/notes/{noteId}/unarchive", post(unarchive_note_standalone))
        .route("/api/notes/{noteId}/auto-tag", post(auto_tag_note_standalone))
        .route("/api/notes/{noteId}/ask-ai", post(ask_ai_standalone))
        .route("/api/notes/{noteId}/related-memories", get(get_note_related_memories))
        .route("/api/notes/upload", post(upload_note_image_standalone))
        .route("/api/users/me/notes", get(list_user_notes))
        .route(
            "/api/notes/{noteId}/public-share",
            post(create_public_share).delete(revoke_public_share),
        )
        .route("/api/public/notes/{shareToken}", get(get_public_note))
        // Notebook preference per conversation
        .route(
            "/api/conversations/{id}/notebook-preference",
            get(get_notebook_preference).put(set_notebook_preference),
        )
        // Board preference per conversation
        .route(
            "/api/conversations/{id}/board-preference",
            get(get_board_preference).put(set_board_preference),
        )
}

// ===== Internal types =====

#[derive(Debug, FromRow)]
struct NoteRow {
    id: Uuid,
    conversation_id: Option<Uuid>,
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

/// Get all user IDs who should receive note WS events:
/// conversation members + notebook members (if the note has a notebook_id)
async fn get_note_broadcast_ids(db: &PgPool, conv_id: Uuid, notebook_id: Option<Uuid>) -> Vec<String> {
    let mut ids = get_conv_member_ids(db, conv_id).await;
    if let Some(nb_id) = notebook_id {
        let nb_members: Vec<(String,)> = sqlx::query_as(
            r#"SELECT owner_id FROM notebooks WHERE id = $1
               UNION
               SELECT user_id FROM notebook_members WHERE notebook_id = $1"#,
        )
        .bind(nb_id)
        .fetch_all(db)
        .await
        .unwrap_or_default();
        for (uid,) in nb_members {
            if !ids.contains(&uid) {
                ids.push(uid);
            }
        }
    }
    ids
}

fn note_to_json(n: &NoteRow) -> serde_json::Value {
    json!({
        "id": n.id,
        "conversationId": n.conversation_id.map(|id| json!(id)).unwrap_or(serde_json::Value::Null),
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

/// Check if user is a moderator (admin or vice_admin) in a conversation,
/// or the conversation owner (for direct conversations without group members).
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

    if matches!(role.as_deref(), Some("admin") | Some("vice_admin")) {
        return true;
    }

    // Fallback: conversation owner is implicitly a moderator
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

/// Normalize a tag for comparison: trim, lowercase, strip leading '#'.
pub fn normalize_tag(tag: &str) -> String {
    let s = tag.trim().to_lowercase();
    s.strip_prefix('#').unwrap_or(&s).to_string()
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

/// GET /api/notes/:noteId — get a single note by ID (user must be a member of the note's conversation)
async fn get_note_by_id(
    State(state): State<AppState>,
    user: AuthUser,
    Path(note_id): Path<Uuid>,
) -> Response {
    let row = sqlx::query_as::<_, NoteRow>(&format!(
        "{} WHERE n.id = $1",
        NOTE_QUERY_BASE
    ))
    .bind(note_id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(note)) => {
            // Verify the user is a member of the note's conversation (if it has one)
            if let Some(cid) = note.conversation_id {
                if !is_member(&state.db, cid, &user.id).await {
                    return (
                        StatusCode::FORBIDDEN,
                        Json(json!({"error": "Not a member of this conversation"})),
                    )
                        .into_response();
                }
            } else {
                // No conversation — check note ownership
                if note.creator_id != user.id {
                    return (
                        StatusCode::FORBIDDEN,
                        Json(json!({"error": "Not authorized"})),
                    )
                        .into_response();
                }
            }
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

/// GET /api/notes/:noteId/related-memories — async endpoint for related memory capsules
async fn get_note_related_memories(
    State(state): State<AppState>,
    user: AuthUser,
    Path(note_id): Path<Uuid>,
) -> Response {
    // Check Redis cache first
    let cache_key = format!("related_memories:{}:{}", user.id, note_id);
    if let Ok(mut conn) = state.redis.get().await {
        if let Ok(cached) = deadpool_redis::redis::cmd("GET").arg(&cache_key).query_async::<String>(&mut conn).await {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&cached) {
                return Json(parsed).into_response();
            }
        }
    }

    let content = sqlx::query_scalar::<_, String>(
        "SELECT content FROM conversation_notes WHERE id = $1",
    )
    .bind(note_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .unwrap_or_default();

    let capsules = get_related_capsules_with_key(
        &state.db, &user.id, &content,
        state.config.openai_api_key.as_deref(),
    ).await;

    let result = json!({ "relatedCapsules": capsules });

    // Cache in Redis for 1 day
    if let Ok(mut conn) = state.redis.get().await {
        let _ = deadpool_redis::redis::cmd("SET")
            .arg(&cache_key)
            .arg(result.to_string())
            .arg("EX")
            .arg(86400)
            .query_async::<()>(&mut conn)
            .await;
    }

    Json(result).into_response()
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
#[allow(dead_code)]
async fn extract_capsule_from_note(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, note_id)): Path<(Uuid, Uuid)>,
) -> Response {
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

/// Get related memory capsule entries for a note using embedding similarity.
/// Falls back to BM25 full-text search if no OpenAI key or embedding fails.
pub async fn get_related_capsules(db: &PgPool, user_id: &str, content: &str) -> Vec<serde_json::Value> {
    get_related_capsules_inner(db, user_id, content, None).await
}

pub async fn get_related_capsules_with_key(db: &PgPool, user_id: &str, content: &str, openai_key: Option<&str>) -> Vec<serde_json::Value> {
    get_related_capsules_inner(db, user_id, content, openai_key).await
}

async fn get_related_capsules_inner(db: &PgPool, user_id: &str, content: &str, openai_key: Option<&str>) -> Vec<serde_json::Value> {
    if content.trim().len() < 20 {
        return vec![];
    }

    // Try embedding search first
    if let Some(api_key) = openai_key {
        if let Some(results) = embedding_search(db, user_id, content, api_key).await {
            if !results.is_empty() {
                return results;
            }
        }
    }

    // Fallback: BM25 full-text search with score threshold
    let end = content.char_indices().nth(200).map(|(i, _)| i).unwrap_or(content.len());
    let query_text = &content[..end];
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

    let rows: Vec<(Uuid, String, f64, Uuid, String, Option<DateTime<Utc>>, Option<DateTime<Utc>>, f32)> = sqlx::query_as(
        r#"SELECT me.id, me.content, me.importance, mc.id AS capsule_id, mc.name AS capsule_name,
                  me.source_start, me.source_end,
                  ts_rank(me.search_vector, to_tsquery('english', $2)) AS rank
           FROM memory_entries me
           JOIN memory_capsules mc ON mc.id = me.capsule_id
           WHERE mc.owner_id = $1
             AND me.search_vector @@ to_tsquery('english', $2)
             AND ts_rank(me.search_vector, to_tsquery('english', $2)) > 0.05
           ORDER BY rank DESC
           LIMIT 5"#,
    )
    .bind(user_id)
    .bind(&tsquery)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    rows.iter()
        .map(|(id, content, importance, capsule_id, capsule_name, source_start, source_end, _rank)| {
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

/// Embedding-based similarity search using pgvector cosine distance.
async fn embedding_search(db: &PgPool, user_id: &str, content: &str, api_key: &str) -> Option<Vec<serde_json::Value>> {
    use crate::services::embedding::{generate_embeddings, EMBEDDING_MODEL};
    use pgvector::Vector;

    // Truncate content for embedding (max ~500 chars)
    let end = content.char_indices().nth(500).map(|(i, _)| i).unwrap_or(content.len());
    let query_text = content[..end].to_string();

    let client = reqwest::Client::new();
    let embeddings = generate_embeddings(&client, api_key, &[query_text], EMBEDDING_MODEL).await.ok()?;
    let query_embedding = embeddings.into_iter().next()?;
    let query_vec = Vector::from(query_embedding);

    let rows: Vec<(Uuid, String, f64, Uuid, String, Option<DateTime<Utc>>, Option<DateTime<Utc>>, f64)> = sqlx::query_as(
        r#"SELECT me.id, me.content, me.importance, mc.id AS capsule_id, mc.name AS capsule_name,
                  me.source_start, me.source_end,
                  1 - (me.embedding <=> $2::vector) AS similarity
           FROM memory_entries me
           JOIN memory_capsules mc ON mc.id = me.capsule_id
           WHERE mc.owner_id = $1
             AND me.embedding IS NOT NULL
           ORDER BY me.embedding <=> $2::vector
           LIMIT 5"#,
    )
    .bind(user_id)
    .bind(&query_vec)
    .fetch_all(db)
    .await
    .ok()?;

    // Filter by similarity threshold (>= 0.3)
    let results: Vec<_> = rows.iter()
        .filter(|r| r.7 >= 0.3)
        .map(|(id, content, importance, capsule_id, capsule_name, source_start, source_end, similarity)| {
            json!({
                "id": id,
                "content": content,
                "importance": importance,
                "capsuleId": capsule_id,
                "capsuleName": capsule_name,
                "sourceStart": source_start.map(|t| t.to_rfc3339()),
                "sourceEnd": source_end.map(|t| t.to_rfc3339()),
                "similarity": similarity,
            })
        })
        .collect();

    Some(results)
}

// ===== Task 4: AI tag suggestions =====

/// Generate tag suggestions for note content using AI.
pub async fn suggest_tags(gemini_key: &str, title: &str, content: &str) -> Vec<String> {
    if content.trim().len() < 20 && title.trim().len() < 5 {
        return vec![];
    }
    let system = "Based on the note title and content, suggest 2-3 short tags (single words, lowercase, no #). \
                  Output only the tags separated by commas. Example: feature, urgent, design";
    let content_end = content.char_indices().nth(1000).map(|(i, _)| i).unwrap_or(content.len());
    let prompt = format!("Title: {}\n\nContent: {}", title, &content[..content_end]);

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

// ---------------------------------------------------------------------------
// Notebook preference per conversation
// ---------------------------------------------------------------------------

/// GET /api/conversations/:id/notebook-preference
async fn get_notebook_preference(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conv_id): Path<Uuid>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    let row = sqlx::query_as::<_, (Uuid, DateTime<Utc>)>(
        "SELECT notebook_id, updated_at FROM conversation_notebook_preference WHERE user_id = $1 AND conversation_id = $2",
    )
    .bind(&user.id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some((notebook_id, updated_at))) => {
            Json(json!({
                "notebookId": notebook_id,
                "updatedAt": updated_at.to_rfc3339(),
            }))
            .into_response()
        }
        Ok(None) => {
            // Return default notebook
            match super::notebooks::get_default_notebook_id(&state.db, &user.id).await {
                Ok(nb_id) => Json(json!({ "notebookId": nb_id, "isDefault": true })).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": e.to_string()})),
                )
                    .into_response(),
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct SetNotebookPreferenceBody {
    #[serde(rename = "notebookId")]
    notebook_id: Uuid,
}

/// PUT /api/conversations/:id/notebook-preference
async fn set_notebook_preference(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conv_id): Path<Uuid>,
    Json(body): Json<SetNotebookPreferenceBody>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    // Verify notebook ownership
    let nb_owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM notebooks WHERE id = $1",
    )
    .bind(body.notebook_id)
    .fetch_optional(&state.db)
    .await;

    match nb_owner {
        Ok(Some(owner)) if owner == user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Not your notebook"})),
            )
                .into_response();
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Notebook not found"})),
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
        r#"INSERT INTO conversation_notebook_preference (user_id, conversation_id, notebook_id, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (user_id, conversation_id) DO UPDATE SET notebook_id = $3, updated_at = NOW()"#,
    )
    .bind(&user.id)
    .bind(conv_id)
    .bind(body.notebook_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({"success": true, "notebookId": body.notebook_id})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ── Board preference per conversation ──────────────────────────────────

/// GET /api/conversations/:id/board-preference
async fn get_board_preference(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conv_id): Path<Uuid>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    let row = sqlx::query_as::<_, (Uuid, DateTime<Utc>)>(
        "SELECT board_id, updated_at FROM conversation_board_preference WHERE user_id = $1 AND conversation_id = $2",
    )
    .bind(&user.id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some((board_id, updated_at))) => {
            Json(json!({
                "boardId": board_id,
                "updatedAt": updated_at.to_rfc3339(),
            }))
            .into_response()
        }
        Ok(None) => {
            // Return first non-archived board as default
            let default_board = sqlx::query_scalar::<_, Uuid>(
                "SELECT id FROM kanban_boards WHERE owner_id = $1 AND archived = false ORDER BY created_at ASC LIMIT 1",
            )
            .bind(&user.id)
            .fetch_optional(&state.db)
            .await;

            match default_board {
                Ok(Some(bid)) => Json(json!({ "boardId": bid, "isDefault": true })).into_response(),
                Ok(None) => Json(json!({ "boardId": null, "isDefault": true })).into_response(),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": e.to_string()})),
                )
                    .into_response(),
            }
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct SetBoardPreferenceBody {
    #[serde(rename = "boardId")]
    board_id: Uuid,
}

/// PUT /api/conversations/:id/board-preference
async fn set_board_preference(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conv_id): Path<Uuid>,
    Json(body): Json<SetBoardPreferenceBody>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not a member of this conversation"})),
        )
            .into_response();
    }

    // Verify board access (owner OR member)
    let has_access = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM kanban_boards b
            WHERE b.id = $1 AND b.archived = false
              AND (b.owner_id = $2 OR EXISTS(SELECT 1 FROM board_members bm WHERE bm.board_id = b.id AND bm.user_id = $2))
        )"#,
    )
    .bind(body.board_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    match has_access {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Board not found or no access"})),
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
        r#"INSERT INTO conversation_board_preference (user_id, conversation_id, board_id, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (user_id, conversation_id) DO UPDATE SET board_id = $3, updated_at = NOW()"#,
    )
    .bind(&user.id)
    .bind(conv_id)
    .bind(body.board_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({"success": true, "boardId": body.board_id})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ===== Conversation-independent note CRUD =====

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateNoteStandaloneBody {
    notebook_id: String,
    title: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    tags: Vec<String>,
}

/// POST /api/notes — create note without conversation
async fn create_note_standalone(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateNoteStandaloneBody>,
) -> Response {
    let title = body.title.trim();
    if title.is_empty() || title.len() > 200 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Title required (max 200)"}))).into_response();
    }
    let notebook_id = match Uuid::parse_str(&body.notebook_id) {
        Ok(id) => id,
        Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid notebookId"}))).into_response(),
    };
    // Verify notebook access (owner or edit/admin member)
    let has_access = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM notebooks WHERE id = $1 AND owner_id = $2
            UNION ALL
            SELECT 1 FROM notebook_members WHERE notebook_id = $1 AND user_id = $2 AND permission IN ('edit', 'admin')
        )"#,
    )
    .bind(notebook_id).bind(&user.id).fetch_one(&state.db).await.unwrap_or(false);
    if !has_access {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "No edit access to this notebook"}))).into_response();
    }

    let note_id = Uuid::new_v4();
    let now = Utc::now();
    let tags: Vec<String> = body.tags.iter().map(|t| t.trim().to_string()).filter(|t| !t.is_empty()).collect();

    let result = sqlx::query(
        r#"INSERT INTO conversation_notes (id, creator_id, creator_type, owner_id, notebook_id, title, content, tags, created_at, updated_at)
           VALUES ($1, $2, 'user', $2, $3, $4, $5, $6, $7, $7)"#,
    )
    .bind(note_id).bind(&user.id).bind(notebook_id).bind(title).bind(&body.content).bind(&tags).bind(now)
    .execute(&state.db).await;

    match result {
        Ok(_) => {
            let row = sqlx::query_as::<_, NoteRow>(&format!("{} WHERE n.id = $1", NOTE_QUERY_BASE))
                .bind(note_id).fetch_optional(&state.db).await;
            match row {
                Ok(Some(n)) => {
                    let note_json = note_to_json(&n);
                    let member_ids = get_note_broadcast_ids(&state.db, Uuid::nil(), Some(notebook_id)).await;
                    state.ws.broadcast_to_members(&member_ids, &json!({"type": "note:created", "note": &note_json}), &state.redis);
                    (StatusCode::CREATED, Json(note_json)).into_response()
                }
                _ => (StatusCode::CREATED, Json(json!({"id": note_id}))).into_response(),
            }
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// PATCH /api/notes/:noteId — update note without conversation
async fn update_note_standalone(
    State(state): State<AppState>,
    user: AuthUser,
    Path(note_id): Path<Uuid>,
    Json(body): Json<serde_json::Value>,
) -> Response {
    let note_owner = sqlx::query_scalar::<_, String>(
        "SELECT creator_id FROM conversation_notes WHERE id = $1",
    ).bind(note_id).fetch_optional(&state.db).await;

    match note_owner {
        Ok(Some(ref owner)) if owner == &user.id => {}
        Ok(Some(_)) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Not the note creator"}))).into_response(),
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }

    if let Some(title) = body.get("title").and_then(|v| v.as_str()) {
        sqlx::query("UPDATE conversation_notes SET title = $1, updated_at = NOW() WHERE id = $2")
            .bind(title).bind(note_id).execute(&state.db).await.ok();
    }
    if let Some(content) = body.get("content").and_then(|v| v.as_str()) {
        sqlx::query("UPDATE conversation_notes SET content = $1, updated_at = NOW() WHERE id = $2")
            .bind(content).bind(note_id).execute(&state.db).await.ok();
    }
    if let Some(tags) = body.get("tags").and_then(|v| v.as_array()) {
        let tag_strs: Vec<String> = tags.iter().filter_map(|t| t.as_str().map(|s| s.to_string())).collect();
        sqlx::query("UPDATE conversation_notes SET tags = $1, updated_at = NOW() WHERE id = $2")
            .bind(&tag_strs).bind(note_id).execute(&state.db).await.ok();
    }

    let row = sqlx::query_as::<_, NoteRow>(&format!("{} WHERE n.id = $1", NOTE_QUERY_BASE))
        .bind(note_id).fetch_optional(&state.db).await;

    match row {
        Ok(Some(n)) => {
            let note_json = note_to_json(&n);
            let nb_id = sqlx::query_scalar::<_, Uuid>("SELECT notebook_id FROM conversation_notes WHERE id = $1")
                .bind(note_id).fetch_optional(&state.db).await.ok().flatten();
            let member_ids = get_note_broadcast_ids(&state.db, Uuid::nil(), nb_id).await;
            state.ws.broadcast_to_members(&member_ids, &json!({"type": "note:updated", "note": &note_json}), &state.redis);
            Json(note_json).into_response()
        }
        _ => (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
    }
}

/// DELETE /api/notes/:noteId — delete note without conversation
async fn delete_note_standalone(
    State(state): State<AppState>,
    user: AuthUser,
    Path(note_id): Path<Uuid>,
) -> Response {
    let note_info = sqlx::query_as::<_, (String, Option<Uuid>)>(
        "SELECT creator_id, notebook_id FROM conversation_notes WHERE id = $1",
    ).bind(note_id).fetch_optional(&state.db).await;

    let (creator_id, notebook_id) = match note_info {
        Ok(Some(info)) => info,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    let is_creator = creator_id == user.id;
    let is_nb_owner = if let Some(nb_id) = notebook_id {
        sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM notebooks WHERE id = $1 AND owner_id = $2)")
            .bind(nb_id).bind(&user.id).fetch_one(&state.db).await.unwrap_or(false)
    } else { false };

    if !is_creator && !is_nb_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not authorized"}))).into_response();
    }

    let result = sqlx::query("DELETE FROM conversation_notes WHERE id = $1").bind(note_id).execute(&state.db).await;
    match result {
        Ok(r) if r.rows_affected() > 0 => {
            let member_ids = get_note_broadcast_ids(&state.db, Uuid::nil(), notebook_id).await;
            state.ws.broadcast_to_members(&member_ids, &json!({"type": "note:deleted", "noteId": note_id.to_string()}), &state.redis);
            StatusCode::NO_CONTENT.into_response()
        }
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// POST /api/notes/:noteId/archive
async fn archive_note_standalone(
    State(state): State<AppState>,
    user: AuthUser,
    Path(note_id): Path<Uuid>,
) -> Response {
    let creator = sqlx::query_scalar::<_, String>("SELECT creator_id FROM conversation_notes WHERE id = $1")
        .bind(note_id).fetch_optional(&state.db).await;
    match creator {
        Ok(Some(ref id)) if id == &user.id => {}
        Ok(Some(_)) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Not the creator"}))).into_response(),
        _ => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
    }
    let _ = sqlx::query("UPDATE conversation_notes SET archived_at = NOW() WHERE id = $1")
        .bind(note_id).execute(&state.db).await;
    Json(json!({"archived": true})).into_response()
}

/// POST /api/notes/:noteId/unarchive
async fn unarchive_note_standalone(
    State(state): State<AppState>,
    user: AuthUser,
    Path(note_id): Path<Uuid>,
) -> Response {
    let creator = sqlx::query_scalar::<_, String>("SELECT creator_id FROM conversation_notes WHERE id = $1")
        .bind(note_id).fetch_optional(&state.db).await;
    match creator {
        Ok(Some(ref id)) if id == &user.id => {}
        Ok(Some(_)) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Not the creator"}))).into_response(),
        _ => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
    }
    let _ = sqlx::query("UPDATE conversation_notes SET archived_at = NULL WHERE id = $1 AND archived_at IS NOT NULL")
        .bind(note_id).execute(&state.db).await;
    Json(json!({"archived": false})).into_response()
}

/// POST /api/notes/:noteId/auto-tag — auto-tag without conversation
async fn auto_tag_note_standalone(
    State(state): State<AppState>,
    user: AuthUser,
    Path(note_id): Path<Uuid>,
) -> Response {
    let note = sqlx::query_as::<_, (String, String, Vec<String>)>(
        "SELECT title, content, tags FROM conversation_notes WHERE id = $1 AND creator_id = $2",
    )
    .bind(note_id).bind(&user.id).fetch_optional(&state.db).await;

    let (title, content, existing_tags) = match note {
        Ok(Some(n)) => n,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Note not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    if content.trim().len() < 20 && title.trim().len() < 5 {
        return Json(json!({"tags": existing_tags})).into_response();
    }

    let content_end = content.char_indices().nth(200).map(|(i, _)| i).unwrap_or(content.len());
    let query_text = format!("{} {}", title, &content[..content_end]);
    let tsquery = query_text.split_whitespace().take(8)
        .map(|w| w.replace('\'', "")).filter(|w| w.len() > 2).collect::<Vec<_>>().join(" | ");

    if tsquery.is_empty() {
        return Json(json!({"tags": existing_tags})).into_response();
    }

    let memory_tags: Vec<Vec<String>> = sqlx::query_scalar(
        r#"SELECT tags FROM conversation_notes
           WHERE owner_id = $1 AND id != $2 AND array_length(tags, 1) > 0
           AND to_tsvector('simple', title || ' ' || content) @@ to_tsquery('simple', $3)
           LIMIT 5"#,
    )
    .bind(&user.id).bind(note_id).bind(&tsquery).fetch_all(&state.db).await.unwrap_or_default();

    let mut tag_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for tags in &memory_tags {
        for tag in tags {
            let normalized = tag.trim().to_lowercase();
            if !normalized.is_empty() && !existing_tags.iter().any(|t| t.to_lowercase() == normalized) {
                *tag_counts.entry(normalized).or_insert(0) += 1;
            }
        }
    }

    let mut ranked: Vec<_> = tag_counts.into_iter().collect();
    ranked.sort_by(|a, b| b.1.cmp(&a.1));
    let suggested: Vec<String> = ranked.into_iter().take(5).map(|(t, _)| t).collect();
    Json(json!({"tags": existing_tags, "suggestedTags": suggested})).into_response()
}

/// POST /api/notes/:noteId/ask-ai — ask AI without conversation
async fn ask_ai_standalone(
    State(state): State<AppState>,
    user: AuthUser,
    Path(note_id): Path<Uuid>,
    Json(body): Json<AskAiBody>,
) -> Response {
    let question = body.question.trim();
    if question.is_empty() || question.len() > 2000 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Question is required (max 2000 chars)"}))).into_response();
    }

    let gemini_key = match sqlx::query_scalar::<_, Option<String>>(
        "SELECT gemini_api_key FROM user_settings WHERE user_id = $1",
    ).bind(&user.id).fetch_optional(&state.db).await {
        Ok(Some(Some(k))) if !k.is_empty() => crate::routes::user_settings::decrypt_api_key(&state.config, &k),
        _ => return (StatusCode::PAYMENT_REQUIRED, Json(json!({"error": "Please set your Gemini API key in Settings to use Ask AI."}))).into_response(),
    };

    if let Err(resp) = check_ai_rate_limit(&state.redis, &user.id).await {
        return resp;
    }

    let note = sqlx::query_as::<_, (String, String)>(
        "SELECT title, content FROM conversation_notes WHERE id = $1 AND creator_id = $2",
    ).bind(note_id).bind(&user.id).fetch_optional(&state.db).await;

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

/// POST /api/notes/upload — upload note image without conversation
async fn upload_note_image_standalone(
    State(state): State<AppState>,
    user: AuthUser,
    mut multipart: Multipart,
) -> Response {
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() != Some("file") { continue; }
        let data = match field.bytes().await {
            Ok(d) => d,
            Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({"error": "Failed to read file"}))).into_response(),
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

        let stored = format!("note_{}_{}.{}", &user.id[..8], chrono::Utc::now().timestamp_millis(), ext);
        let r2_key = format!("notes/standalone/{}", stored);

        let url = if let Some(s3) = &state.s3 {
            match crate::services::r2::upload_to_r2(s3, &state.config.r2_bucket, &r2_key, data.to_vec(), content_type, &state.config.r2_public_url).await {
                Ok(url) => url,
                Err(_) => {
                    let dir = std::path::Path::new(&state.config.upload_dir).join("notes");
                    let _ = tokio::fs::create_dir_all(&dir).await;
                    let _ = tokio::fs::write(dir.join(&stored), &data).await;
                    format!("/uploads/notes/{}", stored)
                }
            }
        } else {
            let dir = std::path::Path::new(&state.config.upload_dir).join("notes");
            let _ = tokio::fs::create_dir_all(&dir).await;
            let _ = tokio::fs::write(dir.join(&stored), &data).await;
            format!("/uploads/notes/{}", stored)
        };

        return Json(json!({"url": url})).into_response();
    }
    (StatusCode::BAD_REQUEST, Json(json!({"error": "No file field"}))).into_response()
}
