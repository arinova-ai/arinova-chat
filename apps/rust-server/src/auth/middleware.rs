use axum::{
    extract::{FromRequestParts, State},
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Json},
};
use serde::Serialize;
use uuid::Uuid;

use crate::auth::session::validate_session;
use crate::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct AuthUser {
    pub id: String,
    pub email: String,
    pub name: String,
    pub username: Option<String>,
}

/// Authenticated agent extracted from `Authorization: Bearer <botToken>` header.
#[derive(Debug, Clone, Serialize)]
pub struct AuthAgent {
    pub id: Uuid,
    pub name: String,
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
                let user = AuthUser {
                    id: session.user_id,
                    email: session.email,
                    name: session.name,
                    username: session.username.clone(),
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
        let agent = sqlx::query_as::<_, (Uuid, String)>(
            "SELECT id, name FROM agents WHERE secret_token = $1",
        )
        .bind(token)
        .fetch_optional(&app_state.db)
        .await
        .map_err(|_| reject())?
        .ok_or_else(reject)?;

        Ok(AuthAgent {
            id: agent.0,
            name: agent.1,
        })
    }
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
