use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    response::Json,
};
use uuid::Uuid;

use crate::auth::middleware::FromRef;
use crate::auth::session::validate_session;
use crate::AppState;

/// Unified caller identity for `/api/v1/*` routes.
///
/// Supports multiple authentication methods:
/// - Agent bot tokens (`ari_*` prefix in Authorization Bearer)
/// - User session cookies (Better Auth session token)
/// - CLI API keys (`ari_cli_*` prefix in Authorization Bearer)
#[derive(Debug, Clone)]
pub enum CallerIdentity {
    /// Authenticated via session cookie or CLI API key.
    User { user_id: Uuid },
    /// Authenticated via agent bot token (`ari_*` prefix).
    Agent { agent_id: Uuid, owner_id: Uuid },
    /// Authenticated via app API key (`ak_*` prefix in X-API-Key header).
    /// Placeholder for future use — the `api_keys` table does not exist yet.
    App { app_id: Uuid, user_id: Uuid },
}

impl CallerIdentity {
    /// Returns the data owner — the user whose data should be accessed.
    ///
    /// - `User` -> `user_id`
    /// - `Agent` -> `owner_id`
    /// - `App` -> `user_id`
    pub fn owner_id(&self) -> &Uuid {
        match self {
            CallerIdentity::User { user_id } => user_id,
            CallerIdentity::Agent { owner_id, .. } => owner_id,
            CallerIdentity::App { user_id, .. } => user_id,
        }
    }

    pub fn is_agent(&self) -> bool {
        matches!(self, CallerIdentity::Agent { .. })
    }

    pub fn is_user(&self) -> bool {
        matches!(self, CallerIdentity::User { .. })
    }

    pub fn agent_id(&self) -> Option<&Uuid> {
        match self {
            CallerIdentity::Agent { agent_id, .. } => Some(agent_id),
            _ => None,
        }
    }
}

impl<S> FromRequestParts<S> for CallerIdentity
where
    S: Send + Sync,
    AppState: FromRef<S>,
{
    type Rejection = (StatusCode, Json<serde_json::Value>);

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = AppState::from_ref(state);

        let unauthorized = || {
            (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({"error": "Unauthorized"})),
            )
        };

        // ── Extract headers ────────────────────────────────────────

        let auth_header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        let bearer_token = auth_header.strip_prefix("Bearer ").map(|t| t.trim());

        let x_agent_token = parts
            .headers
            .get("x-agent-token")
            .and_then(|v| v.to_str().ok())
            .map(|t| t.trim());

        let x_api_key = parts
            .headers
            .get("x-api-key")
            .and_then(|v| v.to_str().ok())
            .map(|t| t.trim());

        // ── Conflict check: JWT + X-Agent-Token → 400 ─────────────

        let has_session_cookie = extract_session_token_from_parts(parts).is_some();
        let has_jwt_like_bearer = bearer_token
            .map(|t| t.starts_with("eyJ"))
            .unwrap_or(false);

        if (has_jwt_like_bearer || has_session_cookie) && x_agent_token.is_some() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "error": "Ambiguous authentication: cannot use both user session and X-Agent-Token"
                })),
            ));
        }

        // ── 1. Agent bot token (ari_ prefix in Bearer) ────────────

        if let Some(token) = bearer_token.filter(|t| t.starts_with("ari_") && !t.starts_with("ari_cli_")) {
            return lookup_agent_by_token(&app_state, token).await;
        }

        // ── 2. Agent bot token via X-Agent-Token header ───────────

        if let Some(token) = x_agent_token.filter(|t| !t.is_empty()) {
            return lookup_agent_by_token(&app_state, token).await;
        }

        // ── 3. CLI API key (ari_cli_ prefix in Bearer) ────────────

        if let Some(api_key) = bearer_token.filter(|t| t.starts_with("ari_cli_")) {
            return lookup_cli_api_key(&app_state, api_key).await;
        }

        // ── 4. App API key (ak_ prefix in X-API-Key) ──────────────

        if let Some(key) = x_api_key.filter(|t| t.starts_with("ak_")) {
            return lookup_app_api_key(&app_state, key).await;
        }

        // ── 5. JWT-like Bearer token (starts with eyJ) ────────────

        if let Some(token) = bearer_token.filter(|t| t.starts_with("eyJ")) {
            // Treat JWT-like bearer as session token for validation
            return validate_session_token(&app_state, token).await;
        }

        // ── 6. Session cookie (Better Auth) ────────────────────────

        if let Some(token) = extract_session_token_from_parts(parts) {
            return validate_session_token(&app_state, &token).await;
        }

        // ── No valid auth found ────────────────────────────────────
        Err(unauthorized())
    }
}

/// Look up an agent by its `secret_token` in the `agents` table.
async fn lookup_agent_by_token(
    app_state: &AppState,
    token: &str,
) -> Result<CallerIdentity, (StatusCode, Json<serde_json::Value>)> {
    let reject = || {
        (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "Invalid agent token"})),
        )
    };

    let agent = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id, owner_id FROM agents WHERE secret_token = $1",
    )
    .bind(token)
    .fetch_optional(&app_state.db)
    .await
    .map_err(|_| reject())?
    .ok_or_else(reject)?;

    let owner_id = Uuid::parse_str(&agent.1).map_err(|_| reject())?;

    Ok(CallerIdentity::Agent {
        agent_id: agent.0,
        owner_id,
    })
}

/// Look up a CLI API key (ari_cli_*) by hashing it and checking `creator_api_keys`.
async fn lookup_cli_api_key(
    app_state: &AppState,
    api_key: &str,
) -> Result<CallerIdentity, (StatusCode, Json<serde_json::Value>)> {
    use sha2::{Digest, Sha256};

    let reject = || {
        (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "Invalid API key"})),
        )
    };

    let mut hasher = Sha256::new();
    hasher.update(api_key.as_bytes());
    let key_hash = hex::encode(hasher.finalize());

    let row = sqlx::query_as::<_, (String, bool)>(
        r#"SELECT k.user_id, u.banned
           FROM creator_api_keys k
           JOIN "user" u ON u.id = k.user_id
           WHERE k.key_hash = $1 AND k.revoked_at IS NULL"#,
    )
    .bind(&key_hash)
    .fetch_optional(&app_state.db)
    .await
    .map_err(|_| reject())?
    .ok_or_else(reject)?;

    if row.1 {
        return Err((
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({
                "error": "Your account has been banned",
                "code": "ACCOUNT_BANNED"
            })),
        ));
    }

    // Fire-and-forget: update last_used_at
    let db = app_state.db.clone();
    let hash = key_hash.clone();
    tokio::spawn(async move {
        let _ = sqlx::query("UPDATE creator_api_keys SET last_used_at = NOW() WHERE key_hash = $1")
            .bind(&hash)
            .execute(&db)
            .await;
    });

    let user_id = Uuid::parse_str(&row.0).map_err(|_| reject())?;
    Ok(CallerIdentity::User { user_id })
}

/// Look up an app API key (ak_*) — placeholder for future `api_keys` table.
async fn lookup_app_api_key(
    _app_state: &AppState,
    _key: &str,
) -> Result<CallerIdentity, (StatusCode, Json<serde_json::Value>)> {
    // The `api_keys` table does not exist yet.
    // Return 401 until it is created.
    Err((
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({"error": "App API keys are not yet supported"})),
    ))
}

/// Validate a session token (from cookie or Bearer) using existing session logic.
async fn validate_session_token(
    app_state: &AppState,
    token: &str,
) -> Result<CallerIdentity, (StatusCode, Json<serde_json::Value>)> {
    let reject = || {
        (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "Invalid or expired session"})),
        )
    };

    match validate_session(&app_state.db, token).await {
        Ok(Some(session)) => {
            if session.banned {
                return Err((
                    StatusCode::FORBIDDEN,
                    Json(serde_json::json!({
                        "error": "Your account has been banned",
                        "code": "ACCOUNT_BANNED"
                    })),
                ));
            }

            let user_id = Uuid::parse_str(&session.user_id).map_err(|_| reject())?;
            Ok(CallerIdentity::User { user_id })
        }
        _ => Err(reject()),
    }
}

/// Extract the Better Auth session token from the cookie header.
fn extract_session_token_from_parts(parts: &Parts) -> Option<String> {
    let cookie_header = parts
        .headers
        .get("cookie")
        .and_then(|v| v.to_str().ok())?;

    for cookie in cookie_header.split(';') {
        let cookie = cookie.trim();
        if let Some(value) = cookie.strip_prefix("better-auth.session_token=") {
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}
