use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post},
    Router,
};
use futures::StreamExt;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;
use pgvector::Vector;

use crate::auth::middleware::AuthUser;
use crate::services::embedding::{generate_embeddings, EMBEDDING_MODEL};
use crate::services::llm::{self, ChatMessage, LlmCallOptions, LlmProvider};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Expert CRUD
        .route("/api/expert-hub", get(list_experts).post(create_expert))
        .route("/api/expert-hub/{id}", get(get_expert).patch(update_expert).delete(delete_expert))
        // Knowledge
        .route("/api/expert-hub/{id}/knowledge", get(list_knowledge).post(add_knowledge))
        .route("/api/expert-hub/{id}/knowledge/rebuild", post(rebuild_knowledge))
        // Ask
        .route("/api/expert-hub/{id}/ask", post(ask_expert))
        // History
        .route("/api/expert-hub/{id}/history", get(ask_history))
        // Examples
        .route("/api/expert-hub/{id}/examples", post(add_example))
        .route("/api/expert-hub/{expertId}/examples/{exampleId}", delete(delete_example))
}

// ─── list_experts ────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ListExpertsQuery {
    search: Option<String>,
    category: Option<String>,
    sort: Option<String>, // "popular" or "newest"
}

async fn list_experts(
    State(state): State<AppState>,
    _user: AuthUser,
    Query(q): Query<ListExpertsQuery>,
) -> Response {
    let order = match q.sort.as_deref() {
        Some("popular") => "e.total_asks DESC",
        _ => "e.created_at DESC",
    };

    // Build dynamic query
    let mut conditions = vec!["e.is_published = true".to_string()];
    let mut binds: Vec<String> = vec![];

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

async fn get_expert(State(state): State<AppState>, _user: AuthUser, Path(id): Path<Uuid>) -> Response {
    let expert = sqlx::query_as::<_, (Uuid, String, String, Option<String>, Option<String>, String, i32, String, Option<String>, bool, i32, i32, i32, Option<f64>, chrono::DateTime<chrono::Utc>)>(
        r#"SELECT e.id, e.owner_id, e.name, e.description, e.avatar_url, e.category, e.price_per_ask, e.mode, e.webhook_url, e.is_published, e.free_trial_count, e.total_asks, e.total_revenue, e.avg_rating, e.created_at
           FROM experts e WHERE e.id = $1"#
    ).bind(id).fetch_optional(&state.db).await;

    match expert {
        Ok(Some(e)) => {
            // Fetch examples
            let examples = sqlx::query_as::<_, (Uuid, String, String, i32)>(
                "SELECT id, question, answer, sort_order FROM expert_examples WHERE expert_id = $1 ORDER BY sort_order"
            ).bind(id).fetch_all(&state.db).await.unwrap_or_default();

            // Owner info
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
                "webhookUrl": e.8,
                "isPublished": e.9,
                "freeTrialCount": e.10,
                "totalAsks": e.11,
                "totalRevenue": e.12,
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

    // Chunk the content (simple ~500 char chunks)
    let chunks: Vec<&str> = content.as_bytes()
        .chunks(500)
        .map(|c| std::str::from_utf8(c).unwrap_or(""))
        .filter(|s| !s.is_empty())
        .collect();

    let client = reqwest::Client::new();
    let chunk_strings: Vec<String> = chunks.iter().map(|s| s.to_string()).collect();
    let embeddings = generate_embeddings(&client, api_key, &chunk_strings, EMBEDDING_MODEL).await;

    match embeddings {
        Ok(embs) => {
            let mut ids = vec![];
            for (i, (chunk, emb)) in chunks.iter().zip(embs.iter()).enumerate() {
                let vec = Vector::from(emb.clone());
                let row = sqlx::query_as::<_, (Uuid,)>(
                    "INSERT INTO expert_knowledge (expert_id, raw_content, embedding, chunk_index) VALUES ($1, $2, $3, $4) RETURNING id"
                ).bind(id).bind(*chunk).bind(vec).bind(i as i32).fetch_one(&state.db).await;
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

    let chunks: Vec<String> = all_content.as_bytes().chunks(500)
        .map(|c| String::from_utf8_lossy(c).to_string())
        .filter(|s| !s.is_empty()).collect();

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

    let (expert_name, price, mode, _webhook_url) = match expert {
        Ok(Some(e)) => e,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Expert not found or not published"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    // Check and deduct balance
    if price > 0 {
        let deducted = sqlx::query_scalar::<_, i32>(
            "UPDATE coin_balances SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2 AND balance >= $1 RETURNING balance"
        ).bind(price).bind(&user.id).fetch_optional(&state.db).await;

        match deducted {
            Ok(None) => return (StatusCode::BAD_REQUEST, Json(json!({"error": "insufficient_balance"}))).into_response(),
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
            Ok(Some(_)) => {
                // Record transaction
                let _ = sqlx::query(
                    "INSERT INTO coin_transactions (id, user_id, type, amount, description) VALUES ($1, $2, 'expert_ask', $3, $4)"
                ).bind(Uuid::new_v4()).bind(&user.id).bind(-price).bind(format!("Expert: {}", expert_name)).execute(&state.db).await;
            }
        }
    }

    if mode == "webhook" {
        // TODO: webhook mode -- forward to external service
        return (StatusCode::NOT_IMPLEMENTED, Json(json!({"error": "Webhook mode not yet implemented"}))).into_response();
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

        // Save ask record
        let _ = sqlx::query(
            "INSERT INTO expert_asks (id, expert_id, user_id, question, answer, cost) VALUES ($1, $2, $3, $4, $5, $6)"
        ).bind(ask_id).bind(expert_id).bind(&user_id).bind(&q).bind(&full_content).bind(price).execute(&db).await;

        // Update stats
        let _ = sqlx::query(
            "UPDATE experts SET total_asks = total_asks + 1, total_revenue = total_revenue + $1, updated_at = NOW() WHERE id = $2"
        ).bind(price).bind(expert_id).execute(&db).await;

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
