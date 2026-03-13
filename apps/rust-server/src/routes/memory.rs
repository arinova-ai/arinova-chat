use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post},
    Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::{AuthAgent, AuthUser};
use crate::AppState;

/// Max capsules per user
const MAX_CAPSULES_PER_USER: i64 = 10;
/// Max extractions per user per day
const MAX_DAILY_EXTRACTIONS: i32 = 10;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/memory/capsules", post(create_capsule).get(list_capsules))
        // Static path must come before dynamic {id} to avoid conflict
        .route("/api/memory/capsules/grants", get(list_grants_for_agent))
        .route("/api/memory/capsules/{id}", delete(delete_capsule))
        .route("/api/memory/capsules/{id}/abort", post(abort_capsule))
        .route("/api/memory/capsules/{id}/refresh", post(refresh_capsule))
        .route(
            "/api/memory/capsules/{id}/entries",
            get(list_capsule_entries),
        )
        .route(
            "/api/memory/capsules/{id}/entries/search",
            get(search_capsule_entries),
        )
        .route(
            "/api/memory/capsules/{id}/grants",
            post(grant_agent_access),
        )
        .route(
            "/api/memory/capsules/{id}/grants/{agentId}",
            delete(revoke_agent_access),
        )
        // Agent API
        .route("/api/agent/capsules", get(agent_query_capsules))
}

// ---------------------------------------------------------------------------
// POST /api/memory/capsules — Create a capsule from a conversation
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct CreateCapsuleBody {
    conversation_id: Uuid,
    name: String,
}

async fn create_capsule(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateCapsuleBody>,
) -> Response {
    let name = body.name.trim().to_string();
    if name.is_empty() || name.len() > 255 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "name must be 1-255 characters"})),
        )
            .into_response();
    }

    // Validate user is a member of the conversation
    // Direct convs store owner in conversations.user_id; group convs use conversation_user_members
    let is_member = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM (
            SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2
            UNION ALL
            SELECT 1 FROM conversation_user_members WHERE conversation_id = $1 AND user_id = $2
        ) sub"#,
    )
    .bind(body.conversation_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if is_member == 0 {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "You are not a member of this conversation"})),
        )
            .into_response();
    }

    // Check if a capsule already exists for this conversation
    let existing = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id, status FROM memory_capsules WHERE owner_id = $1 AND source_conversation_id = $2 LIMIT 1",
    )
    .bind(&user.id)
    .bind(body.conversation_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    if let Some((existing_id, existing_status)) = existing {
        return (
            StatusCode::CONFLICT,
            Json(json!({
                "error": "A capsule already exists for this conversation. Use refresh instead.",
                "existingCapsuleId": existing_id,
                "existingStatus": existing_status,
            })),
        )
            .into_response();
    }

    // Check capsule limit
    let capsule_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM memory_capsules WHERE owner_id = $1",
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if capsule_count >= MAX_CAPSULES_PER_USER {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": format!("Maximum {} capsules per user", MAX_CAPSULES_PER_USER)})),
        )
            .into_response();
    }

    // Check daily extraction limit
    let daily_count = sqlx::query_scalar::<_, i32>(
        "SELECT extract_count FROM memory_usage_daily WHERE user_id = $1 AND date = CURRENT_DATE",
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .unwrap_or(0);

    if daily_count >= MAX_DAILY_EXTRACTIONS {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error": format!("Daily extraction limit ({}) reached", MAX_DAILY_EXTRACTIONS)})),
        )
            .into_response();
    }

    // Count messages and get time range from actual message timestamps
    #[derive(sqlx::FromRow)]
    struct MsgStats {
        cnt: i64,
        min_at: Option<chrono::DateTime<chrono::Utc>>,
        max_at: Option<chrono::DateTime<chrono::Utc>>,
    }
    let stats = sqlx::query_as::<_, MsgStats>(
        "SELECT COUNT(*) AS cnt, MIN(created_at) AS min_at, MAX(created_at) AS max_at FROM messages WHERE conversation_id = $1",
    )
    .bind(body.conversation_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(MsgStats { cnt: 0, min_at: None, max_at: None });

    let message_count = stats.cnt as i32;

    // Create capsule with status=extracting; set extracted_through to last message time
    let capsule_id = match sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO memory_capsules (owner_id, name, source_conversation_id, message_count, status, created_at, extracted_through)
           VALUES ($1, $2, $3, $4, 'extracting', COALESCE($5, NOW()), $6)
           RETURNING id"#,
    )
    .bind(&user.id)
    .bind(&name)
    .bind(body.conversation_id)
    .bind(message_count)
    .bind(stats.min_at)
    .bind(stats.max_at)
    .fetch_one(&state.db)
    .await
    {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("Failed to create capsule: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to create capsule"})),
            )
                .into_response();
        }
    };

    // Spawn background extraction task with cancellation token
    let db_clone = state.db.clone();
    let config_clone = state.config.clone();
    let cancel = tokio_util::sync::CancellationToken::new();
    state.extraction_tokens.insert(capsule_id, cancel.clone());
    let tokens_ref = state.extraction_tokens.clone();
    tokio::spawn(async move {
        let result = crate::services::memory::extract_capsule(db_clone, config_clone, capsule_id, cancel).await;
        tokens_ref.remove(&capsule_id);
        if let Err(e) = result {
            tracing::error!("Memory extraction failed for capsule {}: {}", capsule_id, e);
        }
    });

    // Increment daily usage
    let _ = sqlx::query(
        r#"INSERT INTO memory_usage_daily (user_id, date, extract_count)
           VALUES ($1, CURRENT_DATE, 1)
           ON CONFLICT (user_id, date) DO UPDATE SET extract_count = memory_usage_daily.extract_count + 1"#,
    )
    .bind(&user.id)
    .execute(&state.db)
    .await;

    (
        StatusCode::CREATED,
        Json(json!({
            "id": capsule_id,
            "name": name,
            "status": "extracting",
            "messageCount": message_count,
        })),
    )
        .into_response()
}

// ---------------------------------------------------------------------------
// GET /api/memory/capsules — List user's capsules
// ---------------------------------------------------------------------------

async fn list_capsules(
    State(state): State<AppState>,
    user: AuthUser,
) -> Response {
    #[derive(sqlx::FromRow)]
    struct CapsuleRow {
        id: Uuid,
        name: String,
        source_conversation_id: Option<Uuid>,
        message_count: i32,
        status: String,
        created_at: chrono::DateTime<chrono::Utc>,
        extracted_through: Option<chrono::DateTime<chrono::Utc>>,
        entry_count: i32,
        note_count: i32,
        progress: Option<serde_json::Value>,
    }

    let rows = sqlx::query_as::<_, CapsuleRow>(
        r#"SELECT id, name, source_conversation_id, message_count, status, created_at,
                  extracted_through, entry_count, note_count, progress
           FROM memory_capsules
           WHERE owner_id = $1
           ORDER BY created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let capsules: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.id,
                "name": r.name,
                "sourceConversationId": r.source_conversation_id,
                "messageCount": r.message_count,
                "status": r.status,
                "createdAt": r.created_at.to_rfc3339(),
                "extractedThrough": r.extracted_through.map(|dt| dt.to_rfc3339()),
                "entryCount": r.entry_count,
                "noteCount": r.note_count,
                "progress": r.progress,
            })
        })
        .collect();

    (StatusCode::OK, Json(json!({ "capsules": capsules }))).into_response()
}

// ---------------------------------------------------------------------------
// DELETE /api/memory/capsules/:id — Delete a capsule
// ---------------------------------------------------------------------------

async fn delete_capsule(
    _user: AuthUser,
    Path(_capsule_id): Path<Uuid>,
) -> Response {
    (StatusCode::METHOD_NOT_ALLOWED, Json(json!({"error": "Capsule deletion is disabled"}))).into_response()
}

// ---------------------------------------------------------------------------
// POST /api/memory/capsules/:id/abort — Abort an extracting capsule
// ---------------------------------------------------------------------------

async fn abort_capsule(
    _user: AuthUser,
    Path(_capsule_id): Path<Uuid>,
) -> Response {
    (StatusCode::METHOD_NOT_ALLOWED, Json(json!({"error": "Capsule abort is disabled"}))).into_response()
}

// ---------------------------------------------------------------------------
// GET /api/memory/capsules/grants?agent_id=UUID — Get grants for an agent
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct GrantsQuery {
    agent_id: Uuid,
}

async fn list_grants_for_agent(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<GrantsQuery>,
) -> Response {
    #[derive(sqlx::FromRow)]
    struct GrantRow {
        capsule_id: Uuid,
        capsule_name: String,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let rows = sqlx::query_as::<_, GrantRow>(
        r#"SELECT g.capsule_id, c.name AS capsule_name, g.created_at
           FROM memory_capsule_grants g
           JOIN memory_capsules c ON c.id = g.capsule_id
           WHERE g.agent_id = $1 AND c.owner_id = $2
           ORDER BY g.created_at DESC"#,
    )
    .bind(query.agent_id)
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let grants: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "capsuleId": r.capsule_id,
                "capsuleName": r.capsule_name,
                "createdAt": r.created_at.to_rfc3339(),
            })
        })
        .collect();

    (StatusCode::OK, Json(json!({ "grants": grants }))).into_response()
}

// ---------------------------------------------------------------------------
// POST /api/memory/capsules/:id/grants — Grant agent access
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct GrantBody {
    agent_id: Uuid,
}

async fn grant_agent_access(
    State(state): State<AppState>,
    user: AuthUser,
    Path(capsule_id): Path<Uuid>,
    Json(body): Json<GrantBody>,
) -> Response {
    // Verify capsule ownership (owner_id is TEXT)
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM memory_capsules WHERE id = $1",
    )
    .bind(capsule_id)
    .fetch_optional(&state.db)
    .await;

    match owner {
        Ok(Some(ref oid)) if oid == &user.id => {}
        Ok(Some(_)) => {
            return (StatusCode::FORBIDDEN, Json(json!({"error": "Not your capsule"}))).into_response();
        }
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(json!({"error": "Capsule not found"}))).into_response();
        }
        Err(e) => {
            tracing::error!("grant_agent_access: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"}))).into_response();
        }
    }

    if let Err(e) = sqlx::query(
        r#"INSERT INTO memory_capsule_grants (capsule_id, agent_id, granted_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (capsule_id, agent_id) DO NOTHING"#,
    )
    .bind(capsule_id)
    .bind(body.agent_id)
    .bind(&user.id)
    .execute(&state.db)
    .await
    {
        tracing::error!("grant_agent_access: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to grant access"}))).into_response();
    }

    (
        StatusCode::CREATED,
        Json(json!({"capsuleId": capsule_id, "agentId": body.agent_id})),
    )
        .into_response()
}

// ---------------------------------------------------------------------------
// POST /api/memory/capsules/:id/refresh — Re-extract (incremental)
// ---------------------------------------------------------------------------

async fn refresh_capsule(
    State(state): State<AppState>,
    user: AuthUser,
    Path(capsule_id): Path<Uuid>,
) -> Response {
    // Verify ownership and status
    let row = sqlx::query_as::<_, (String, String, chrono::DateTime<chrono::Utc>)>(
        "SELECT owner_id, status, updated_at FROM memory_capsules WHERE id = $1",
    )
    .bind(capsule_id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some((ref oid, _, _))) if oid != &user.id => {
            return (StatusCode::FORBIDDEN, Json(json!({"error": "Not your capsule"}))).into_response();
        }
        Ok(Some((_, ref status, ref updated_at))) if status == "extracting" => {
            let thirty_min_ago = chrono::Utc::now() - chrono::Duration::minutes(30);
            if *updated_at > thirty_min_ago {
                return (
                    StatusCode::CONFLICT,
                    Json(json!({"error": "Capsule is currently extracting"})),
                ).into_response();
            }
            // Stuck for >30 min, allow re-extraction
        }
        Ok(Some((_, ref status, _))) if status != "ready" && status != "failed" => {
            return (
                StatusCode::CONFLICT,
                Json(json!({"error": format!("Capsule is currently {}", status)})),
            )
                .into_response();
        }
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(json!({"error": "Capsule not found"}))).into_response();
        }
        Err(e) => {
            tracing::error!("refresh_capsule: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"}))).into_response();
        }
        _ => {}
    }

    // Check daily extraction limit
    let daily_count = sqlx::query_scalar::<_, i32>(
        "SELECT extract_count FROM memory_usage_daily WHERE user_id = $1 AND date = CURRENT_DATE",
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .unwrap_or(0);

    if daily_count >= MAX_DAILY_EXTRACTIONS {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"error": format!("Daily extraction limit ({}) reached", MAX_DAILY_EXTRACTIONS)})),
        )
            .into_response();
    }

    // Set status to extracting
    let _ = sqlx::query("UPDATE memory_capsules SET status = 'extracting' WHERE id = $1")
        .bind(capsule_id)
        .execute(&state.db)
        .await;

    // Spawn background extraction with cancellation token
    let db_clone = state.db.clone();
    let config_clone = state.config.clone();
    let cancel = tokio_util::sync::CancellationToken::new();
    state.extraction_tokens.insert(capsule_id, cancel.clone());
    let tokens_ref = state.extraction_tokens.clone();
    tokio::spawn(async move {
        let result = crate::services::memory::extract_capsule(db_clone, config_clone, capsule_id, cancel).await;
        tokens_ref.remove(&capsule_id);
        if let Err(e) = result {
            tracing::error!("Memory refresh failed for capsule {}: {}", capsule_id, e);
        }
    });

    // Increment daily usage
    let _ = sqlx::query(
        r#"INSERT INTO memory_usage_daily (user_id, date, extract_count)
           VALUES ($1, CURRENT_DATE, 1)
           ON CONFLICT (user_id, date) DO UPDATE SET extract_count = memory_usage_daily.extract_count + 1"#,
    )
    .bind(&user.id)
    .execute(&state.db)
    .await;

    (StatusCode::OK, Json(json!({"status": "extracting"}))).into_response()
}

// ---------------------------------------------------------------------------
// DELETE /api/memory/capsules/:id/grants/:agentId — Revoke agent access
// ---------------------------------------------------------------------------

async fn revoke_agent_access(
    State(state): State<AppState>,
    user: AuthUser,
    Path((capsule_id, agent_id)): Path<(Uuid, Uuid)>,
) -> Response {
    // Verify capsule ownership (owner_id is TEXT)
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM memory_capsules WHERE id = $1",
    )
    .bind(capsule_id)
    .fetch_optional(&state.db)
    .await;

    match owner {
        Ok(Some(ref oid)) if oid == &user.id => {}
        Ok(Some(_)) => {
            return (StatusCode::FORBIDDEN, Json(json!({"error": "Not your capsule"}))).into_response();
        }
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(json!({"error": "Capsule not found"}))).into_response();
        }
        Err(e) => {
            tracing::error!("revoke_agent_access: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"}))).into_response();
        }
    }

    if let Err(e) = sqlx::query(
        "DELETE FROM memory_capsule_grants WHERE capsule_id = $1 AND agent_id = $2",
    )
    .bind(capsule_id)
    .bind(agent_id)
    .execute(&state.db)
    .await
    {
        tracing::error!("revoke_agent_access: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to revoke access"}))).into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}

// ---------------------------------------------------------------------------
// GET /api/agent/capsules?query=<text>&limit=<n> — Agent queries granted capsules
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct AgentCapsuleQuery {
    query: String,
    limit: Option<i32>,
}

async fn agent_query_capsules(
    State(state): State<AppState>,
    agent: AuthAgent,
    Query(params): Query<AgentCapsuleQuery>,
) -> Response {
    let query = params.query.trim().to_string();
    if query.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "query parameter is required"})),
        )
            .into_response();
    }

    let limit = params.limit.unwrap_or(10).min(20).max(1);

    // Check for OpenAI API key (needed for embedding)
    let openai_key = match state.config.openai_api_key.as_deref() {
        Some(key) => key.to_string(),
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "Memory search is not available (embedding service not configured)"})),
            )
                .into_response();
        }
    };

    // Get capsule IDs granted to this agent (from both grant tables)
    let capsule_ids = sqlx::query_scalar::<_, Uuid>(
        r#"SELECT DISTINCT capsule_id FROM (
            SELECT capsule_id FROM memory_capsule_grants WHERE agent_id = $1
            UNION
            SELECT capsule_id FROM agent_capsule_access WHERE agent_id = $1
        ) sub"#,
    )
    .bind(agent.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    if capsule_ids.is_empty() {
        return (StatusCode::OK, Json(json!([]))).into_response();
    }

    // Generate embedding for the query
    let client = reqwest::Client::new();
    let query_texts = vec![query.clone()];
    let embeddings = match crate::services::embedding::generate_embeddings(
        &client,
        &openai_key,
        &query_texts,
        crate::services::embedding::EMBEDDING_MODEL,
    )
    .await
    {
        Ok(e) => e,
        Err(e) => {
            tracing::error!("agent_query_capsules: embedding failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to generate query embedding"})),
            )
                .into_response();
        }
    };

    let query_embedding = match embeddings.into_iter().next() {
        Some(emb) => emb,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Empty embedding response"})),
            )
                .into_response();
        }
    };

    // Run hybrid search
    match crate::services::memory::hybrid_search(&state.db, &capsule_ids, query_embedding, &query, limit).await {
        Ok(results) => {
            let items: Vec<serde_json::Value> = results
                .into_iter()
                .map(|r| {
                    json!({
                        "content": r.content,
                        "capsule_name": r.capsule_name,
                        "capsule_id": r.capsule_id,
                        "score": (r.score * 100.0).round() / 100.0,
                        "importance": r.importance,
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!(items))).into_response()
        }
        Err(e) => {
            tracing::error!("agent_query_capsules: search failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Memory search failed"})),
            )
                .into_response()
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/memory/capsules/{id}/entries — List entries in a capsule (paginated)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ListEntriesQuery {
    page: Option<i64>,
    per_page: Option<i64>,
}

async fn list_capsule_entries(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Query(params): Query<ListEntriesQuery>,
) -> Response {
    // Verify ownership
    let owner_check = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM memory_capsules WHERE id = $1 AND owner_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if owner_check == 0 {
        return (StatusCode::NOT_FOUND, Json(json!({"error": "Capsule not found"}))).into_response();
    }

    let page = params.page.unwrap_or(1).max(1);
    let per_page = params.per_page.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * per_page;

    let total = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM memory_entries WHERE capsule_id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    #[derive(sqlx::FromRow)]
    struct EntryRow {
        id: Uuid,
        content: String,
        importance: f64,
        tags: Vec<String>,
        source_start: Option<chrono::DateTime<chrono::Utc>>,
        source_end: Option<chrono::DateTime<chrono::Utc>>,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let rows = sqlx::query_as::<_, EntryRow>(
        r#"SELECT id, content, importance, tags, source_start, source_end, created_at
           FROM memory_entries
           WHERE capsule_id = $1
           ORDER BY source_end DESC NULLS LAST, created_at DESC
           LIMIT $2 OFFSET $3"#,
    )
    .bind(id)
    .bind(per_page)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let entries: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.id,
                "content": r.content,
                "importance": r.importance,
                "tags": r.tags,
                "sourceStart": r.source_start.map(|dt| dt.to_rfc3339()),
                "sourceEnd": r.source_end.map(|dt| dt.to_rfc3339()),
                "createdAt": r.created_at.to_rfc3339(),
            })
        })
        .collect();

    (
        StatusCode::OK,
        Json(json!({
            "entries": entries,
            "total": total,
            "page": page,
            "perPage": per_page,
        })),
    )
        .into_response()
}

// ---------------------------------------------------------------------------
// GET /api/memory/capsules/{id}/entries/search — Full-text search entries
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SearchEntriesQuery {
    query: String,
    limit: Option<i64>,
}

async fn search_capsule_entries(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Query(params): Query<SearchEntriesQuery>,
) -> Response {
    // Verify ownership
    let owner_check = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM memory_capsules WHERE id = $1 AND owner_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if owner_check == 0 {
        return (StatusCode::NOT_FOUND, Json(json!({"error": "Capsule not found"}))).into_response();
    }

    let limit = params.limit.unwrap_or(20).clamp(1, 100);

    #[derive(sqlx::FromRow)]
    struct SearchRow {
        id: Uuid,
        content: String,
        importance: f64,
        tags: Vec<String>,
        source_start: Option<chrono::DateTime<chrono::Utc>>,
        source_end: Option<chrono::DateTime<chrono::Utc>>,
        created_at: chrono::DateTime<chrono::Utc>,
        score: f32,
    }

    let rows = sqlx::query_as::<_, SearchRow>(
        r#"SELECT id, content, importance, tags, source_start, source_end, created_at,
                  ts_rank(search_vector, plainto_tsquery('english', $2)) AS score
           FROM memory_entries
           WHERE capsule_id = $1
             AND search_vector @@ plainto_tsquery('english', $2)
           ORDER BY score DESC
           LIMIT $3"#,
    )
    .bind(id)
    .bind(&params.query)
    .bind(limit)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let total = rows.len() as i64;
    let entries: Vec<Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.id,
                "content": r.content,
                "importance": r.importance,
                "tags": r.tags,
                "sourceStart": r.source_start.map(|dt| dt.to_rfc3339()),
                "sourceEnd": r.source_end.map(|dt| dt.to_rfc3339()),
                "createdAt": r.created_at.to_rfc3339(),
                "score": r.score,
            })
        })
        .collect();

    (
        StatusCode::OK,
        Json(json!({
            "entries": entries,
            "total": total,
        })),
    )
        .into_response()
}
