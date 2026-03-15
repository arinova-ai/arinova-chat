use axum::{
    extract::FromRequestParts,
    http::{request::Parts, StatusCode},
    response::Json,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::auth::session::validate_session;
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct AuthUser {
    pub id: String,
    pub email: String,
    pub name: String,
    pub username: Option<String>,
    pub is_verified: bool,
}

/// Authenticated admin user. Checks that the user's email is in ADMIN_EMAILS.
#[derive(Debug, Clone, Serialize)]
pub struct AuthAdmin {
    pub id: String,
    pub email: String,
}

impl<S> FromRequestParts<S> for AuthAdmin
where
    S: Send + Sync,
    AppState: FromRef<S>,
{
    type Rejection = (StatusCode, Json<serde_json::Value>);

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let auth_user = AuthUser::from_request_parts(parts, state).await?;
        let app_state = AppState::from_ref(state);
        if !app_state.config.admin_emails.contains(&auth_user.email) {
            return Err((
                StatusCode::FORBIDDEN,
                Json(serde_json::json!({"error": "Admin access required"})),
            ));
        }
        Ok(AuthAdmin {
            id: auth_user.id,
            email: auth_user.email,
        })
    }
}

/// Authenticated agent extracted from `Authorization: Bearer <botToken>` header.
#[derive(Debug, Clone, Serialize)]
pub struct AuthAgent {
    pub id: Uuid,
    pub name: String,
    pub owner_id: String,
}

impl<S> FromRequestParts<S> for AuthUser
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
                Json(serde_json::json!({"error": "Unauthorized"})),
            )
        };

        // Check for CLI API key in Authorization header (ari_cli_ prefix)
        let auth_header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        if let Some(api_key) = auth_header.strip_prefix("Bearer ").filter(|t| t.starts_with("ari_cli_")) {
            let mut hasher = Sha256::new();
            hasher.update(api_key.as_bytes());
            let key_hash = hex::encode(hasher.finalize());

            let row = sqlx::query_as::<_, (String, String, String, Option<String>, bool)>(
                r#"SELECT k.user_id, u.email, u.name, u.username, u.banned
                   FROM creator_api_keys k
                   JOIN "user" u ON u.id = k.user_id
                   WHERE k.key_hash = $1 AND k.revoked_at IS NULL"#,
            )
            .bind(&key_hash)
            .fetch_optional(&app_state.db)
            .await
            .map_err(|_| reject())?
            .ok_or_else(reject)?;

            if row.4 {
                return Err((
                    StatusCode::FORBIDDEN,
                    Json(serde_json::json!({"error": "Your account has been banned", "code": "ACCOUNT_BANNED"})),
                ));
            }

            // Update last_used_at (fire-and-forget)
            let db = app_state.db.clone();
            let hash = key_hash.clone();
            tokio::spawn(async move {
                let _ = sqlx::query("UPDATE creator_api_keys SET last_used_at = NOW() WHERE key_hash = $1")
                    .bind(&hash)
                    .execute(&db)
                    .await;
            });

            return Ok(AuthUser {
                id: row.0,
                email: row.1,
                name: row.2,
                username: row.3,
                is_verified: true,
            });
        }

        // Extract session token from cookie header
        let cookie_header = parts
            .headers
            .get("cookie")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        let token = extract_session_token(cookie_header);
        let token = match token {
            Some(t) => t,
            None => return Err(reject()),
        };

        match validate_session(&app_state.db, &token).await {
            Ok(Some(session)) => {
                // Check if user is banned
                if session.banned {
                    return Err((
                        StatusCode::FORBIDDEN,
                        Json(serde_json::json!({"error": "Your account has been banned", "code": "ACCOUNT_BANNED"})),
                    ));
                }

                let user = AuthUser {
                    id: session.user_id,
                    email: session.email,
                    name: session.name,
                    username: session.username.clone(),
                    is_verified: session.is_verified,
                };

                // Require username for most API routes
                if session.username.is_none() {
                    let path = parts.uri.path();
                    let exempt = path.starts_with("/api/users/username")
                        || path.starts_with("/api/auth/");
                    if !exempt {
                        return Err((
                            StatusCode::FORBIDDEN,
                            Json(serde_json::json!({"error": "Username required", "code": "USERNAME_REQUIRED"})),
                        ));
                    }
                }

                Ok(user)
            }
            _ => Err(reject()),
        }
    }
}

impl<S> FromRequestParts<S> for AuthAgent
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
                Json(serde_json::json!({"error": "Unauthorized"})),
            )
        };

        // Extract Bearer token from Authorization header
        let auth_header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        let token = auth_header
            .strip_prefix("Bearer ")
            .map(|t| t.trim())
            .filter(|t| !t.is_empty())
            .ok_or_else(reject)?;

        // Look up agent by secret_token
        let agent = sqlx::query_as::<_, (Uuid, String, String)>(
            "SELECT id, name, owner_id FROM agents WHERE secret_token = $1",
        )
        .bind(token)
        .fetch_optional(&app_state.db)
        .await
        .map_err(|_| reject())?
        .ok_or_else(reject)?;

        // IP Whitelist check: extract client IP and validate against owner's whitelist
        let client_ip = extract_client_ip(parts);

        // Check if whitelist is enabled for this owner
        let wl_enabled = crate::routes::user_settings::is_ip_whitelist_enabled(
            &app_state.db, &agent.2,
        ).await.unwrap_or(false);

        if wl_enabled {
            let Some(ref ip) = client_ip else {
                // Whitelist enabled but cannot determine client IP — reject
                let _ = sqlx::query(
                    r#"INSERT INTO agent_security_logs (agent_id, event_type, details)
                       VALUES ($1, 'ip_blocked', $2)"#,
                )
                .bind(agent.0)
                .bind(serde_json::json!({"ip": serde_json::Value::Null, "agent_name": agent.1, "reason": "no_client_ip"}))
                .execute(&app_state.db)
                .await;

                return Err((
                    StatusCode::FORBIDDEN,
                    Json(serde_json::json!({"error": "Cannot determine client IP; connection rejected by IP whitelist"})),
                ));
            };

            let allowed = crate::routes::user_settings::check_ip_whitelist(
                &app_state.db, &agent.2, ip,
            ).await.unwrap_or(false);

            if !allowed {
                let _ = sqlx::query(
                    r#"INSERT INTO agent_security_logs (agent_id, event_type, details)
                       VALUES ($1, 'ip_blocked', $2)"#,
                )
                .bind(agent.0)
                .bind(serde_json::json!({"ip": ip, "agent_name": agent.1}))
                .execute(&app_state.db)
                .await;

                return Err((
                    StatusCode::FORBIDDEN,
                    Json(serde_json::json!({"error": "IP address not in whitelist"})),
                ));
            }
        }

        Ok(AuthAgent {
            id: agent.0,
            name: agent.1,
            owner_id: agent.2,
        })
    }
}

/// Extract the client IP from request headers (X-Forwarded-For, X-Real-IP, or direct).
fn extract_client_ip(parts: &Parts) -> Option<String> {
    // Prefer X-Forwarded-For (first IP is the client)
    if let Some(xff) = parts.headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        if let Some(first) = xff.split(',').next() {
            let ip = first.trim();
            if !ip.is_empty() {
                return Some(ip.to_string());
            }
        }
    }
    // Fallback to X-Real-IP
    if let Some(xri) = parts.headers.get("x-real-ip").and_then(|v| v.to_str().ok()) {
        let ip = xri.trim();
        if !ip.is_empty() {
            return Some(ip.to_string());
        }
    }
    None
}

/// Extract the Better Auth session token from the cookie header.
/// Better Auth uses `better-auth.session_token` cookie.
fn extract_session_token(cookie_header: &str) -> Option<String> {
    for cookie in cookie_header.split(';') {
        let cookie = cookie.trim();
        // Better Auth cookie name
        if let Some(value) = cookie.strip_prefix("better-auth.session_token=") {
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

/// Helper trait for state extraction
pub trait FromRef<T> {
    fn from_ref(input: &T) -> Self;
}

impl FromRef<AppState> for AppState {
    fn from_ref(input: &AppState) -> Self {
        input.clone()
    }
}
