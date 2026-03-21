use axum::{
    body::Body,
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, patch, post},
    Router,
};
use futures::StreamExt;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;
use pgvector::Vector;

use crate::auth::middleware::AuthUser;
use crate::services::embedding::{chunk_text, generate_embeddings, EMBEDDING_MODEL};
use crate::services::llm::{self, ChatMessage, LlmCallOptions, LlmProvider};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Expert CRUD
        .route("/api/expert-hub", get(list_experts).post(create_expert))
        .route("/api/expert-hub/{id}", get(get_expert).patch(update_expert).delete(delete_expert))
        // Knowledge
        .route("/api/expert-hub/{id}/knowledge", get(list_knowledge).post(add_knowledge))
        .route("/api/expert-hub/{id}/knowledge/upload", post(upload_knowledge_file))
        .route("/api/expert-hub/{id}/knowledge/rebuild", post(rebuild_knowledge))
        // Ask
        .route("/api/expert-hub/{id}/ask", post(ask_expert))
        // History
        .route("/api/expert-hub/{id}/history", get(ask_history))
        // Examples
        .route("/api/expert-hub/{id}/examples", get(list_examples).post(add_example))
        .route("/api/expert-hub/{expertId}/examples/{exampleId}", patch(update_example).delete(delete_example))
        // Rating
        .route("/api/expert-hub/asks/{askId}/rate", patch(rate_ask))
        // Webhook test
        .route("/api/expert-hub/{id}/webhook/test", post(test_webhook))
}

// ─── list_experts ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ListExpertsQuery {
    search: Option<String>,
    category: Option<String>,
    sort: Option<String>, // "popular" or "newest"
    published_only: Option<bool>,
}

async fn list_experts(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ListExpertsQuery>,
) -> Response {
    let order = match q.sort.as_deref() {
        Some("popular") => "e.total_asks DESC",
        _ => "e.created_at DESC",
    };

    // Build dynamic query
    let mut binds: Vec<String> = vec![user.id.clone()];
    let mut conditions = if q.published_only.unwrap_or(false) {
        vec!["e.is_published = true".to_string()]
    } else {
        vec![format!("(e.is_published = true OR e.owner_id = $1)")]
    };

    if let Some(ref search) = q.search {
        binds.push(format!("%{}%", search.to_lowercase()));
        conditions.push(format!("(LOWER(e.name) LIKE ${} OR LOWER(e.description) LIKE ${})", binds.len(), binds.len()));
    }
    if let Some(ref cat) = q.category {
        binds.push(cat.clone());
        conditions.push(format!("e.category = ${}", binds.len()));
    }

    let where_clause = conditions.join(" AND ");
    let sql = format!(
        r#"SELECT e.id, e.name, e.description, e.avatar_url, e.category, e.price_per_ask,
                  e.total_asks, e.avg_rating, e.free_trial_count,
                  u.name AS owner_name, u.image AS owner_image, u.username AS owner_username
           FROM experts e
           JOIN "user" u ON u.id = e.owner_id
           WHERE {}
           ORDER BY {}
           LIMIT 50"#,
        where_clause, order
    );

    // Use dynamic query with sqlx::query
    let mut query = sqlx::query(&sql);
    for b in &binds {
        query = query.bind(b);
    }

    let rows = query.fetch_all(&state.db).await;

    match rows {
        Ok(rows) => {
            use sqlx::Row;
            let experts: Vec<serde_json::Value> = rows.iter().map(|r| {
                json!({
                    "id": r.get::<Uuid, _>("id"),
                    "name": r.get::<String, _>("name"),
                    "description": r.get::<Option<String>, _>("description"),
                    "avatarUrl": r.get::<Option<String>, _>("avatar_url"),
                    "category": r.get::<String, _>("category"),
                    "pricePerAsk": r.get::<i32, _>("price_per_ask"),
                    "totalAsks": r.get::<i32, _>("total_asks"),
                    "avgRating": r.get::<Option<f64>, _>("avg_rating"),
                    "freeTrialCount": r.get::<i32, _>("free_trial_count"),
                    "ownerName": r.get::<String, _>("owner_name"),
                    "ownerImage": r.get::<Option<String>, _>("owner_image"),
                    "ownerUsername": r.get::<Option<String>, _>("owner_username"),
                })
            }).collect();
            Json(json!({ "experts": experts })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ─── get_expert ──────────────────────────────────────────────────────────────

async fn get_expert(State(state): State<AppState>, user: AuthUser, Path(id): Path<Uuid>) -> Response {
    let expert = sqlx::query_as::<_, (Uuid, String, String, Option<String>, Option<String>, String, i32, String, Option<String>, bool, i32, i32, i32, Option<f64>, chrono::DateTime<chrono::Utc>)>(
        r#"SELECT e.id, e.owner_id, e.name, e.description, e.avatar_url, e.category, e.price_per_ask, e.mode, e.webhook_url, e.is_published, e.free_trial_count, e.total_asks, e.total_revenue, e.avg_rating, e.created_at
           FROM experts e WHERE e.id = $1"#
    ).bind(id).fetch_optional(&state.db).await;

    match expert {
        Ok(Some(e)) => {
            let is_owner = e.1 == user.id;
            // Non-owner can only see published experts
            if !is_owner && !e.9 {
                return (StatusCode::NOT_FOUND, Json(json!({"error": "Expert not found"}))).into_response();
            }

            let examples = sqlx::query_as::<_, (Uuid, String, String, i32)>(
                "SELECT id, question, answer, sort_order FROM expert_examples WHERE expert_id = $1 ORDER BY sort_order"
            ).bind(id).fetch_all(&state.db).await.unwrap_or_default();

            let owner = sqlx::query_as::<_, (String, Option<String>, Option<String>)>(
                r#"SELECT name, image, username FROM "user" WHERE id = $1"#
            ).bind(&e.1).fetch_optional(&state.db).await.ok().flatten();

            Json(json!({
                "id": e.0,
                "ownerId": e.1,
                "name": e.2,
                "description": e.3,
                "avatarUrl": e.4,
                "category": e.5,
                "pricePerAsk": e.6,
                "mode": e.7,
                "webhookUrl": if is_owner { e.8.clone() } else { None },
                "isPublished": e.9,
                "freeTrialCount": e.10,
                "totalAsks": e.11,
                "totalRevenue": if is_owner { e.12 } else { 0 },
                "avgRating": e.13,
                "createdAt": e.14.to_rfc3339(),
                "owner": owner.map(|(name, image, username)| json!({"name": name, "image": image, "username": username})),
                "examples": examples.iter().map(|(id, q, a, so)| json!({"id": id, "question": q, "answer": a, "sortOrder": so})).collect::<Vec<_>>(),
            })).into_response()
        }
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({"error": "Expert not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ─── create_expert ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateExpertBody {
    name: String,
    description: Option<String>,
    category: Option<String>,
    price_per_ask: Option<i32>,
    mode: Option<String>,
}

async fn create_expert(State(state): State<AppState>, user: AuthUser, Json(body): Json<CreateExpertBody>) -> Response {
    let name = body.name.trim();
    if name.is_empty() || name.len() > 200 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Name required (max 200 chars)"}))).into_response();
    }
    let category = body.category.unwrap_or_else(|| "general".to_string());
    let price = body.price_per_ask.unwrap_or(10).max(0);
    let mode = body.mode.unwrap_or_else(|| "managed".to_string());
    if mode != "managed" && mode != "webhook" {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Mode must be 'managed' or 'webhook'"}))).into_response();
    }

    let row = sqlx::query_as::<_, (Uuid, chrono::DateTime<chrono::Utc>)>(
        "INSERT INTO experts (owner_id, name, description, category, price_per_ask, mode) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at"
    )
    .bind(&user.id).bind(name).bind(&body.description).bind(&category).bind(price).bind(&mode)
    .fetch_one(&state.db).await;

    match row {
        Ok((id, created_at)) => (StatusCode::CREATED, Json(json!({
            "id": id, "name": name, "category": category, "pricePerAsk": price, "mode": mode, "createdAt": created_at.to_rfc3339(),
        }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ─── update_expert ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateExpertBody {
    name: Option<String>,
    description: Option<String>,
    category: Option<String>,
    price_per_ask: Option<i32>,
    is_published: Option<bool>,
    avatar_url: Option<String>,
    mode: Option<String>,
    webhook_url: Option<String>,
    free_trial_count: Option<i32>,
}

async fn update_expert(State(state): State<AppState>, user: AuthUser, Path(id): Path<Uuid>, Json(body): Json<UpdateExpertBody>) -> Response {
    // Verify ownership
    let is_owner = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM experts WHERE id = $1 AND owner_id = $2)")
        .bind(id).bind(&user.id).fetch_one(&state.db).await.unwrap_or(false);
    if !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not the expert owner"}))).into_response();
    }

    // Build dynamic SET clause
    let mut sets = vec!["updated_at = NOW()".to_string()];
    let mut bind_idx = 3u32; // $1=id, $2=user_id already used
    let mut binds: Vec<String> = vec![];

    if let Some(ref name) = body.name { sets.push(format!("name = ${bind_idx}")); binds.push(name.clone()); bind_idx += 1; }
    if let Some(ref desc) = body.description { sets.push(format!("description = ${bind_idx}")); binds.push(desc.clone()); bind_idx += 1; }
    if let Some(ref cat) = body.category { sets.push(format!("category = ${bind_idx}")); binds.push(cat.clone()); bind_idx += 1; }
    if let Some(ref avatar) = body.avatar_url { sets.push(format!("avatar_url = ${bind_idx}")); binds.push(avatar.clone()); bind_idx += 1; }
    if let Some(ref mode) = body.mode { sets.push(format!("mode = ${bind_idx}")); binds.push(mode.clone()); bind_idx += 1; }
    if let Some(ref wh) = body.webhook_url { sets.push(format!("webhook_url = ${bind_idx}")); binds.push(wh.clone()); bind_idx += 1; }
    let _ = bind_idx; // suppress unused assignment warning

    // For these we need different types, so handle separately with direct queries
    if let Some(price) = body.price_per_ask {
        let _ = sqlx::query("UPDATE experts SET price_per_ask = $1 WHERE id = $2").bind(price).bind(id).execute(&state.db).await;
    }
    if let Some(published) = body.is_published {
        if published {
            let has_knowledge = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM expert_knowledge WHERE expert_id = $1)"
            ).bind(id).fetch_one(&state.db).await.unwrap_or(false);
            if !has_knowledge {
                return (StatusCode::BAD_REQUEST, Json(json!({"error": "knowledge_required", "message": "Add knowledge before publishing"}))).into_response();
            }
        }
        let _ = sqlx::query("UPDATE experts SET is_published = $1 WHERE id = $2").bind(published).bind(id).execute(&state.db).await;
    }
    if let Some(ftc) = body.free_trial_count {
        let _ = sqlx::query("UPDATE experts SET free_trial_count = $1 WHERE id = $2").bind(ftc).bind(id).execute(&state.db).await;
    }

    if !binds.is_empty() {
        let sql = format!("UPDATE experts SET {} WHERE id = $1 AND owner_id = $2", sets.join(", "));
        let mut query = sqlx::query(&sql);
        query = query.bind(id).bind(&user.id);
        for b in &binds {
            query = query.bind(b);
        }
        let _ = query.execute(&state.db).await;
    }

    Json(json!({"ok": true})).into_response()
}

// ─── delete_expert ───────────────────────────────────────────────────────────

async fn delete_expert(State(state): State<AppState>, user: AuthUser, Path(id): Path<Uuid>) -> Response {
    let result = sqlx::query("DELETE FROM experts WHERE id = $1 AND owner_id = $2")
        .bind(id).bind(&user.id).execute(&state.db).await;
    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Expert not found or not owner"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ─── add_knowledge ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct AddKnowledgeBody {
    content: String,
}

async fn add_knowledge(State(state): State<AppState>, user: AuthUser, Path(id): Path<Uuid>, Json(body): Json<AddKnowledgeBody>) -> Response {
    let is_owner = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM experts WHERE id = $1 AND owner_id = $2)")
        .bind(id).bind(&user.id).fetch_one(&state.db).await.unwrap_or(false);
    if !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not the expert owner"}))).into_response();
    }

    let content = body.content.trim();
    if content.is_empty() || content.len() > 50000 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Content required (max 50000 chars)"}))).into_response();
    }

    let api_key = state.config.openai_api_key.as_deref().unwrap_or("");
    if api_key.is_empty() {
        // Store without embedding
        let row = sqlx::query_as::<_, (Uuid,)>(
            "INSERT INTO expert_knowledge (expert_id, raw_content, chunk_index) VALUES ($1, $2, 0) RETURNING id"
        ).bind(id).bind(content).fetch_one(&state.db).await;
        return match row {
            Ok((kid,)) => (StatusCode::CREATED, Json(json!({"id": kid, "embedded": false}))).into_response(),
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
        };
    }

    // Chunk using char-boundary-safe helper (500 chars, 50 char overlap)
    let chunk_strings = chunk_text(content, 500, 50);

    let client = reqwest::Client::new();
    let embeddings = generate_embeddings(&client, api_key, &chunk_strings, EMBEDDING_MODEL).await;

    match embeddings {
        Ok(embs) => {
            let mut ids = vec![];
            for (i, (chunk, emb)) in chunk_strings.iter().zip(embs.iter()).enumerate() {
                let vec = Vector::from(emb.clone());
                let row = sqlx::query_as::<_, (Uuid,)>(
                    "INSERT INTO expert_knowledge (expert_id, raw_content, embedding, chunk_index) VALUES ($1, $2, $3, $4) RETURNING id"
                ).bind(id).bind(chunk).bind(vec).bind(i as i32).fetch_one(&state.db).await;
                if let Ok((kid,)) = row { ids.push(kid); }
            }
            (StatusCode::CREATED, Json(json!({"chunks": ids.len(), "embedded": true}))).into_response()
        }
        Err(e) => {
            // Fallback: store without embedding
            let _ = sqlx::query(
                "INSERT INTO expert_knowledge (expert_id, raw_content, chunk_index) VALUES ($1, $2, 0)"
            ).bind(id).bind(content).execute(&state.db).await;
            (StatusCode::CREATED, Json(json!({"chunks": 1, "embedded": false, "embeddingError": e.to_string()}))).into_response()
        }
    }
}

// ─── upload_knowledge_file ───────────────────────────────────────────────────

async fn upload_knowledge_file(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    mut multipart: Multipart,
) -> Response {
    let is_owner = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM experts WHERE id = $1 AND owner_id = $2)")
        .bind(id).bind(&user.id).fetch_one(&state.db).await.unwrap_or(false);
    if !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not the expert owner"}))).into_response();
    }

    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() != Some("file") { continue; }
        let filename = field.file_name().unwrap_or("unknown").to_string();
        let data = match field.bytes().await {
            Ok(d) => d,
            Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({"error": "Failed to read file"}))).into_response(),
        };
        if data.len() > 10 * 1024 * 1024 {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "File must be under 10MB"}))).into_response();
        }

        // Extract text based on file extension
        let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
        let text = match ext.as_str() {
            "txt" | "md" => String::from_utf8_lossy(&data).to_string(),
            "pdf" => {
                // Try pdf-extract; fallback to raw text extraction
                match pdf_extract::extract_text_from_mem(&data) {
                    Ok(t) => t,
                    Err(_) => String::from_utf8_lossy(&data).to_string(),
                }
            }
            _ => {
                return (StatusCode::BAD_REQUEST, Json(json!({"error": "Supported formats: .txt, .md, .pdf"}))).into_response();
            }
        };

        let text = text.trim().to_string();
        if text.is_empty() {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "No text extracted from file"}))).into_response();
        }
        if text.len() > 100000 {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "Extracted text too long (max 100000 chars)"}))).into_response();
        }

        // Use same chunking + embedding logic as add_knowledge
        let api_key = state.config.openai_api_key.as_deref().unwrap_or("");
        if api_key.is_empty() {
            let row = sqlx::query_as::<_, (Uuid,)>(
                "INSERT INTO expert_knowledge (expert_id, raw_content, chunk_index) VALUES ($1, $2, 0) RETURNING id"
            ).bind(id).bind(&text).fetch_one(&state.db).await;
            return match row {
                Ok((kid,)) => (StatusCode::CREATED, Json(json!({"id": kid, "chunks": 1, "embedded": false, "filename": filename}))).into_response(),
                Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
            };
        }

        let chunks = chunk_text(&text, 500, 50);
        let client = reqwest::Client::new();
        match generate_embeddings(&client, api_key, &chunks, EMBEDDING_MODEL).await {
            Ok(embs) => {
                let mut count = 0;
                for (i, (chunk, emb)) in chunks.iter().zip(embs.iter()).enumerate() {
                    let vec = Vector::from(emb.clone());
                    let _ = sqlx::query(
                        "INSERT INTO expert_knowledge (expert_id, raw_content, embedding, chunk_index) VALUES ($1, $2, $3, $4)"
                    ).bind(id).bind(chunk).bind(vec).bind(i as i32).execute(&state.db).await;
                    count += 1;
                }
                return (StatusCode::CREATED, Json(json!({"chunks": count, "embedded": true, "filename": filename}))).into_response();
            }
            Err(e) => {
                let _ = sqlx::query(
                    "INSERT INTO expert_knowledge (expert_id, raw_content, chunk_index) VALUES ($1, $2, 0)"
                ).bind(id).bind(&text).execute(&state.db).await;
                return (StatusCode::CREATED, Json(json!({"chunks": 1, "embedded": false, "filename": filename, "embeddingError": e.to_string()}))).into_response();
            }
        }
    }
    (StatusCode::BAD_REQUEST, Json(json!({"error": "No file field"}))).into_response()
}

// ─── list_knowledge ──────────────────────────────────────────────────────────

async fn list_knowledge(State(state): State<AppState>, user: AuthUser, Path(id): Path<Uuid>) -> Response {
    let is_owner = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM experts WHERE id = $1 AND owner_id = $2)")
        .bind(id).bind(&user.id).fetch_one(&state.db).await.unwrap_or(false);
    if !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not the expert owner"}))).into_response();
    }

    let rows = sqlx::query_as::<_, (Uuid, String, i32, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, raw_content, chunk_index, created_at FROM expert_knowledge WHERE expert_id = $1 ORDER BY chunk_index"
    ).bind(id).fetch_all(&state.db).await;

    match rows {
        Ok(rows) => {
            let chunks: Vec<_> = rows.iter().map(|(kid, content, idx, created)| json!({
                "id": kid, "content": content, "chunkIndex": idx, "createdAt": created.to_rfc3339(),
            })).collect();
            Json(json!({"chunks": chunks})).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ─── rebuild_knowledge ───────────────────────────────────────────────────────

async fn rebuild_knowledge(State(state): State<AppState>, user: AuthUser, Path(id): Path<Uuid>) -> Response {
    let is_owner = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM experts WHERE id = $1 AND owner_id = $2)")
        .bind(id).bind(&user.id).fetch_one(&state.db).await.unwrap_or(false);
    if !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not the expert owner"}))).into_response();
    }

    // Fetch all raw content
    let rows = sqlx::query_as::<_, (String,)>(
        "SELECT raw_content FROM expert_knowledge WHERE expert_id = $1 ORDER BY chunk_index"
    ).bind(id).fetch_all(&state.db).await.unwrap_or_default();

    let all_content: String = rows.iter().map(|(c,)| c.as_str()).collect::<Vec<_>>().join("\n");

    // Delete existing
    let _ = sqlx::query("DELETE FROM expert_knowledge WHERE expert_id = $1").bind(id).execute(&state.db).await;

    if all_content.is_empty() {
        return Json(json!({"rebuilt": 0})).into_response();
    }

    let api_key = state.config.openai_api_key.as_deref().unwrap_or("");
    if api_key.is_empty() {
        let _ = sqlx::query("INSERT INTO expert_knowledge (expert_id, raw_content, chunk_index) VALUES ($1, $2, 0)")
            .bind(id).bind(&all_content).execute(&state.db).await;
        return Json(json!({"rebuilt": 1, "embedded": false})).into_response();
    }

    let chunks = chunk_text(&all_content, 500, 50);

    let client = reqwest::Client::new();
    match generate_embeddings(&client, api_key, &chunks, EMBEDDING_MODEL).await {
        Ok(embs) => {
            for (i, (chunk, emb)) in chunks.iter().zip(embs.iter()).enumerate() {
                let vec = Vector::from(emb.clone());
                let _ = sqlx::query("INSERT INTO expert_knowledge (expert_id, raw_content, embedding, chunk_index) VALUES ($1, $2, $3, $4)")
                    .bind(id).bind(chunk).bind(vec).bind(i as i32).execute(&state.db).await;
            }
            Json(json!({"rebuilt": chunks.len(), "embedded": true})).into_response()
        }
        Err(e) => {
            let _ = sqlx::query("INSERT INTO expert_knowledge (expert_id, raw_content, chunk_index) VALUES ($1, $2, 0)")
                .bind(id).bind(&all_content).execute(&state.db).await;
            Json(json!({"rebuilt": 1, "embedded": false, "error": e.to_string()})).into_response()
        }
    }
}

// ─── ask_expert ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct AskExpertBody {
    question: String,
}

async fn ask_expert(State(state): State<AppState>, user: AuthUser, Path(id): Path<Uuid>, Json(body): Json<AskExpertBody>) -> Response {
    let question = body.question.trim();
    if question.is_empty() || question.len() > 2000 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Question required (max 2000 chars)"}))).into_response();
    }

    // Fetch expert
    let expert = sqlx::query_as::<_, (String, i32, String, Option<String>)>(
        "SELECT name, price_per_ask, mode, webhook_url FROM experts WHERE id = $1 AND is_published = true"
    ).bind(id).fetch_optional(&state.db).await;

    let (expert_name, price, mode, webhook_url) = match expert {
        Ok(Some(e)) => e,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Expert not found or not published"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    // Pre-check balance (don't deduct yet — deduct after successful LLM response)
    if price > 0 {
        let balance = sqlx::query_scalar::<_, i32>(
            "SELECT COALESCE(balance, 0) FROM coin_balances WHERE user_id = $1"
        ).bind(&user.id).fetch_optional(&state.db).await.ok().flatten().unwrap_or(0);

        if balance < price {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "insufficient_balance"}))).into_response();
        }
    }

    // Webhook mode: forward to A2A endpoint
    if mode == "webhook" {
        let wh_url = match webhook_url {
            Some(ref url) if !url.is_empty() => url.clone(),
            _ => return (StatusCode::BAD_REQUEST, Json(json!({"error": "Expert has no webhook URL configured"}))).into_response(),
        };

        let ask_id = Uuid::new_v4();
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
        let a2a_result = crate::a2a::client::stream_a2a_response(
            &wh_url, question, &ask_id.to_string(), cancel_rx,
        ).await;

        let (mut chunk_rx, handle) = match a2a_result {
            Ok(r) => r,
            Err(e) => return (StatusCode::BAD_GATEWAY, Json(json!({"error": e}))).into_response(),
        };

        let db = state.db.clone();
        let user_id = user.id.clone();
        let expert_id = id;
        let q = question.to_string();
        let expert_name_clone = format!("Expert: {}", expert_name);

        let output_stream = async_stream::stream! {
            let mut full_content = String::new();
            while let Some(chunk) = chunk_rx.recv().await {
                full_content.push_str(&chunk);
                let event = serde_json::json!({"type": "chunk", "content": chunk});
                yield Ok::<_, std::convert::Infallible>(format!("data: {}\n\n", event));
            }

            // Wait for completion
            if let Ok(Ok(final_content)) = handle.await {
                if final_content.len() > full_content.len() {
                    let remaining = &final_content[full_content.len()..];
                    if !remaining.is_empty() {
                        full_content.push_str(remaining);
                        let event = serde_json::json!({"type": "chunk", "content": remaining});
                        yield Ok(format!("data: {}\n\n", event));
                    }
                }
            }

            // Deduct balance after successful response
            if price > 0 && !full_content.is_empty() {
                let _ = sqlx::query(
                    "UPDATE coin_balances SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2 AND balance >= $1"
                ).bind(price).bind(&user_id).execute(&db).await;
                let _ = sqlx::query(
                    "INSERT INTO coin_transactions (id, user_id, type, amount, description) VALUES ($1, $2, 'expert_ask', $3, $4)"
                ).bind(Uuid::new_v4()).bind(&user_id).bind(-price).bind(&expert_name_clone).execute(&db).await;
            }

            let _ = sqlx::query(
                "INSERT INTO expert_asks (id, expert_id, user_id, question, answer, cost) VALUES ($1, $2, $3, $4, $5, $6)"
            ).bind(ask_id).bind(expert_id).bind(&user_id).bind(&q).bind(&full_content).bind(if full_content.is_empty() { 0 } else { price }).execute(&db).await;

            if !full_content.is_empty() {
                let _ = sqlx::query(
                    "UPDATE experts SET total_asks = total_asks + 1, total_revenue = total_revenue + $1, updated_at = NOW() WHERE id = $2"
                ).bind(price).bind(expert_id).execute(&db).await;
            }

            let done = serde_json::json!({"type": "done", "content": full_content, "askId": ask_id});
            yield Ok(format!("data: {}\n\n", done));
        };

        drop(cancel_tx);
        return Response::builder()
            .status(200)
            .header("Content-Type", "text/event-stream")
            .header("Cache-Control", "no-cache")
            .header("Connection", "keep-alive")
            .body(Body::from_stream(output_stream))
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
    }

    // RAG: embed question -> search knowledge -> build prompt
    let api_key = state.config.openai_api_key.as_deref().unwrap_or("");
    let mut context_chunks: Vec<String> = vec![];

    if !api_key.is_empty() {
        let client = reqwest::Client::new();
        if let Ok(embs) = generate_embeddings(&client, api_key, &[question.to_string()], EMBEDDING_MODEL).await {
            if let Some(q_emb) = embs.into_iter().next() {
                let vec = Vector::from(q_emb);
                let results = sqlx::query_as::<_, (String,)>(
                    r#"SELECT raw_content FROM expert_knowledge
                       WHERE expert_id = $1 AND embedding IS NOT NULL
                       ORDER BY embedding <=> $2::vector
                       LIMIT 5"#
                ).bind(id).bind(vec).fetch_all(&state.db).await.unwrap_or_default();
                context_chunks = results.into_iter().map(|(c,)| c).collect();
            }
        }
    }

    // Fallback: if no embeddings, get all knowledge
    if context_chunks.is_empty() {
        let rows = sqlx::query_as::<_, (String,)>(
            "SELECT raw_content FROM expert_knowledge WHERE expert_id = $1 ORDER BY chunk_index LIMIT 10"
        ).bind(id).fetch_all(&state.db).await.unwrap_or_default();
        context_chunks = rows.into_iter().map(|(c,)| c).collect();
    }

    // Fetch examples for few-shot
    let examples = sqlx::query_as::<_, (String, String)>(
        "SELECT question, answer FROM expert_examples WHERE expert_id = $1 ORDER BY sort_order LIMIT 3"
    ).bind(id).fetch_all(&state.db).await.unwrap_or_default();

    // Build system prompt
    let mut system = format!("You are '{}', an expert assistant. Answer questions based on your knowledge base.\n\n", expert_name);
    if !context_chunks.is_empty() {
        system.push_str("[Knowledge Base]\n");
        for chunk in &context_chunks {
            system.push_str(chunk);
            system.push('\n');
        }
        system.push('\n');
    }
    if !examples.is_empty() {
        system.push_str("[Example Q&A]\n");
        for (q, a) in &examples {
            system.push_str(&format!("Q: {}\nA: {}\n\n", q, a));
        }
    }
    system.push_str("Answer concisely and accurately based on the knowledge provided.");

    // Determine LLM provider
    let (provider, llm_key, model) = if let Some(ref key) = state.config.anthropic_api_key {
        (LlmProvider::Anthropic, key.clone(), "claude-haiku-4-5-20251001".to_string())
    } else if let Some(ref key) = state.config.openai_api_key {
        (LlmProvider::OpenAI, key.clone(), "gpt-4o-mini".to_string())
    } else {
        return (StatusCode::SERVICE_UNAVAILABLE, Json(json!({"error": "No LLM provider configured"}))).into_response();
    };

    let opts = LlmCallOptions {
        provider: provider.clone(),
        model,
        api_key: llm_key,
        messages: vec![
            ChatMessage { role: "system".into(), content: system },
            ChatMessage { role: "user".into(), content: question.to_string() },
        ],
        max_tokens: Some(2048),
        temperature: Some(0.3),
    };

    let sse_stream = match llm::call_llm_stream(&opts).await {
        Ok(s) => s,
        Err(e) => return (StatusCode::BAD_GATEWAY, Json(json!({"error": e}))).into_response(),
    };

    let parser = match provider {
        LlmProvider::OpenAI => llm::parse_openai_chunk as fn(&str) -> Option<String>,
        LlmProvider::Anthropic => llm::parse_anthropic_chunk as fn(&str) -> Option<String>,
    };

    let ask_id = Uuid::new_v4();
    let db = state.db.clone();
    let user_id = user.id.clone();
    let expert_id = id;
    let q = question.to_string();
    let expert_name_clone = format!("Expert: {}", expert_name);

    let output_stream = async_stream::stream! {
        let mut buf = String::new();
        let mut stream = sse_stream;
        let mut full_content = String::new();

        while let Some(chunk_result) = stream.next().await {
            let bytes = match chunk_result {
                Ok(b) => b,
                Err(_) => break,
            };
            buf.push_str(&String::from_utf8_lossy(&bytes));

            while let Some(pos) = buf.find('\n') {
                let line = buf[..pos].trim().to_string();
                buf = buf[pos + 1..].to_string();
                if let Some(data) = line.strip_prefix("data: ") {
                    if let Some(text) = parser(data) {
                        full_content.push_str(&text);
                        let event = serde_json::json!({"type": "chunk", "content": text});
                        yield Ok::<_, std::convert::Infallible>(format!("data: {}\n\n", event));
                    }
                }
            }
        }

        // Deduct balance AFTER successful LLM response
        if price > 0 && !full_content.is_empty() {
            let _ = sqlx::query(
                "UPDATE coin_balances SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2 AND balance >= $1"
            ).bind(price).bind(&user_id).execute(&db).await;
            let _ = sqlx::query(
                "INSERT INTO coin_transactions (id, user_id, type, amount, description) VALUES ($1, $2, 'expert_ask', $3, $4)"
            ).bind(Uuid::new_v4()).bind(&user_id).bind(-price).bind(&expert_name_clone).execute(&db).await;
        }

        // Save ask record
        let _ = sqlx::query(
            "INSERT INTO expert_asks (id, expert_id, user_id, question, answer, cost) VALUES ($1, $2, $3, $4, $5, $6)"
        ).bind(ask_id).bind(expert_id).bind(&user_id).bind(&q).bind(&full_content).bind(if full_content.is_empty() { 0 } else { price }).execute(&db).await;

        // Update stats
        if !full_content.is_empty() {
            let _ = sqlx::query(
                "UPDATE experts SET total_asks = total_asks + 1, total_revenue = total_revenue + $1, updated_at = NOW() WHERE id = $2"
            ).bind(price).bind(expert_id).execute(&db).await;
        }

        let done = serde_json::json!({"type": "done", "content": full_content, "askId": ask_id});
        yield Ok(format!("data: {}\n\n", done));
    };

    Response::builder()
        .status(200)
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .body(Body::from_stream(output_stream))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

// ─── ask_history ─────────────────────────────────────────────────────────────

async fn ask_history(State(state): State<AppState>, user: AuthUser, Path(id): Path<Uuid>) -> Response {
    let rows = sqlx::query_as::<_, (Uuid, String, Option<String>, i32, Option<i32>, chrono::DateTime<chrono::Utc>)>(
        "SELECT id, question, answer, cost, rating, created_at FROM expert_asks WHERE expert_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 50"
    ).bind(id).bind(&user.id).fetch_all(&state.db).await;

    match rows {
        Ok(rows) => {
            let asks: Vec<_> = rows.iter().map(|(aid, q, a, cost, rating, created)| json!({
                "id": aid, "question": q, "answer": a, "cost": cost, "rating": rating, "createdAt": created.to_rfc3339(),
            })).collect();
            Json(json!({"asks": asks})).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ─── list_examples ──────────────────────────────────────────────────────────

async fn list_examples(State(state): State<AppState>, _user: AuthUser, Path(id): Path<Uuid>) -> Response {
    let rows = sqlx::query_as::<_, (Uuid, String, String, i32)>(
        "SELECT id, question, answer, sort_order FROM expert_examples WHERE expert_id = $1 ORDER BY sort_order"
    ).bind(id).fetch_all(&state.db).await;
    match rows {
        Ok(items) => Json(json!({
            "examples": items.iter().map(|(eid, q, a, so)| json!({"id": eid, "question": q, "answer": a, "sortOrder": so})).collect::<Vec<_>>()
        })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ─── add_example ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct AddExampleBody {
    question: String,
    answer: String,
}

async fn add_example(State(state): State<AppState>, user: AuthUser, Path(id): Path<Uuid>, Json(body): Json<AddExampleBody>) -> Response {
    let is_owner = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM experts WHERE id = $1 AND owner_id = $2)")
        .bind(id).bind(&user.id).fetch_one(&state.db).await.unwrap_or(false);
    if !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not the expert owner"}))).into_response();
    }

    let max_order = sqlx::query_scalar::<_, Option<i32>>(
        "SELECT MAX(sort_order) FROM expert_examples WHERE expert_id = $1"
    ).bind(id).fetch_one(&state.db).await.unwrap_or(None).unwrap_or(-1);

    let row = sqlx::query_as::<_, (Uuid,)>(
        "INSERT INTO expert_examples (expert_id, question, answer, sort_order) VALUES ($1, $2, $3, $4) RETURNING id"
    ).bind(id).bind(&body.question).bind(&body.answer).bind(max_order + 1).fetch_one(&state.db).await;

    match row {
        Ok((eid,)) => (StatusCode::CREATED, Json(json!({"id": eid}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ─── delete_example ──────────────────────────────────────────────────────────

async fn delete_example(State(state): State<AppState>, user: AuthUser, Path((expert_id, example_id)): Path<(Uuid, Uuid)>) -> Response {
    let is_owner = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM experts WHERE id = $1 AND owner_id = $2)")
        .bind(expert_id).bind(&user.id).fetch_one(&state.db).await.unwrap_or(false);
    if !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not the expert owner"}))).into_response();
    }

    let result = sqlx::query("DELETE FROM expert_examples WHERE id = $1 AND expert_id = $2")
        .bind(example_id).bind(expert_id).execute(&state.db).await;
    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Example not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ─── update_example ─────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct UpdateExampleBody {
    question: Option<String>,
    answer: Option<String>,
}

async fn update_example(State(state): State<AppState>, user: AuthUser, Path((expert_id, example_id)): Path<(Uuid, Uuid)>, Json(body): Json<UpdateExampleBody>) -> Response {
    let is_owner = sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM experts WHERE id = $1 AND owner_id = $2)")
        .bind(expert_id).bind(&user.id).fetch_one(&state.db).await.unwrap_or(false);
    if !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not the expert owner"}))).into_response();
    }
    let mut sets = Vec::new();
    let mut idx = 3u32;
    let mut binds: Vec<String> = Vec::new();
    if let Some(ref q) = body.question { sets.push(format!("question = ${idx}")); binds.push(q.clone()); idx += 1; }
    if let Some(ref a) = body.answer { sets.push(format!("answer = ${idx}")); binds.push(a.clone()); idx += 1; }
    let _ = idx;
    if sets.is_empty() {
        return Json(json!({"ok": true})).into_response();
    }
    let sql = format!("UPDATE expert_examples SET {} WHERE id = $1 AND expert_id = $2", sets.join(", "));
    let mut q = sqlx::query(&sql).bind(example_id).bind(expert_id);
    for b in &binds { q = q.bind(b); }
    match q.execute(&state.db).await {
        Ok(r) if r.rows_affected() > 0 => Json(json!({"ok": true})).into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Example not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ─── rate_ask ────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct RateAskBody {
    rating: i32,
}

/// PATCH /api/expert-hub/asks/:askId/rate
async fn rate_ask(State(state): State<AppState>, user: AuthUser, Path(ask_id): Path<Uuid>, Json(body): Json<RateAskBody>) -> Response {
    if body.rating < 1 || body.rating > 5 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Rating must be 1-5"}))).into_response();
    }

    // Verify ask belongs to user
    let ask = sqlx::query_as::<_, (Uuid,)>(
        "SELECT expert_id FROM expert_asks WHERE id = $1 AND user_id = $2"
    ).bind(ask_id).bind(&user.id).fetch_optional(&state.db).await;

    let expert_id = match ask {
        Ok(Some((eid,))) => eid,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Ask not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    // Update rating
    let _ = sqlx::query("UPDATE expert_asks SET rating = $1 WHERE id = $2")
        .bind(body.rating).bind(ask_id).execute(&state.db).await;

    // Recalculate expert avg_rating
    let avg = sqlx::query_scalar::<_, f64>(
        "SELECT AVG(rating)::float8 FROM expert_asks WHERE expert_id = $1 AND rating IS NOT NULL"
    ).bind(expert_id).fetch_optional(&state.db).await.ok().flatten();

    if let Some(avg_val) = avg {
        let _ = sqlx::query("UPDATE experts SET avg_rating = $1, updated_at = NOW() WHERE id = $2")
            .bind(avg_val).bind(expert_id).execute(&state.db).await;
    }

    Json(json!({"ok": true, "rating": body.rating})).into_response()
}

// ─── test_webhook ────────────────────────────────────────────────────────────

/// POST /api/expert-hub/:id/webhook/test — test webhook connectivity
async fn test_webhook(State(state): State<AppState>, user: AuthUser, Path(id): Path<Uuid>) -> Response {
    // Owner only
    let expert = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT owner_id, webhook_url FROM experts WHERE id = $1"
    ).bind(id).fetch_optional(&state.db).await;

    let (owner_id, webhook_url) = match expert {
        Ok(Some(e)) => e,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Expert not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    if owner_id != user.id {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Only the owner can test webhook"}))).into_response();
    }

    let url = match webhook_url {
        Some(ref u) if !u.is_empty() => u.clone(),
        _ => return (StatusCode::BAD_REQUEST, Json(json!({"error": "No webhook URL configured"}))).into_response(),
    };

    // Try to fetch the agent card
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(10)).build().unwrap_or_default();
    let resp = client.get(&url).header("Accept", "application/json").send().await;

    match resp {
        Ok(r) if r.status().is_success() => {
            Json(json!({"ok": true, "status": r.status().as_u16(), "message": "Webhook endpoint is reachable"})).into_response()
        }
        Ok(r) => {
            Json(json!({"ok": false, "status": r.status().as_u16(), "message": format!("Endpoint returned {}", r.status())})).into_response()
        }
        Err(e) => {
            Json(json!({"ok": false, "message": format!("Connection failed: {}", e)})).into_response()
        }
    }
}
