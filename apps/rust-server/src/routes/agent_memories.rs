use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, patch, post},
    Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

/// Path to the claude CLI binary on the staging server
const CLAUDE_CLI_PATH: &str = "/root/.local/bin/claude";

const EXTRACT_SYSTEM_PROMPT: &str = "\
Analyze this conversation and extract self-improvement memories for the AI agent. \
Output each memory as a JSON line (one per line) with fields: category, summary, detail, pattern_key. \
Categories: correction (user corrected the agent), preference (user preference discovered), \
knowledge (domain fact learned), error (mistake pattern to avoid). \
pattern_key: a short unique slug for dedup (e.g. \"prefer-formal-tone\", \"error-date-format\"). \
summary: one-line summary. detail: optional longer explanation. \
Output ONLY JSON lines, no markdown fences, no commentary. \
IMPORTANT: Write in the SAME LANGUAGE as the conversation.";

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/agent/memories",
            get(list_memories).post(create_memory),
        )
        .route(
            "/api/agent/memories/{id}",
            patch(update_memory).delete(delete_memory),
        )
        .route("/api/agent/memories/extract", post(extract_memories))
}

// ── Types ──────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ListQuery {
    agent_id: Uuid,
    tier: Option<String>,
    category: Option<String>,
}

#[derive(Deserialize)]
struct CreateBody {
    agent_id: Uuid,
    category: String,
    summary: String,
    detail: Option<String>,
    pattern_key: Option<String>,
}

#[derive(Deserialize)]
struct UpdateBody {
    category: Option<String>,
    tier: Option<String>,
    summary: Option<String>,
    detail: Option<String>,
}

#[derive(Deserialize)]
struct ExtractBody {
    agent_id: Uuid,
    conversation_id: Uuid,
    /// Optional: only process messages after this timestamp
    since: Option<String>,
}

#[derive(sqlx::FromRow)]
struct MemoryRow {
    id: Uuid,
    agent_id: Uuid,
    category: String,
    tier: String,
    summary: String,
    detail: Option<String>,
    pattern_key: Option<String>,
    hit_count: i32,
    source_conversation_id: Option<Uuid>,
    first_seen_at: chrono::DateTime<chrono::Utc>,
    last_used_at: chrono::DateTime<chrono::Utc>,
    created_at: chrono::DateTime<chrono::Utc>,
}

fn memory_to_json(m: &MemoryRow) -> Value {
    json!({
        "id": m.id,
        "agentId": m.agent_id,
        "category": m.category,
        "tier": m.tier,
        "summary": m.summary,
        "detail": m.detail,
        "patternKey": m.pattern_key,
        "hitCount": m.hit_count,
        "sourceConversationId": m.source_conversation_id,
        "firstSeenAt": m.first_seen_at.to_rfc3339(),
        "lastUsedAt": m.last_used_at.to_rfc3339(),
        "createdAt": m.created_at.to_rfc3339(),
    })
}

// ── Handlers ───────────────────────────────────────────────────────────────

async fn list_memories(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListQuery>,
) -> Response {
    // Verify ownership
    let owns = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM agents WHERE id = $1 AND owner_id = $2)",
    )
    .bind(q.agent_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    match owns {
        Ok(true) => {}
        Ok(false) => {
            return (StatusCode::FORBIDDEN, Json(json!({"error": "Not agent owner"}))).into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    }

    // Build query with optional filters
    let mut sql = String::from(
        "SELECT * FROM agent_memories WHERE agent_id = $1",
    );
    let mut bind_idx = 2u32;

    if q.tier.is_some() {
        sql.push_str(&format!(" AND tier = ${bind_idx}"));
        bind_idx += 1;
    }
    if q.category.is_some() {
        sql.push_str(&format!(" AND category = ${bind_idx}"));
    }
    sql.push_str(" ORDER BY last_used_at DESC LIMIT 200");

    let mut query = sqlx::query_as::<_, MemoryRow>(&sql).bind(q.agent_id);
    if let Some(ref tier) = q.tier {
        query = query.bind(tier);
    }
    if let Some(ref category) = q.category {
        query = query.bind(category);
    }

    match query.fetch_all(&state.db).await {
        Ok(rows) => {
            let items: Vec<Value> = rows.iter().map(memory_to_json).collect();
            Json(json!({ "memories": items })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn create_memory(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateBody>,
) -> Response {
    // Verify ownership
    let owns = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM agents WHERE id = $1 AND owner_id = $2)",
    )
    .bind(body.agent_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    match owns {
        Ok(true) => {}
        Ok(false) => {
            return (StatusCode::FORBIDDEN, Json(json!({"error": "Not agent owner"}))).into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    }

    let valid_categories = ["correction", "preference", "knowledge", "error"];
    if !valid_categories.contains(&body.category.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid category"})),
        )
            .into_response();
    }

    // Normalize pattern_key: treat empty/whitespace-only as None
    let pattern_key = body.pattern_key.as_deref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    // Upsert by pattern_key if provided
    let row = if let Some(ref pk) = pattern_key {
        sqlx::query_as::<_, MemoryRow>(
            r#"INSERT INTO agent_memories (agent_id, category, summary, detail, pattern_key)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (agent_id, pattern_key) DO UPDATE
                 SET summary = EXCLUDED.summary,
                     detail = EXCLUDED.detail,
                     hit_count = agent_memories.hit_count + 1,
                     last_used_at = NOW()
               RETURNING *"#,
        )
        .bind(body.agent_id)
        .bind(&body.category)
        .bind(&body.summary)
        .bind(&body.detail)
        .bind(pk)
        .fetch_one(&state.db)
        .await
    } else {
        sqlx::query_as::<_, MemoryRow>(
            r#"INSERT INTO agent_memories (agent_id, category, summary, detail)
               VALUES ($1, $2, $3, $4)
               RETURNING *"#,
        )
        .bind(body.agent_id)
        .bind(&body.category)
        .bind(&body.summary)
        .bind(&body.detail)
        .fetch_one(&state.db)
        .await
    };

    match row {
        Ok(m) => (StatusCode::CREATED, Json(memory_to_json(&m))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn update_memory(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateBody>,
) -> Response {
    // Verify ownership via join
    let existing = sqlx::query_as::<_, MemoryRow>(
        r#"SELECT am.* FROM agent_memories am
           JOIN agents a ON a.id = am.agent_id
           WHERE am.id = $1 AND a.owner_id = $2"#,
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    let existing = match existing {
        Ok(Some(m)) => m,
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(json!({"error": "Not found"}))).into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    };

    let category = body.category.as_deref().unwrap_or(&existing.category);
    let tier = body.tier.as_deref().unwrap_or(&existing.tier);
    let summary = body.summary.as_deref().unwrap_or(&existing.summary);
    let detail = body.detail.as_deref().or(existing.detail.as_deref());

    let valid_categories = ["correction", "preference", "knowledge", "error"];
    if !valid_categories.contains(&category) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid category"})),
        )
            .into_response();
    }
    let valid_tiers = ["hot", "warm", "cold"];
    if !valid_tiers.contains(&tier) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid tier"})),
        )
            .into_response();
    }

    match sqlx::query_as::<_, MemoryRow>(
        r#"UPDATE agent_memories
           SET category = $2, tier = $3, summary = $4, detail = $5, last_used_at = NOW()
           WHERE id = $1
           RETURNING *"#,
    )
    .bind(id)
    .bind(category)
    .bind(tier)
    .bind(summary)
    .bind(detail)
    .fetch_one(&state.db)
    .await
    {
        Ok(m) => Json(memory_to_json(&m)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn delete_memory(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let result = sqlx::query(
        r#"DELETE FROM agent_memories
           WHERE id = $1
             AND agent_id IN (SELECT id FROM agents WHERE owner_id = $2)"#,
    )
    .bind(id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Not found"}))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// Extract memories from a conversation using claude -p --model haiku
async fn extract_memories(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<ExtractBody>,
) -> Response {
    // Verify agent ownership
    let owns = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM agents WHERE id = $1 AND owner_id = $2)",
    )
    .bind(body.agent_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    match owns {
        Ok(true) => {}
        Ok(false) => {
            return (StatusCode::FORBIDDEN, Json(json!({"error": "Not agent owner"}))).into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    }

    // Verify user is in the conversation
    let in_conv = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM conversations c
            WHERE c.id = $1 AND (c.user_id = $2 OR EXISTS(
                SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $2
            ))
        )"#,
    )
    .bind(body.conversation_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    match in_conv {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Not in conversation"})),
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
    }

    // Fetch recent messages from the conversation
    let mut msg_sql = String::from(
        r#"SELECT
             CASE WHEN m.role::text = 'user' THEN COALESCE(u.name, 'User') ELSE COALESCE(a.name, 'Agent') END AS sender_name,
             m.content,
             m.created_at::timestamptz
           FROM messages m
           LEFT JOIN "user" u ON m.sender_user_id = u.id::text
           LEFT JOIN agents a ON m.sender_agent_id = a.id
           WHERE m.conversation_id = $1 AND m.content IS NOT NULL AND m.content != ''"#,
    );
    if body.since.is_some() {
        msg_sql.push_str(" AND m.created_at > $2::timestamptz");
    }
    msg_sql.push_str(" ORDER BY m.created_at ASC LIMIT 500");

    let messages: Vec<(String, String, chrono::DateTime<chrono::Utc>)> = {
        let result = if let Some(ref since) = body.since {
            sqlx::query_as(&msg_sql)
                .bind(body.conversation_id)
                .bind(since)
                .fetch_all(&state.db)
                .await
        } else {
            sqlx::query_as(&msg_sql)
                .bind(body.conversation_id)
                .fetch_all(&state.db)
                .await
        };
        match result {
            Ok(rows) => rows,
            Err(e) => {
                tracing::error!("extract_memories: failed to fetch messages: {e}");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("Failed to fetch messages: {e}")})),
                ).into_response();
            }
        }
    };

    if messages.is_empty() {
        return Json(json!({ "extracted": 0, "memories": [] })).into_response();
    }

    // Build conversation text for Claude
    let conv_text: String = messages
        .iter()
        .map(|(name, content, ts)| format!("[{}] {}: {}", ts.format("%H:%M"), name, content))
        .collect::<Vec<_>>()
        .join("\n");

    // Call claude -p --model haiku
    let output = match call_claude_extract(&conv_text).await {
        Ok(text) => text,
        Err(e) => {
            tracing::error!("claude extract failed: {e}");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Extraction failed: {e}")})),
            )
                .into_response();
        }
    };

    // Parse JSON lines from output
    let mut extracted: Vec<Value> = Vec::new();
    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() || !line.starts_with('{') {
            continue;
        }
        if let Ok(parsed) = serde_json::from_str::<Value>(line) {
            let category = parsed["category"].as_str().unwrap_or("knowledge");
            let summary = match parsed["summary"].as_str() {
                Some(s) if !s.is_empty() => s,
                _ => continue,
            };
            let detail = parsed["detail"].as_str();
            // Normalize pattern_key: treat empty/whitespace-only as None
            let pattern_key = parsed["pattern_key"]
                .as_str()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty());

            let valid_categories = ["correction", "preference", "knowledge", "error"];
            let cat = if valid_categories.contains(&category) {
                category
            } else {
                "knowledge"
            };

            // Upsert by pattern_key if non-empty, otherwise plain INSERT
            let row = if let Some(pk) = pattern_key {
                sqlx::query_as::<_, MemoryRow>(
                    r#"INSERT INTO agent_memories (agent_id, category, summary, detail, pattern_key, source_conversation_id)
                       VALUES ($1, $2, $3, $4, $5, $6)
                       ON CONFLICT (agent_id, pattern_key) DO UPDATE
                         SET summary = EXCLUDED.summary,
                             detail = EXCLUDED.detail,
                             hit_count = agent_memories.hit_count + 1,
                             last_used_at = NOW()
                       RETURNING *"#,
                )
                .bind(body.agent_id)
                .bind(cat)
                .bind(summary)
                .bind(detail)
                .bind(pk)
                .bind(body.conversation_id)
                .fetch_one(&state.db)
                .await
            } else {
                sqlx::query_as::<_, MemoryRow>(
                    r#"INSERT INTO agent_memories (agent_id, category, summary, detail, source_conversation_id)
                       VALUES ($1, $2, $3, $4, $5)
                       RETURNING *"#,
                )
                .bind(body.agent_id)
                .bind(cat)
                .bind(summary)
                .bind(detail)
                .bind(body.conversation_id)
                .fetch_one(&state.db)
                .await
            };

            if let Ok(m) = row {
                extracted.push(memory_to_json(&m));
            }
        }
    }

    Json(json!({
        "extracted": extracted.len(),
        "memories": extracted,
    }))
    .into_response()
}

/// Quick throttle check — call BEFORE tokio::spawn to avoid unnecessary task creation.
/// Returns true if extraction should proceed (watermark is stale or missing).
pub async fn should_extract_memories(db: &sqlx::PgPool, agent_id: Uuid, conversation_id: Uuid) -> bool {
    const THROTTLE_MINUTES: i64 = 30;

    let last: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT last_extracted_at FROM agent_memory_watermarks WHERE agent_id = $1 AND conversation_id = $2",
    )
    .bind(agent_id)
    .bind(conversation_id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();

    match last {
        Some(t) => (chrono::Utc::now() - t).num_minutes() >= THROTTLE_MINUTES,
        None => true,
    }
}

/// Auto-extract memories in the background after an agent reply completes.
/// Uses per-conversation watermarks; only updates watermark on success.
pub async fn maybe_extract_memories(db: &sqlx::PgPool, agent_id: Uuid, conversation_id: Uuid) {
    const THROTTLE_MINUTES: i64 = 30;

    // Read per-conversation watermark
    let last_extracted: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT last_extracted_at FROM agent_memory_watermarks WHERE agent_id = $1 AND conversation_id = $2",
    )
    .bind(agent_id)
    .bind(conversation_id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();

    if let Some(last) = last_extracted {
        if (chrono::Utc::now() - last).num_minutes() < THROTTLE_MINUTES {
            return;
        }
    }

    tracing::info!(
        "auto_extract_memories: starting for agent={} conv={}",
        agent_id, conversation_id
    );

    // Determine since timestamp from per-conversation watermark
    let since = last_extracted.map(|t| t.to_rfc3339());

    // Fetch recent messages (incremental if since is set)
    let mut msg_sql = String::from(
        r#"SELECT
             CASE WHEN m.role::text = 'user' THEN COALESCE(u.name, 'User') ELSE COALESCE(a.name, 'Agent') END AS sender_name,
             m.content,
             m.created_at::timestamptz
           FROM messages m
           LEFT JOIN "user" u ON m.sender_user_id = u.id::text
           LEFT JOIN agents a ON m.sender_agent_id = a.id
           WHERE m.conversation_id = $1 AND m.content IS NOT NULL AND m.content != ''"#,
    );
    if since.is_some() {
        msg_sql.push_str(" AND m.created_at > $2::timestamptz");
    }
    msg_sql.push_str(" ORDER BY m.created_at ASC LIMIT 500");

    let messages: Vec<(String, String, chrono::DateTime<chrono::Utc>)> = if let Some(ref s) = since {
        match sqlx::query_as(&msg_sql)
            .bind(conversation_id)
            .bind(s)
            .fetch_all(db)
            .await
        {
            Ok(rows) => rows,
            Err(e) => {
                tracing::error!("auto_extract_memories: failed to fetch messages: {e}");
                return;
            }
        }
    } else {
        match sqlx::query_as(&msg_sql)
            .bind(conversation_id)
            .fetch_all(db)
            .await
        {
            Ok(rows) => rows,
            Err(e) => {
                tracing::error!("auto_extract_memories: failed to fetch messages: {e}");
                return;
            }
        }
    };

    if messages.is_empty() {
        tracing::info!("auto_extract_memories: no new messages, skipping");
        return;
    }

    // Build conversation text for Claude
    let conv_text: String = messages
        .iter()
        .map(|(name, content, ts)| format!("[{}] {}: {}", ts.format("%H:%M"), name, content))
        .collect::<Vec<_>>()
        .join("\n");

    // Call claude CLI
    let output = match call_claude_extract(&conv_text).await {
        Ok(text) => text,
        Err(e) => {
            tracing::error!("auto_extract_memories: claude failed: {e}");
            return; // Do NOT update watermark — will retry next time
        }
    };

    // Parse JSON lines and upsert
    let mut count = 0u32;
    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() || !line.starts_with('{') {
            continue;
        }
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(line) {
            let category = parsed["category"].as_str().unwrap_or("knowledge");
            let summary = match parsed["summary"].as_str() {
                Some(s) if !s.is_empty() => s,
                _ => continue,
            };
            let detail = parsed["detail"].as_str();
            let pattern_key = parsed["pattern_key"]
                .as_str()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty());

            let valid_categories = ["correction", "preference", "knowledge", "error"];
            let cat = if valid_categories.contains(&category) { category } else { "knowledge" };

            let result = if let Some(pk) = pattern_key {
                sqlx::query(
                    r#"INSERT INTO agent_memories (agent_id, category, summary, detail, pattern_key, source_conversation_id)
                       VALUES ($1, $2, $3, $4, $5, $6)
                       ON CONFLICT (agent_id, pattern_key) DO UPDATE
                         SET summary = EXCLUDED.summary,
                             detail = EXCLUDED.detail,
                             hit_count = agent_memories.hit_count + 1,
                             last_used_at = NOW()"#,
                )
                .bind(agent_id)
                .bind(cat)
                .bind(summary)
                .bind(detail)
                .bind(pk)
                .bind(conversation_id)
                .execute(db)
                .await
            } else {
                sqlx::query(
                    r#"INSERT INTO agent_memories (agent_id, category, summary, detail, source_conversation_id)
                       VALUES ($1, $2, $3, $4, $5)"#,
                )
                .bind(agent_id)
                .bind(cat)
                .bind(summary)
                .bind(detail)
                .bind(conversation_id)
                .execute(db)
                .await
            };

            if result.is_ok() {
                count += 1;
            }
        }
    }

    // Only update watermark AFTER successful extraction
    let _ = sqlx::query(
        r#"INSERT INTO agent_memory_watermarks (agent_id, conversation_id, last_extracted_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (agent_id, conversation_id) DO UPDATE
             SET last_extracted_at = NOW()"#,
    )
    .bind(agent_id)
    .bind(conversation_id)
    .execute(db)
    .await;

    tracing::info!(
        "auto_extract_memories: done agent={} conv={} extracted={}",
        agent_id, conversation_id, count
    );
}

/// Call `claude -p --model haiku` to extract memories from conversation text
async fn call_claude_extract(conv_text: &str) -> anyhow::Result<String> {
    use anyhow::Context;
    use tokio::io::AsyncWriteExt;

    for attempt in 0..2u8 {
        let mut cmd = tokio::process::Command::new(CLAUDE_CLI_PATH);
        cmd.arg("-p")
            .arg("--model")
            .arg("haiku")
            .arg("--output-format")
            .arg("text")
            .arg("--system-prompt")
            .arg(EXTRACT_SYSTEM_PROMPT)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn().context("Failed to spawn claude CLI")?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(conv_text.as_bytes())
                .await
                .context("Failed to write to claude CLI stdin")?;
            drop(stdin);
        }

        let output = match tokio::time::timeout(
            std::time::Duration::from_secs(300),
            child.wait_with_output(),
        )
        .await
        {
            Ok(result) => result.context("claude CLI process failed")?,
            Err(_) => {
                if attempt == 0 {
                    tracing::warn!("Agent memory extract: claude CLI timed out, retrying...");
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    continue;
                }
                return Err(anyhow::anyhow!("claude CLI timed out after 5 min"));
            }
        };

        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout).to_string();
            if !text.trim().is_empty() {
                return Ok(text);
            }
            if attempt == 0 {
                tracing::warn!("Agent memory extract: empty output, retrying...");
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue;
            }
            return Err(anyhow::anyhow!("claude CLI returned empty output"));
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if attempt == 0 {
                tracing::warn!("Agent memory extract: CLI failed ({}), retrying... {}", output.status, stderr);
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue;
            }
            return Err(anyhow::anyhow!("claude CLI failed: {}", stderr));
        }
    }
    unreachable!()
}
