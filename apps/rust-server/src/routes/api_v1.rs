use axum::{
    body::Body,
    extract::{FromRequestParts, Query, State},
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use futures::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::FromRef;
use crate::routes::oauth::AuthOAuthToken;
use crate::services::llm::{self, ChatMessage, LlmCallOptions, LlmProvider};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Step 3: User
        .route("/api/v1/user/profile", get(user_profile))
        .route("/api/v1/user/agents", get(user_agents))
        // Step 4: Agent proxy (placeholder)
        .route("/api/v1/agent/chat", post(agent_chat))
        .route("/api/v1/agent/chat/stream", post(agent_chat_stream))
        // Step 5: Economy
        .route("/api/v1/economy/charge", post(economy_charge))
        .route("/api/v1/economy/award", post(economy_award))
        .route("/api/v1/economy/balance", get(economy_balance))
        // Step 5b: User-authorized economy (OAuth Bearer)
        .route("/api/v1/economy/purchase", post(economy_purchase))
        .route("/api/v1/economy/transactions", get(economy_transactions))
}

// ── Step 3: User Endpoints ──────────────────────────────────────

async fn user_profile(
    State(state): State<AppState>,
    auth: AuthOAuthToken,
) -> Response {
    let user = sqlx::query_as::<_, (String, String, String, Option<String>, bool)>(
        r#"SELECT id, name, email, image, is_verified FROM "user" WHERE id = $1"#,
    )
    .bind(&auth.user_id)
    .fetch_optional(&state.db)
    .await;

    match user {
        Ok(Some(u)) => Json(json!({
            "id": u.0,
            "name": u.1,
            "email": u.2,
            "image": u.3,
            "isVerified": u.4,
        }))
        .into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "User not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn user_agents(
    State(state): State<AppState>,
    auth: AuthOAuthToken,
) -> Response {
    if !auth.scope.split(|c: char| c == ',' || c == ' ').any(|s| !s.is_empty() && s.trim() == "agents") {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "insufficient_scope", "error_description": "Scope 'agents' required"})),
        )
            .into_response();
    }

    let agents = sqlx::query_as::<_, (Uuid, String, Option<String>, Option<String>)>(
        "SELECT id, name, description, avatar_url FROM agents WHERE owner_id = $1 ORDER BY name",
    )
    .bind(&auth.user_id)
    .fetch_all(&state.db)
    .await;

    match agents {
        Ok(rows) => {
            let list: Vec<Value> = rows
                .into_iter()
                .map(|a| {
                    json!({
                        "id": a.0,
                        "name": a.1,
                        "description": a.2,
                        "avatarUrl": a.3,
                    })
                })
                .collect();
            Json(json!({ "agents": list })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ── Step 4: Agent Chat Proxy ─────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentChatBody {
    agent_id: String,
    prompt: String,
    system_prompt: Option<String>,
}

/// Resolve agent, validate ownership, build LLM options. Returns (LlmCallOptions, agent_id_uuid).
async fn resolve_agent_llm(
    state: &AppState,
    auth: &AuthOAuthToken,
    body: &AgentChatBody,
) -> Result<LlmCallOptions, Response> {
    // Scope check
    if !auth.scope.split(|c: char| c == ',' || c == ' ').any(|s| !s.is_empty() && s.trim() == "agents") {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "insufficient_scope", "error_description": "Scope 'agents' required"})),
        ).into_response());
    }

    let agent_id = Uuid::parse_str(&body.agent_id).map_err(|_| {
        (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid agentId"}))).into_response()
    })?;

    // Fetch agent with system_prompt (and verify ownership)
    let agent = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT name, system_prompt FROM agents WHERE id = $1 AND owner_id = $2",
    )
    .bind(agent_id)
    .bind(&auth.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response()
    })?
    .ok_or_else(|| {
        (StatusCode::NOT_FOUND, Json(json!({"error": "Agent not found or not owned by user"}))).into_response()
    })?;

    let (_agent_name, db_system_prompt) = agent;

    // Determine LLM provider + API key from server config
    let (provider, api_key, model) = if let Some(ref key) = state.config.openai_api_key {
        (LlmProvider::OpenAI, key.clone(), "gpt-4o-mini".to_string())
    } else if let Some(ref key) = state.config.anthropic_api_key {
        (LlmProvider::Anthropic, key.clone(), "claude-haiku-4-5-20251001".to_string())
    } else {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"error": "No LLM provider configured"})),
        ).into_response());
    };

    // Build messages
    let mut messages = Vec::new();
    let system_prompt = body.system_prompt.as_deref()
        .or(db_system_prompt.as_deref());
    if let Some(sp) = system_prompt {
        messages.push(ChatMessage { role: "system".into(), content: sp.to_string() });
    }
    messages.push(ChatMessage { role: "user".into(), content: body.prompt.clone() });

    Ok(LlmCallOptions {
        provider,
        model,
        api_key,
        messages,
        max_tokens: Some(4096),
        temperature: Some(0.7),
    })
}

/// POST /api/v1/agent/chat — non-streaming agent chat
async fn agent_chat(
    State(state): State<AppState>,
    auth: AuthOAuthToken,
    Json(body): Json<AgentChatBody>,
) -> Response {
    let opts = match resolve_agent_llm(&state, &auth, &body).await {
        Ok(o) => o,
        Err(r) => return r,
    };

    // Call LLM streaming and collect full response
    let sse_stream = match llm::call_llm_stream(&opts).await {
        Ok(s) => s,
        Err(e) => {
            return (StatusCode::BAD_GATEWAY, Json(json!({"error": e}))).into_response();
        }
    };

    let parser = match opts.provider {
        LlmProvider::OpenAI => llm::parse_openai_chunk,
        LlmProvider::Anthropic => llm::parse_anthropic_chunk,
    };

    let mut content = String::new();
    let mut stream = sse_stream;
    let mut buf = String::new();

    while let Some(chunk_result) = stream.next().await {
        let bytes = match chunk_result {
            Ok(b) => b,
            Err(_) => break,
        };
        buf.push_str(&String::from_utf8_lossy(&bytes));

        // Process complete SSE lines
        while let Some(pos) = buf.find('\n') {
            let line = buf[..pos].trim().to_string();
            buf = buf[pos + 1..].to_string();
            if let Some(data) = line.strip_prefix("data: ") {
                if let Some(text) = parser(data) {
                    content.push_str(&text);
                }
            }
        }
    }

    Json(json!({
        "response": content,
        "agentId": body.agent_id,
    }))
    .into_response()
}

/// POST /api/v1/agent/chat/stream — SSE streaming agent chat
async fn agent_chat_stream(
    State(state): State<AppState>,
    auth: AuthOAuthToken,
    Json(body): Json<AgentChatBody>,
) -> Response {
    let opts = match resolve_agent_llm(&state, &auth, &body).await {
        Ok(o) => o,
        Err(r) => return r,
    };

    let provider = opts.provider.clone();
    let agent_id = body.agent_id.clone();

    let sse_stream = match llm::call_llm_stream(&opts).await {
        Ok(s) => s,
        Err(e) => {
            return (StatusCode::BAD_GATEWAY, Json(json!({"error": e}))).into_response();
        }
    };

    let parser = match provider {
        LlmProvider::OpenAI => llm::parse_openai_chunk,
        LlmProvider::Anthropic => llm::parse_anthropic_chunk,
    };

    // Transform LLM SSE stream into our SSE format
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
                        let event = json!({"type": "chunk", "content": text});
                        yield Ok::<_, std::convert::Infallible>(
                            format!("data: {}\n\n", event)
                        );
                    }
                }
            }
        }

        let done = json!({"type": "done", "content": full_content, "agentId": agent_id});
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

// ── Step 5: Economy ─────────────────────────────────────────────

/// Server-to-server auth via X-Client-Id + X-App-Secret headers.
#[derive(Debug, Clone)]
struct AuthAppServer {
    app_id: Uuid,
}

impl<S> FromRequestParts<S> for AuthAppServer
where
    S: Send + Sync,
    AppState: FromRef<S>,
{
    type Rejection = (StatusCode, Json<serde_json::Value>);

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = AppState::from_ref(state);
        let reject = || {
            (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "invalid_client"})),
            )
        };

        let client_id = parts
            .headers
            .get("x-client-id")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();

        let app_secret = parts
            .headers
            .get("x-app-secret")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();

        if client_id.is_empty() || app_secret.is_empty() {
            return Err(reject());
        }

        let row = sqlx::query_as::<_, (Uuid,)>(
            "SELECT id FROM oauth_apps WHERE client_id = $1 AND client_secret = $2",
        )
        .bind(&client_id)
        .bind(&app_secret)
        .fetch_optional(&app_state.db)
        .await
        .map_err(|_| reject())?
        .ok_or_else(reject)?;

        Ok(AuthAppServer { app_id: row.0 })
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChargeBody {
    user_id: String,
    amount: i32,
    description: Option<String>,
}

async fn economy_charge(
    State(state): State<AppState>,
    app_auth: AuthAppServer,
    Json(body): Json<ChargeBody>,
) -> Response {
    if body.amount <= 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Amount must be positive"})),
        )
            .into_response();
    }

    // Use a DB transaction for atomicity
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    // Ensure balance row exists
    let _ = sqlx::query(
        "INSERT INTO coin_balances (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING",
    )
    .bind(&body.user_id)
    .execute(&mut *tx)
    .await;

    // Check and deduct balance atomically
    let updated = sqlx::query_scalar::<_, i32>(
        r#"UPDATE coin_balances
           SET balance = balance - $1, updated_at = NOW()
           WHERE user_id = $2 AND balance >= $1
           RETURNING balance"#,
    )
    .bind(body.amount)
    .bind(&body.user_id)
    .fetch_optional(&mut *tx)
    .await;

    let new_balance = match updated {
        Ok(Some(b)) => b,
        Ok(None) => {
            let _ = tx.rollback().await;
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "insufficient_balance"})),
            )
                .into_response();
        }
        Err(e) => {
            let _ = tx.rollback().await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    // Record transaction
    let tx_id = Uuid::new_v4();
    let _ = sqlx::query(
        r#"INSERT INTO coin_transactions (id, user_id, type, amount, related_app_id, description)
           VALUES ($1, $2, 'charge', $3, $4, $5)"#,
    )
    .bind(tx_id)
    .bind(&body.user_id)
    .bind(-body.amount)
    .bind(app_auth.app_id)
    .bind(&body.description)
    .execute(&mut *tx)
    .await;

    if let Err(e) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response();
    }

    Json(json!({
        "transactionId": tx_id,
        "newBalance": new_balance,
    }))
    .into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AwardBody {
    user_id: String,
    amount: i32,
    description: Option<String>,
}

async fn economy_award(
    State(state): State<AppState>,
    app_auth: AuthAppServer,
    Json(body): Json<AwardBody>,
) -> Response {
    if body.amount <= 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Amount must be positive"})),
        )
            .into_response();
    }

    let platform_fee = (body.amount as f64 * 0.10).ceil() as i32;
    let net_amount = body.amount - platform_fee;

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    // Upsert balance
    let new_balance = sqlx::query_scalar::<_, i32>(
        r#"INSERT INTO coin_balances (user_id, balance, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO UPDATE SET balance = coin_balances.balance + $2, updated_at = NOW()
           RETURNING balance"#,
    )
    .bind(&body.user_id)
    .bind(net_amount)
    .fetch_one(&mut *tx)
    .await;

    let new_balance = match new_balance {
        Ok(b) => b,
        Err(e) => {
            let _ = tx.rollback().await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    // Record award transaction
    let tx_id = Uuid::new_v4();
    let _ = sqlx::query(
        r#"INSERT INTO coin_transactions (id, user_id, type, amount, related_app_id, description)
           VALUES ($1, $2, 'award', $3, $4, $5)"#,
    )
    .bind(tx_id)
    .bind(&body.user_id)
    .bind(net_amount)
    .bind(app_auth.app_id)
    .bind(&body.description)
    .execute(&mut *tx)
    .await;

    // Record platform fee transaction
    if platform_fee > 0 {
        let _ = sqlx::query(
            r#"INSERT INTO coin_transactions (id, user_id, type, amount, related_app_id, description)
               VALUES ($1, $2, 'platform_fee', $3, $4, 'Platform fee (10%)')"#,
        )
        .bind(Uuid::new_v4())
        .bind(&body.user_id)
        .bind(-platform_fee)
        .bind(app_auth.app_id)
        .execute(&mut *tx)
        .await;
    }

    if let Err(e) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response();
    }

    Json(json!({
        "transactionId": tx_id,
        "newBalance": new_balance,
        "platformFee": platform_fee,
    }))
    .into_response()
}

async fn economy_balance(
    State(state): State<AppState>,
    auth: AuthOAuthToken,
) -> Response {
    let balance = sqlx::query_scalar::<_, i32>(
        "SELECT balance FROM coin_balances WHERE user_id = $1",
    )
    .bind(&auth.user_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None)
    .unwrap_or(0);

    Json(json!({ "balance": balance })).into_response()
}

// ── Step 5b: User-authorized economy (OAuth Bearer) ────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PurchaseBody {
    product_id: Option<String>,
    amount: i32,
    description: Option<String>,
}

/// POST /api/v1/economy/purchase — user-authorized charge via OAuth Bearer token
async fn economy_purchase(
    State(state): State<AppState>,
    auth: AuthOAuthToken,
    Json(body): Json<PurchaseBody>,
) -> Response {
    if !auth.scope.split(|c: char| c == ',' || c == ' ').any(|s| !s.is_empty() && s.trim() == "economy") {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "insufficient_scope", "error_description": "Scope 'economy' required"})),
        )
            .into_response();
    }

    if body.amount <= 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Amount must be positive"})),
        )
            .into_response();
    }

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    // Ensure balance row exists
    let _ = sqlx::query(
        "INSERT INTO coin_balances (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING",
    )
    .bind(&auth.user_id)
    .execute(&mut *tx)
    .await;

    // Check and deduct balance atomically
    let updated = sqlx::query_scalar::<_, i32>(
        r#"UPDATE coin_balances
           SET balance = balance - $1, updated_at = NOW()
           WHERE user_id = $2 AND balance >= $1
           RETURNING balance"#,
    )
    .bind(body.amount)
    .bind(&auth.user_id)
    .fetch_optional(&mut *tx)
    .await;

    let new_balance = match updated {
        Ok(Some(b)) => b,
        Ok(None) => {
            let _ = tx.rollback().await;
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "insufficient_balance"})),
            )
                .into_response();
        }
        Err(e) => {
            let _ = tx.rollback().await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    // Record transaction
    let tx_id = Uuid::new_v4();
    let desc = body.description.unwrap_or_else(|| {
        match &body.product_id {
            Some(pid) => format!("Purchase: {}", pid),
            None => "Purchase".to_string(),
        }
    });
    let _ = sqlx::query(
        r#"INSERT INTO coin_transactions (id, user_id, type, amount, description)
           VALUES ($1, $2, 'purchase', $3, $4)"#,
    )
    .bind(tx_id)
    .bind(&auth.user_id)
    .bind(-body.amount)
    .bind(&desc)
    .execute(&mut *tx)
    .await;

    if let Err(e) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response();
    }

    Json(json!({
        "transactionId": tx_id,
        "newBalance": new_balance,
    }))
    .into_response()
}

#[derive(Deserialize)]
struct TransactionsQuery {
    limit: Option<i64>,
    offset: Option<i64>,
}

/// GET /api/v1/economy/transactions — user's transaction history via OAuth Bearer token
async fn economy_transactions(
    State(state): State<AppState>,
    auth: AuthOAuthToken,
    Query(q): Query<TransactionsQuery>,
) -> Response {
    if !auth.scope.split(|c: char| c == ',' || c == ' ').any(|s| !s.is_empty() && s.trim() == "economy") {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "insufficient_scope", "error_description": "Scope 'economy' required"})),
        )
            .into_response();
    }

    let limit = q.limit.unwrap_or(20).min(100).max(1);
    let offset = q.offset.unwrap_or(0).max(0);

    let total = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM coin_transactions WHERE user_id = $1",
    )
    .bind(&auth.user_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let rows = sqlx::query_as::<_, (Uuid, String, i32, Option<String>, chrono::DateTime<chrono::Utc>)>(
        r#"SELECT id, type, amount, description, created_at
           FROM coin_transactions
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3"#,
    )
    .bind(&auth.user_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let transactions: Vec<Value> = rows
                .into_iter()
                .map(|r| {
                    json!({
                        "id": r.0,
                        "type": r.1,
                        "amount": r.2,
                        "description": r.3,
                        "createdAt": r.4.to_rfc3339(),
                    })
                })
                .collect();
            Json(json!({
                "transactions": transactions,
                "total": total,
                "limit": limit,
                "offset": offset,
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
