use axum::{
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::FromRef;
use crate::routes::oauth::AuthOAuthToken;
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
}

// ── Step 3: User Endpoints ──────────────────────────────────────

async fn user_profile(
    State(state): State<AppState>,
    auth: AuthOAuthToken,
) -> Response {
    let user = sqlx::query_as::<_, (String, String, String, Option<String>)>(
        r#"SELECT id, name, email, image FROM "user" WHERE id = $1"#,
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

// ── Step 4: Agent Proxy (placeholder) ───────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentChatBody {
    agent_id: String,
    prompt: String,
    #[allow(dead_code)]
    system_prompt: Option<String>,
}

async fn agent_chat(
    State(state): State<AppState>,
    auth: AuthOAuthToken,
    Json(body): Json<AgentChatBody>,
) -> Response {
    if !auth.scope.split(|c: char| c == ',' || c == ' ').any(|s| !s.is_empty() && s.trim() == "agents") {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "insufficient_scope", "error_description": "Scope 'agents' required"})),
        )
            .into_response();
    }

    // Verify agent belongs to user
    let agent_id = match Uuid::parse_str(&body.agent_id) {
        Ok(id) => id,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Invalid agentId"})),
            )
                .into_response();
        }
    };

    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM agents WHERE id = $1 AND owner_id = $2)",
    )
    .bind(agent_id)
    .bind(&auth.user_id)
    .fetch_one(&state.db)
    .await;

    match exists {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Agent not found or not owned by user"})),
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

    // Placeholder v1 response
    Json(json!({
        "response": format!("Agent proxy coming soon - agentId: {}", body.agent_id),
        "agentId": body.agent_id,
    }))
    .into_response()
}

async fn agent_chat_stream(
    State(state): State<AppState>,
    auth: AuthOAuthToken,
    Json(body): Json<AgentChatBody>,
) -> Response {
    if !auth.scope.split(|c: char| c == ',' || c == ' ').any(|s| !s.is_empty() && s.trim() == "agents") {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "insufficient_scope", "error_description": "Scope 'agents' required"})),
        )
            .into_response();
    }

    let agent_id = match Uuid::parse_str(&body.agent_id) {
        Ok(id) => id,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Invalid agentId"})),
            )
                .into_response();
        }
    };

    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM agents WHERE id = $1 AND owner_id = $2)",
    )
    .bind(agent_id)
    .bind(&auth.user_id)
    .fetch_one(&state.db)
    .await;

    match exists {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Agent not found or not owned by user"})),
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

    // Placeholder v1 — return SSE-style JSON for now
    Json(json!({
        "response": format!("Agent streaming proxy coming soon - agentId: {}", body.agent_id),
        "agentId": body.agent_id,
        "stream": false,
    }))
    .into_response()
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
