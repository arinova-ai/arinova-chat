use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use chrono::NaiveDateTime;
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
        .route(
            "/api/marketplace/agents/{id}/reviews",
            post(create_review).get(list_reviews),
        )
        .route("/api/marketplace/manage", get(my_listings))
}

// ---------------------------------------------------------------------------
// FromRow structs for sqlx (tuples limited to 16 fields)
// ---------------------------------------------------------------------------

/// Public listing fields — used for create/update RETURNING and my_listings.
#[derive(sqlx::FromRow)]
struct ListingRow {
    id: Uuid,
    agent_name: String,
    description: String,
    category: String,
    avatar_url: Option<String>,
    welcome_message: Option<String>,
    model_provider: String,
    model_id: String,
    price_per_message: i32,
    free_trial_messages: i32,
    sales_count: i32,
    status: String,
    avg_rating: Option<f64>,
    review_count: i32,
    total_messages: i32,
    total_revenue: i32,
    example_conversations: Value,
    created_at: NaiveDateTime,
    updated_at: NaiveDateTime,
}

/// Public listing with creator info — used for browse and detail.
#[derive(sqlx::FromRow)]
struct ListingDetailRow {
    id: Uuid,
    creator_id: String,
    agent_name: String,
    description: String,
    category: String,
    avatar_url: Option<String>,
    welcome_message: Option<String>,
    model_provider: String,
    model_id: String,
    price_per_message: i32,
    free_trial_messages: i32,
    sales_count: i32,
    status: String,
    avg_rating: Option<f64>,
    review_count: i32,
    total_messages: i32,
    total_revenue: i32,
    example_conversations: Value,
    created_at: NaiveDateTime,
    updated_at: NaiveDateTime,
    creator_name: Option<String>,
    creator_username: Option<String>,
}

/// Creator manage view — includes system_prompt, no creator join.
#[derive(sqlx::FromRow)]
struct ManageListingRow {
    id: Uuid,
    creator_id: String,
    agent_name: String,
    description: String,
    category: String,
    avatar_url: Option<String>,
    welcome_message: Option<String>,
    model_provider: String,
    model_id: String,
    system_prompt: String,
    price_per_message: i32,
    free_trial_messages: i32,
    sales_count: i32,
    status: String,
    avg_rating: Option<f64>,
    review_count: i32,
    total_messages: i32,
    total_revenue: i32,
    example_conversations: Value,
    created_at: NaiveDateTime,
    updated_at: NaiveDateTime,
}

// ---------------------------------------------------------------------------
// JSON serialization helpers
// ---------------------------------------------------------------------------

fn listing_row_to_json(r: &ListingRow) -> Value {
    json!({
        "id": r.id,
        "agentName": r.agent_name,
        "description": r.description,
        "category": r.category,
        "avatarUrl": r.avatar_url,
        "welcomeMessage": r.welcome_message,
        "modelProvider": r.model_provider,
        "modelId": r.model_id,
        "pricePerMessage": r.price_per_message,
        "freeTrialMessages": r.free_trial_messages,
        "salesCount": r.sales_count,
        "status": r.status,
        "avgRating": r.avg_rating,
        "reviewCount": r.review_count,
        "totalMessages": r.total_messages,
        "totalRevenue": r.total_revenue,
        "exampleConversations": r.example_conversations,
        "createdAt": r.created_at.and_utc().to_rfc3339(),
        "updatedAt": r.updated_at.and_utc().to_rfc3339(),
    })
}

fn detail_row_to_json(r: &ListingDetailRow) -> Value {
    json!({
        "id": r.id,
        "creatorId": r.creator_id,
        "agentName": r.agent_name,
        "description": r.description,
        "category": r.category,
        "avatarUrl": r.avatar_url,
        "welcomeMessage": r.welcome_message,
        "modelProvider": r.model_provider,
        "modelId": r.model_id,
        "pricePerMessage": r.price_per_message,
        "freeTrialMessages": r.free_trial_messages,
        "salesCount": r.sales_count,
        "status": r.status,
        "avgRating": r.avg_rating,
        "reviewCount": r.review_count,
        "totalMessages": r.total_messages,
        "totalRevenue": r.total_revenue,
        "exampleConversations": r.example_conversations,
        "createdAt": r.created_at.and_utc().to_rfc3339(),
        "updatedAt": r.updated_at.and_utc().to_rfc3339(),
        "creatorName": r.creator_name,
        "creatorUsername": r.creator_username,
    })
}

fn manage_row_to_json(r: &ManageListingRow) -> Value {
    json!({
        "id": r.id,
        "creatorId": r.creator_id,
        "agentName": r.agent_name,
        "description": r.description,
        "category": r.category,
        "avatarUrl": r.avatar_url,
        "welcomeMessage": r.welcome_message,
        "modelProvider": r.model_provider,
        "modelId": r.model_id,
        "systemPrompt": r.system_prompt,
        "pricePerMessage": r.price_per_message,
        "freeTrialMessages": r.free_trial_messages,
        "salesCount": r.sales_count,
        "status": r.status,
        "avgRating": r.avg_rating,
        "reviewCount": r.review_count,
        "totalMessages": r.total_messages,
        "totalRevenue": r.total_revenue,
        "exampleConversations": r.example_conversations,
        "createdAt": r.created_at.and_utc().to_rfc3339(),
        "updatedAt": r.updated_at.and_utc().to_rfc3339(),
    })
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
    let row = sqlx::query_as::<_, ListingRow>(
        r#"INSERT INTO agent_listings
           (creator_id, agent_name, description, category, avatar_url, welcome_message,
            model_provider, model_id, price, price_per_message, free_trial_messages,
            api_key_encrypted, system_prompt, status, example_conversations)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10, $11, $12, 'active', $13)
           RETURNING id, agent_name, description, category, avatar_url, welcome_message,
                     model_provider, model_id, price_per_message, free_trial_messages,
                     sales_count, status::text AS status, avg_rating::float8 AS avg_rating,
                     review_count, total_messages, total_revenue,
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
        Ok(r) => {
            let mut j = listing_row_to_json(&r);
            j["creatorId"] = json!(user.id);
            (StatusCode::CREATED, Json(j))
        }
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

    // Validate model_provider if provided (regardless of apiKey)
    if let Some(ref mp) = body.model_provider {
        if mp != "openai" && mp != "anthropic" {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": format!("Unsupported provider: {}", mp) })),
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
            // Already validated above, but satisfy exhaustive match
            Some(_) => unreachable!(),
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
    let result = sqlx::query_as::<_, ListingRow>(
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
                     sales_count, status::text AS status, avg_rating::float8 AS avg_rating,
                     review_count, total_messages, total_revenue,
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
        Ok(r) => (StatusCode::OK, Json(listing_row_to_json(&r))),
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
                  al.sales_count, al.status::text AS status,
                  al.avg_rating::float8 AS avg_rating, al.review_count,
                  al.total_messages, al.total_revenue,
                  al.example_conversations, al.created_at, al.updated_at,
                  u.name AS creator_name, u.username AS creator_username
           FROM agent_listings al
           LEFT JOIN "user" u ON u.id = al.creator_id
           WHERE {}
           {} LIMIT ${} OFFSET ${}"#,
        where_clause, order_clause, limit_idx, offset_idx
    );

    let mut data_query = sqlx::query_as::<_, ListingDetailRow>(&data_sql);

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

    let listings: Vec<Value> = rows.iter().map(detail_row_to_json).collect();

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
    let row = sqlx::query_as::<_, ListingDetailRow>(
        r#"SELECT al.id, al.creator_id, al.agent_name, al.description, al.category,
                  al.avatar_url, al.welcome_message, al.model_provider, al.model_id,
                  al.price_per_message, al.free_trial_messages,
                  al.sales_count, al.status::text AS status,
                  al.avg_rating::float8 AS avg_rating, al.review_count,
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
        Ok(Some(r)) => (StatusCode::OK, Json(detail_row_to_json(&r))),
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
    let row = sqlx::query_as::<_, ManageListingRow>(
        r#"SELECT id, creator_id, agent_name, description, category,
                  avatar_url, welcome_message, model_provider, model_id,
                  system_prompt, price_per_message, free_trial_messages,
                  sales_count, status::text AS status,
                  avg_rating::float8 AS avg_rating, review_count,
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
        Ok(Some(r)) => (StatusCode::OK, Json(manage_row_to_json(&r))),
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
    let rows = sqlx::query_as::<_, ListingRow>(
        r#"SELECT id, agent_name, description, category,
                  avatar_url, welcome_message, model_provider, model_id,
                  price_per_message, free_trial_messages,
                  sales_count, status::text AS status,
                  avg_rating::float8 AS avg_rating, review_count,
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
            let listings: Vec<Value> = rows.iter().map(listing_row_to_json).collect();
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

// ---------------------------------------------------------------------------
// POST /api/marketplace/agents/{id}/reviews — Create a review
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct CreateReviewBody {
    rating: i32,
    comment: Option<String>,
}

async fn create_review(
    State(state): State<AppState>,
    user: AuthUser,
    Path(listing_id): Path<Uuid>,
    Json(body): Json<CreateReviewBody>,
) -> (StatusCode, Json<Value>) {
    // Validate rating
    if body.rating < 1 || body.rating > 5 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Rating must be 1-5" })),
        );
    }

    // Validate comment length
    if let Some(ref c) = body.comment {
        if c.len() > 2000 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Comment must be 2000 characters or less" })),
            );
        }
    }

    // Verify listing exists and is active
    let listing = sqlx::query_as::<_, ReviewListingCheck>(
        "SELECT creator_id, status::text AS status FROM agent_listings WHERE id = $1",
    )
    .bind(listing_id)
    .fetch_optional(&state.db)
    .await;

    match listing {
        Ok(Some(ref l)) if l.status != "active" => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Listing is not active" })),
            );
        }
        Ok(Some(ref l)) if l.creator_id == user.id => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Cannot review your own listing" })),
            );
        }
        Ok(Some(_)) => {} // OK
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Listing not found" })),
            );
        }
        Err(e) => {
            tracing::error!("Create review: fetch listing failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    }

    // Insert review (UNIQUE constraint catches duplicates)
    let result = sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO agent_reviews (listing_id, user_id, rating, comment)
           VALUES ($1, $2, $3, $4) RETURNING id"#,
    )
    .bind(listing_id)
    .bind(&user.id)
    .bind(body.rating)
    .bind(&body.comment)
    .fetch_one(&state.db)
    .await;

    let review_id = match result {
        Ok(id) => id,
        Err(e) => {
            if e.to_string().contains("unique")
                || e.to_string().contains("duplicate")
                || e.to_string().contains("23505")
            {
                return (
                    StatusCode::CONFLICT,
                    Json(json!({ "error": "You have already reviewed this listing" })),
                );
            }
            tracing::error!("Create review: insert failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to create review" })),
            );
        }
    };

    // Recalculate avg_rating and review_count
    if let Err(e) = sqlx::query(
        r#"UPDATE agent_listings SET
               avg_rating = (SELECT avg(rating)::float8 FROM agent_reviews WHERE listing_id = $1),
               review_count = (SELECT count(*)::int FROM agent_reviews WHERE listing_id = $1),
               updated_at = NOW()
           WHERE id = $1"#,
    )
    .bind(listing_id)
    .execute(&state.db)
    .await
    {
        tracing::error!("Create review: update avg_rating failed: {}", e);
    }

    (
        StatusCode::CREATED,
        Json(json!({ "id": review_id, "success": true })),
    )
}

#[derive(sqlx::FromRow)]
struct ReviewListingCheck {
    creator_id: String,
    status: String,
}

// ---------------------------------------------------------------------------
// GET /api/marketplace/agents/{id}/reviews — List reviews
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ReviewsQuery {
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(sqlx::FromRow)]
struct ReviewRow {
    id: Uuid,
    rating: i32,
    comment: Option<String>,
    created_at: NaiveDateTime,
    user_name: String,
    user_image: Option<String>,
}

async fn list_reviews(
    State(state): State<AppState>,
    Path(listing_id): Path<Uuid>,
    Query(q): Query<ReviewsQuery>,
) -> (StatusCode, Json<Value>) {
    let limit = q.limit.unwrap_or(20).min(50);
    let offset = q.offset.unwrap_or(0).max(0);

    // Get total count
    let total = sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM agent_reviews WHERE listing_id = $1",
    )
    .bind(listing_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let rows = sqlx::query_as::<_, ReviewRow>(
        r#"SELECT r.id, r.rating, r.comment, r.created_at,
                  u.name AS user_name, u.image AS user_image
           FROM agent_reviews r
           JOIN "user" u ON r.user_id = u.id
           WHERE r.listing_id = $1
           ORDER BY r.created_at DESC
           LIMIT $2 OFFSET $3"#,
    )
    .bind(listing_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let reviews: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "rating": r.rating,
                        "comment": r.comment,
                        "createdAt": r.created_at.and_utc().to_rfc3339(),
                        "userName": r.user_name,
                        "userImage": r.user_image,
                    })
                })
                .collect();
            (
                StatusCode::OK,
                Json(json!({ "reviews": reviews, "total": total })),
            )
        }
        Err(e) => {
            tracing::error!("List reviews failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}
