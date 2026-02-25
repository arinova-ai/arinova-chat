use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, post, put},
    Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::services::{crypto, llm};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/marketplace/agents", post(create_listing).get(browse))
        .route(
            "/api/marketplace/agents/{id}",
            get(get_detail).put(update_listing).delete(archive_listing),
        )
        .route("/api/marketplace/agents/{id}/manage", get(manage_detail))
        .route("/api/marketplace/manage", get(my_listings))
}

// ---------------------------------------------------------------------------
// Content moderation
// ---------------------------------------------------------------------------

const BLOCKED_WORDS: &[&str] = &[
    "hack",
    "exploit",
    "jailbreak",
    "ignore previous",
    "DAN",
    "bypass",
];

fn check_content(texts: &[&str]) -> Option<String> {
    let combined = texts.join(" ").to_lowercase();
    for word in BLOCKED_WORDS {
        if combined.contains(&word.to_lowercase()) {
            return Some(format!("Content contains blocked term: {}", word));
        }
    }
    None
}

// ---------------------------------------------------------------------------
// POST /api/marketplace/agents — Create
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct CreateListingBody {
    name: String,
    description: String,
    #[serde(rename = "avatarUrl")]
    avatar_url: Option<String>,
    category: Option<String>,
    #[serde(rename = "systemPrompt")]
    system_prompt: String,
    #[serde(rename = "welcomeMessage")]
    welcome_message: Option<String>,
    #[serde(rename = "exampleConversations")]
    example_conversations: Option<Value>,
    #[serde(rename = "modelProvider")]
    model_provider: Option<String>,
    #[serde(rename = "modelId")]
    model_id: Option<String>,
    #[serde(rename = "apiKey")]
    api_key: String,
    #[serde(rename = "pricePerMessage")]
    price_per_message: Option<i32>,
    #[serde(rename = "freeTrialMessages")]
    free_trial_messages: Option<i32>,
}

async fn create_listing(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateListingBody>,
) -> (StatusCode, Json<Value>) {
    // 1. Content moderation
    if let Some(reason) = check_content(&[&body.name, &body.description, &body.system_prompt]) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": reason })),
        );
    }

    // 2. Validate API key — respect explicit model_provider, infer only when absent
    let model_id = body.model_id.as_deref().unwrap_or("gpt-4o-mini");
    let provider = match body.model_provider.as_deref() {
        Some("anthropic") => llm::LlmProvider::Anthropic,
        Some("openai") => llm::LlmProvider::OpenAI,
        Some(p) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Unsupported provider: {}", p) })),
            );
        }
        None => llm::LlmProvider::from_model(model_id),
    };

    if let Err(e) = llm::validate_api_key(&provider, &body.api_key).await {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": e })),
        );
    }

    // 3. Encrypt API key
    let api_key_encrypted = match crypto::encrypt(&body.api_key, &state.config.encryption_key) {
        Ok(enc) => enc,
        Err(e) => {
            tracing::error!("Encrypt API key failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to encrypt API key" })),
            );
        }
    };

    let category = body.category.as_deref().unwrap_or("general");
    let model_provider_str = body.model_provider.as_deref().unwrap_or(match provider {
        llm::LlmProvider::Anthropic => "anthropic",
        llm::LlmProvider::OpenAI => "openai",
    });
    let example_conversations = body.example_conversations.unwrap_or(json!([]));
    let price_per_message = body.price_per_message.unwrap_or(1);
    let free_trial_messages = body.free_trial_messages.unwrap_or(3);

    // 4. INSERT
    let row = sqlx::query_as::<_, (Uuid, String, String, String, Option<String>, Option<String>, String, String, i32, i32, i32, String, Option<f64>, i32, Value, chrono::NaiveDateTime, chrono::NaiveDateTime)>(
        r#"INSERT INTO agent_listings
           (creator_id, agent_name, description, category, avatar_url, welcome_message,
            model_provider, model_id, price, price_per_message, free_trial_messages,
            api_key_encrypted, system_prompt, status, example_conversations)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, 'active', $13)
           RETURNING id, agent_name, description, category, avatar_url, welcome_message,
                     model_provider, model_id, price_per_message, free_trial_messages,
                     sales_count, status::text, avg_rating, review_count,
                     example_conversations, created_at, updated_at"#,
    )
    .bind(&user.id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(category)
    .bind(&body.avatar_url)
    .bind(&body.welcome_message)
    .bind(model_provider_str)
    .bind(model_id)
    .bind(price_per_message)
    .bind(free_trial_messages)
    .bind(&api_key_encrypted)
    .bind(&body.system_prompt)
    .bind(&example_conversations)
    .fetch_one(&state.db)
    .await;

    match row {
        Ok((id, name, desc, cat, avatar, wm, mp, mid, ppm, ftm, sc, status, avg_r, rc, ec, ca, ua)) => (
            StatusCode::CREATED,
            Json(json!({
                "id": id,
                "creatorId": user.id,
                "agentName": name,
                "description": desc,
                "category": cat,
                "avatarUrl": avatar,
                "welcomeMessage": wm,
                "modelProvider": mp,
                "modelId": mid,
                "pricePerMessage": ppm,
                "freeTrialMessages": ftm,
                "salesCount": sc,
                "status": status,
                "avgRating": avg_r,
                "reviewCount": rc,
                "exampleConversations": ec,
                "createdAt": ca.and_utc().to_rfc3339(),
                "updatedAt": ua.and_utc().to_rfc3339(),
            })),
        ),
        Err(e) => {
            tracing::error!("Create listing failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to create listing" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// PUT /api/marketplace/agents/{id} — Update
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct UpdateListingBody {
    name: Option<String>,
    description: Option<String>,
    #[serde(rename = "avatarUrl")]
    avatar_url: Option<String>,
    category: Option<String>,
    #[serde(rename = "systemPrompt")]
    system_prompt: Option<String>,
    #[serde(rename = "welcomeMessage")]
    welcome_message: Option<String>,
    #[serde(rename = "exampleConversations")]
    example_conversations: Option<Value>,
    #[serde(rename = "modelId")]
    model_id: Option<String>,
    #[serde(rename = "modelProvider")]
    model_provider: Option<String>,
    #[serde(rename = "apiKey")]
    api_key: Option<String>,
    #[serde(rename = "pricePerMessage")]
    price_per_message: Option<i32>,
    #[serde(rename = "freeTrialMessages")]
    free_trial_messages: Option<i32>,
}

async fn update_listing(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateListingBody>,
) -> (StatusCode, Json<Value>) {
    // Verify ownership
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT creator_id FROM agent_listings WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match owner {
        Ok(Some(cid)) if cid == user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Not your listing" })),
            );
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Listing not found" })),
            );
        }
        Err(e) => {
            tracing::error!("Fetch listing owner failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    }

    // Content moderation on provided fields
    let mut texts: Vec<&str> = Vec::new();
    if let Some(ref n) = body.name {
        texts.push(n);
    }
    if let Some(ref d) = body.description {
        texts.push(d);
    }
    if let Some(ref sp) = body.system_prompt {
        texts.push(sp);
    }
    if !texts.is_empty() {
        if let Some(reason) = check_content(&texts) {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": reason })),
            );
        }
    }

    // If new api_key provided, validate + encrypt
    let mut encrypted_key: Option<String> = None;
    if let Some(ref new_key) = body.api_key {
        let model_id = body.model_id.as_deref().unwrap_or("gpt-4o-mini");
        // Respect explicit model_provider; only infer from model_id when absent
        let provider = match body.model_provider.as_deref() {
            Some("anthropic") => llm::LlmProvider::Anthropic,
            Some("openai") => llm::LlmProvider::OpenAI,
            Some(p) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": format!("Unsupported provider: {}", p) })),
                );
            }
            None => llm::LlmProvider::from_model(model_id),
        };

        if let Err(e) = llm::validate_api_key(&provider, new_key).await {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": e })),
            );
        }

        match crypto::encrypt(new_key, &state.config.encryption_key) {
            Ok(enc) => encrypted_key = Some(enc),
            Err(e) => {
                tracing::error!("Encrypt API key failed: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "Failed to encrypt API key" })),
                );
            }
        }
    }

    // Build dynamic UPDATE
    let result = sqlx::query_as::<_, (Uuid, String, String, String, Option<String>, Option<String>, String, String, i32, i32, i32, String, Option<f64>, i32, Value, chrono::NaiveDateTime, chrono::NaiveDateTime)>(
        r#"UPDATE agent_listings SET
               agent_name = COALESCE($2, agent_name),
               description = COALESCE($3, description),
               category = COALESCE($4, category),
               avatar_url = COALESCE($5, avatar_url),
               system_prompt = COALESCE($6, system_prompt),
               welcome_message = COALESCE($7, welcome_message),
               model_provider = COALESCE($8, model_provider),
               model_id = COALESCE($9, model_id),
               api_key_encrypted = COALESCE($10, api_key_encrypted),
               example_conversations = COALESCE($11, example_conversations),
               price_per_message = COALESCE($12, price_per_message),
               free_trial_messages = COALESCE($13, free_trial_messages),
               updated_at = NOW()
           WHERE id = $1
           RETURNING id, agent_name, description, category, avatar_url, welcome_message,
                     model_provider, model_id, price_per_message, free_trial_messages,
                     sales_count, status::text, avg_rating, review_count,
                     example_conversations, created_at, updated_at"#,
    )
    .bind(id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(&body.category)
    .bind(&body.avatar_url)
    .bind(&body.system_prompt)
    .bind(&body.welcome_message)
    .bind(&body.model_provider)
    .bind(&body.model_id)
    .bind(&encrypted_key)
    .bind(&body.example_conversations)
    .bind(&body.price_per_message)
    .bind(&body.free_trial_messages)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok((lid, name, desc, cat, avatar, wm, mp, mid, ppm, ftm, sc, status, avg_r, rc, ec, ca, ua)) => (
            StatusCode::OK,
            Json(json!({
                "id": lid,
                "agentName": name,
                "description": desc,
                "category": cat,
                "avatarUrl": avatar,
                "welcomeMessage": wm,
                "modelProvider": mp,
                "modelId": mid,
                "pricePerMessage": ppm,
                "freeTrialMessages": ftm,
                "salesCount": sc,
                "status": status,
                "avgRating": avg_r,
                "reviewCount": rc,
                "exampleConversations": ec,
                "createdAt": ca.and_utc().to_rfc3339(),
                "updatedAt": ua.and_utc().to_rfc3339(),
            })),
        ),
        Err(e) => {
            tracing::error!("Update listing failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to update listing" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// DELETE /api/marketplace/agents/{id} — Archive (soft delete)
// ---------------------------------------------------------------------------

async fn archive_listing(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let result = sqlx::query(
        "UPDATE agent_listings SET status = 'archived', updated_at = NOW() WHERE id = $1 AND creator_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Listing not found or not owned by you" })),
        ),
        Ok(_) => (StatusCode::OK, Json(json!({ "archived": true }))),
        Err(e) => {
            tracing::error!("Archive listing failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/marketplace/agents — Browse / Search (public)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct BrowseQuery {
    category: Option<String>,
    search: Option<String>,
    sort: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

async fn browse(
    State(state): State<AppState>,
    Query(q): Query<BrowseQuery>,
) -> (StatusCode, Json<Value>) {
    let limit = q.limit.unwrap_or(20).min(50);
    let offset = q.offset.unwrap_or(0).max(0);

    let order_clause = match q.sort.as_deref() {
        Some("newest") => "ORDER BY al.created_at DESC",
        Some("rating") => "ORDER BY al.avg_rating DESC NULLS LAST",
        Some("price") => "ORDER BY al.price_per_message ASC",
        _ => "ORDER BY al.sales_count DESC", // popular (default)
    };

    // Build WHERE conditions — bind_idx tracks the next $N placeholder
    let mut conditions = vec!["al.status = 'active'".to_string()];
    let mut bind_idx = 0u32;

    let category_val = q.category.clone();
    if category_val.is_some() {
        bind_idx += 1;
        conditions.push(format!("al.category = ${}", bind_idx));
    }

    let search_val = q.search.as_ref().map(|s| format!("%{}%", s));
    if search_val.is_some() {
        bind_idx += 1;
        let idx = bind_idx;
        conditions.push(format!(
            "(al.agent_name ILIKE ${idx} OR al.description ILIKE ${idx})"
        ));
    }

    let where_clause = conditions.join(" AND ");

    // Count query
    let count_sql = format!("SELECT COUNT(*) FROM agent_listings al WHERE {}", where_clause);
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql);

    if let Some(ref cat) = category_val {
        count_query = count_query.bind(cat);
    }
    if let Some(ref sv) = search_val {
        count_query = count_query.bind(sv);
    }

    let total = match count_query.fetch_one(&state.db).await {
        Ok(n) => n,
        Err(e) => {
            tracing::error!("Browse count failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Data query
    bind_idx += 1;
    let limit_idx = bind_idx;
    bind_idx += 1;
    let offset_idx = bind_idx;

    let data_sql = format!(
        r#"SELECT al.id, al.creator_id, al.agent_name, al.description, al.category,
                  al.avatar_url, al.welcome_message, al.model_provider, al.model_id,
                  al.price_per_message, al.free_trial_messages,
                  al.sales_count, al.status::text, al.avg_rating, al.review_count,
                  al.total_messages, al.total_revenue,
                  al.example_conversations, al.created_at, al.updated_at,
                  u.name AS creator_name, u.username AS creator_username
           FROM agent_listings al
           LEFT JOIN "user" u ON u.id = al.creator_id
           WHERE {}
           {} LIMIT ${} OFFSET ${}"#,
        where_clause, order_clause, limit_idx, offset_idx
    );

    let mut data_query = sqlx::query_as::<_, (
        Uuid, String, String, String, String,
        Option<String>, Option<String>, String, String,
        i32, i32,
        i32, String, Option<f64>, i32,
        i32, i32,
        Value, chrono::NaiveDateTime, chrono::NaiveDateTime,
        Option<String>, Option<String>,
    )>(&data_sql);

    if let Some(ref cat) = category_val {
        data_query = data_query.bind(cat);
    }
    if let Some(ref sv) = search_val {
        data_query = data_query.bind(sv);
    }
    data_query = data_query.bind(limit).bind(offset);

    let rows = match data_query.fetch_all(&state.db).await {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("Browse fetch failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    let listings: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.0,
                "creatorId": r.1,
                "agentName": r.2,
                "description": r.3,
                "category": r.4,
                "avatarUrl": r.5,
                "welcomeMessage": r.6,
                "modelProvider": r.7,
                "modelId": r.8,
                "pricePerMessage": r.9,
                "freeTrialMessages": r.10,
                "salesCount": r.11,
                "status": r.12,
                "avgRating": r.13,
                "reviewCount": r.14,
                "totalMessages": r.15,
                "totalRevenue": r.16,
                "exampleConversations": r.17,
                "createdAt": r.18.and_utc().to_rfc3339(),
                "updatedAt": r.19.and_utc().to_rfc3339(),
                "creatorName": r.20,
                "creatorUsername": r.21,
            })
        })
        .collect();

    (
        StatusCode::OK,
        Json(json!({
            "listings": listings,
            "total": total,
        })),
    )
}

// ---------------------------------------------------------------------------
// GET /api/marketplace/agents/{id} — Public Detail
// ---------------------------------------------------------------------------

async fn get_detail(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let row = sqlx::query_as::<_, (
        Uuid, String, String, String, String,
        Option<String>, Option<String>, String, String,
        i32, i32,
        i32, String, Option<f64>, i32,
        i32, i32,
        Value, chrono::NaiveDateTime, chrono::NaiveDateTime,
        Option<String>, Option<String>,
    )>(
        r#"SELECT al.id, al.creator_id, al.agent_name, al.description, al.category,
                  al.avatar_url, al.welcome_message, al.model_provider, al.model_id,
                  al.price_per_message, al.free_trial_messages,
                  al.sales_count, al.status::text, al.avg_rating, al.review_count,
                  al.total_messages, al.total_revenue,
                  al.example_conversations, al.created_at, al.updated_at,
                  u.name AS creator_name, u.username AS creator_username
           FROM agent_listings al
           LEFT JOIN "user" u ON u.id = al.creator_id
           WHERE al.id = $1 AND al.status = 'active'"#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(r)) => (
            StatusCode::OK,
            Json(json!({
                "id": r.0,
                "creatorId": r.1,
                "agentName": r.2,
                "description": r.3,
                "category": r.4,
                "avatarUrl": r.5,
                "welcomeMessage": r.6,
                "modelProvider": r.7,
                "modelId": r.8,
                "pricePerMessage": r.9,
                "freeTrialMessages": r.10,
                "salesCount": r.11,
                "status": r.12,
                "avgRating": r.13,
                "reviewCount": r.14,
                "totalMessages": r.15,
                "totalRevenue": r.16,
                "exampleConversations": r.17,
                "createdAt": r.18.and_utc().to_rfc3339(),
                "updatedAt": r.19.and_utc().to_rfc3339(),
                "creatorName": r.20,
                "creatorUsername": r.21,
            })),
        ),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Listing not found" })),
        ),
        Err(e) => {
            tracing::error!("Get listing detail failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/marketplace/agents/{id}/manage — Creator Manage View (single, auth)
// ---------------------------------------------------------------------------

async fn manage_detail(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let row = sqlx::query_as::<_, (
        Uuid, String, String, String, String,
        Option<String>, Option<String>, String, String,
        String, i32, i32,
        i32, String, Option<f64>, i32,
        i32, i32,
        Value, chrono::NaiveDateTime, chrono::NaiveDateTime,
    )>(
        r#"SELECT id, creator_id, agent_name, description, category,
                  avatar_url, welcome_message, model_provider, model_id,
                  system_prompt, price_per_message, free_trial_messages,
                  sales_count, status::text, avg_rating, review_count,
                  total_messages, total_revenue,
                  example_conversations, created_at, updated_at
           FROM agent_listings
           WHERE id = $1 AND creator_id = $2"#,
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(r)) => (
            StatusCode::OK,
            Json(json!({
                "id": r.0,
                "creatorId": r.1,
                "agentName": r.2,
                "description": r.3,
                "category": r.4,
                "avatarUrl": r.5,
                "welcomeMessage": r.6,
                "modelProvider": r.7,
                "modelId": r.8,
                "systemPrompt": r.9,
                "pricePerMessage": r.10,
                "freeTrialMessages": r.11,
                "salesCount": r.12,
                "status": r.13,
                "avgRating": r.14,
                "reviewCount": r.15,
                "totalMessages": r.16,
                "totalRevenue": r.17,
                "exampleConversations": r.18,
                "createdAt": r.19.and_utc().to_rfc3339(),
                "updatedAt": r.20.and_utc().to_rfc3339(),
            })),
        ),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Listing not found or not owned by you" })),
        ),
        Err(e) => {
            tracing::error!("Manage listing detail failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/marketplace/manage — Creator's own listings (list, auth)
// ---------------------------------------------------------------------------

async fn my_listings(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, (
        Uuid, String, String, String,
        Option<String>, Option<String>, String, String,
        i32, i32,
        i32, String, Option<f64>, i32,
        i32, i32,
        Value, chrono::NaiveDateTime, chrono::NaiveDateTime,
    )>(
        r#"SELECT id, agent_name, description, category,
                  avatar_url, welcome_message, model_provider, model_id,
                  price_per_message, free_trial_messages,
                  sales_count, status::text, avg_rating, review_count,
                  total_messages, total_revenue,
                  example_conversations, created_at, updated_at
           FROM agent_listings
           WHERE creator_id = $1
           ORDER BY created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let listings: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.0,
                        "agentName": r.1,
                        "description": r.2,
                        "category": r.3,
                        "avatarUrl": r.4,
                        "welcomeMessage": r.5,
                        "modelProvider": r.6,
                        "modelId": r.7,
                        "pricePerMessage": r.8,
                        "freeTrialMessages": r.9,
                        "salesCount": r.10,
                        "status": r.11,
                        "avgRating": r.12,
                        "reviewCount": r.13,
                        "totalMessages": r.14,
                        "totalRevenue": r.15,
                        "exampleConversations": r.16,
                        "createdAt": r.17.and_utc().to_rfc3339(),
                        "updatedAt": r.18.and_utc().to_rfc3339(),
                    })
                })
                .collect();

            (
                StatusCode::OK,
                Json(json!({ "listings": listings })),
            )
        }
        Err(e) => {
            tracing::error!("My listings fetch failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}
