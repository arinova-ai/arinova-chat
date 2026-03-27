use axum::{
    extract::{Query, State},
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use serde::Deserialize;
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/v1/search", get(unified_search))
}

#[derive(Deserialize)]
struct SearchParams {
    q: Option<String>,
    limit: Option<String>,
}

// ── Row types ────────────────────────────────────────────────────────────

#[derive(Debug, FromRow)]
struct MsgRow {
    id: Uuid,
    conversation_id: Uuid,
    content: String,
    role: String,
    conversation_title: Option<String>,
    created_at: chrono::NaiveDateTime,
}

#[derive(Debug, FromRow)]
struct NoteRow {
    id: Uuid,
    title: Option<String>,
    content: Option<String>,
    created_at: chrono::NaiveDateTime,
}

#[derive(Debug, FromRow)]
struct ConvRow {
    id: Uuid,
    title: Option<String>,
    agent_name: Option<String>,
    created_at: chrono::NaiveDateTime,
}

#[derive(Debug, FromRow)]
struct MemRow {
    id: Uuid,
    summary: String,
    detail: Option<String>,
    category: String,
    created_at: chrono::NaiveDateTime,
}

// ── Handler ──────────────────────────────────────────────────────────────

async fn unified_search(
    State(state): State<AppState>,
    user: AuthUser,
    Query(params): Query<SearchParams>,
) -> Response {
    let q = match &params.q {
        Some(q) if !q.trim().is_empty() => q.trim().to_string(),
        _ => {
            return Json(json!({
                "messages": [], "notes": [], "conversations": [], "memories": []
            }))
            .into_response()
        }
    };

    let limit: i64 = params
        .limit
        .as_deref()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(10)
        .min(20);

    let pattern = format!("%{}%", q);

    // Run all four searches in parallel
    let (messages, notes, conversations, memories) = tokio::join!(
        search_messages(&state, &user.id, &pattern, limit),
        search_notes(&state, &user.id, &pattern, limit),
        search_conversations(&state, &user.id, &pattern, limit),
        search_memories(&state, &user.id, &pattern, limit),
    );

    Json(json!({
        "messages": messages.unwrap_or_default(),
        "notes": notes.unwrap_or_default(),
        "conversations": conversations.unwrap_or_default(),
        "memories": memories.unwrap_or_default(),
    }))
    .into_response()
}

// ── Sub-queries ──────────────────────────────────────────────────────────

async fn search_messages(
    state: &AppState,
    user_id: &str,
    pattern: &str,
    limit: i64,
) -> Result<Vec<serde_json::Value>, sqlx::Error> {
    let rows = sqlx::query_as::<_, MsgRow>(
        r#"SELECT m.id, m.conversation_id, m.content, m.role::text,
                  c.title AS conversation_title, m.created_at
           FROM messages m
           INNER JOIN conversations c ON m.conversation_id = c.id
           WHERE c.user_id = $1
             AND m.content ILIKE $2
           ORDER BY m.created_at DESC
           LIMIT $3"#,
    )
    .bind(user_id)
    .bind(pattern)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    Ok(rows
        .iter()
        .map(|r| {
            json!({
                "id": r.id,
                "conversationId": r.conversation_id,
                "content": r.content,
                "role": r.role,
                "conversationTitle": r.conversation_title,
                "createdAt": r.created_at.and_utc().to_rfc3339(),
            })
        })
        .collect())
}

async fn search_notes(
    state: &AppState,
    user_id: &str,
    pattern: &str,
    limit: i64,
) -> Result<Vec<serde_json::Value>, sqlx::Error> {
    let rows = sqlx::query_as::<_, NoteRow>(
        r#"SELECT id, title, content, created_at
           FROM notes
           WHERE owner_id = $1
             AND (title ILIKE $2 OR content ILIKE $2)
             AND archived_at IS NULL
           ORDER BY created_at DESC
           LIMIT $3"#,
    )
    .bind(user_id)
    .bind(pattern)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    Ok(rows
        .iter()
        .map(|r| {
            json!({
                "id": r.id,
                "title": r.title,
                "content": r.content,
                "createdAt": r.created_at.and_utc().to_rfc3339(),
            })
        })
        .collect())
}

async fn search_conversations(
    state: &AppState,
    user_id: &str,
    pattern: &str,
    limit: i64,
) -> Result<Vec<serde_json::Value>, sqlx::Error> {
    let rows = sqlx::query_as::<_, ConvRow>(
        r#"SELECT c.id, c.title, a.name AS agent_name, c.created_at
           FROM conversations c
           LEFT JOIN agents a ON c.agent_id = a.id
           WHERE c.user_id = $1
             AND c.title ILIKE $2
           ORDER BY c.created_at DESC
           LIMIT $3"#,
    )
    .bind(user_id)
    .bind(pattern)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    Ok(rows
        .iter()
        .map(|r| {
            json!({
                "id": r.id,
                "title": r.title,
                "agentName": r.agent_name,
                "createdAt": r.created_at.and_utc().to_rfc3339(),
            })
        })
        .collect())
}

async fn search_memories(
    state: &AppState,
    user_id: &str,
    pattern: &str,
    limit: i64,
) -> Result<Vec<serde_json::Value>, sqlx::Error> {
    let rows = sqlx::query_as::<_, MemRow>(
        r#"SELECT am.id, am.summary, am.detail, am.category, am.created_at
           FROM agent_memories am
           INNER JOIN agents a ON am.agent_id = a.id
           WHERE a.owner_id = $1
             AND (am.summary ILIKE $2 OR am.detail ILIKE $2)
           ORDER BY am.created_at DESC
           LIMIT $3"#,
    )
    .bind(user_id)
    .bind(pattern)
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    Ok(rows
        .iter()
        .map(|r| {
            json!({
                "id": r.id,
                "summary": r.summary,
                "detail": r.detail,
                "category": r.category,
                "createdAt": r.created_at.and_utc().to_rfc3339(),
            })
        })
        .collect())
}
