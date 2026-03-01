use axum::{
    extract::{FromRequestParts, Query, State},
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::middleware::FromRef;
use crate::auth::session::validate_session;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/oauth/authorize", get(authorize))
        .route("/oauth/authorize/consent", post(authorize_consent))
        .route("/oauth/token", post(token_exchange))
}

// ── GET /oauth/authorize ────────────────────────────────────────

#[derive(Deserialize)]
struct AuthorizeQuery {
    client_id: String,
    redirect_uri: String,
    scope: Option<String>,
    state: Option<String>,
}

async fn authorize(
    State(state): State<AppState>,
    Query(q): Query<AuthorizeQuery>,
) -> Response {
    // Validate client_id and redirect_uri
    let app = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id, redirect_uri FROM oauth_apps WHERE client_id = $1",
    )
    .bind(&q.client_id)
    .fetch_optional(&state.db)
    .await;

    let (app_id, registered_uri) = match app {
        Ok(Some(row)) => (row.0, row.1),
        Ok(None) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "invalid_client", "error_description": "Unknown client_id"})),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "server_error", "error_description": e.to_string()})),
            )
                .into_response();
        }
    };

    if q.redirect_uri != registered_uri {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_request", "error_description": "redirect_uri mismatch"})),
        )
            .into_response();
    }

    // Check if user is logged in via session cookie — we need the raw request parts
    // but axum already extracted them. We'll use a helper to try session validation.
    // Since we can't access cookies from Query extractor, we use a workaround:
    // The authorize endpoint is also callable with an Authorization header or cookie.
    // For now, return a JSON response that the frontend can use to redirect.
    // The actual flow: frontend calls this, if user is logged in the frontend sends
    // the session cookie, we validate it and issue a code.

    // This endpoint is called by the browser with cookies, so we need to validate
    // the session from the cookie. We'll parse it from state context.
    // Actually, we need to accept the cookie from the request. Let's use a different approach:
    // Make authorize accept an optional AuthUser.

    // Since we can't use the AuthUser extractor (it rejects if no session),
    // we return a redirect to the login page if not authenticated.
    // The frontend login page should redirect back here after login.

    let scope = q.scope.unwrap_or_else(|| "profile".to_string());

    // We need the code + redirect, but we don't have access to cookies here
    // through the Query extractor. Return JSON for the frontend to handle.
    // The frontend consent page will POST to complete the flow.

    (
        StatusCode::OK,
        Json(json!({
            "app_id": app_id,
            "client_id": q.client_id,
            "redirect_uri": q.redirect_uri,
            "scope": scope,
            "state": q.state,
        })),
    )
        .into_response()
}

// ── POST /oauth/token ───────────────────────────────────────────

#[derive(Deserialize)]
struct TokenRequest {
    grant_type: String,
    code: String,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
}

async fn token_exchange(
    State(state): State<AppState>,
    Json(body): Json<TokenRequest>,
) -> Response {
    if body.grant_type != "authorization_code" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "unsupported_grant_type"})),
        )
            .into_response();
    }

    // Verify client credentials
    let app = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id, redirect_uri FROM oauth_apps WHERE client_id = $1 AND client_secret = $2",
    )
    .bind(&body.client_id)
    .bind(&body.client_secret)
    .fetch_optional(&state.db)
    .await;

    let (app_id, registered_uri) = match app {
        Ok(Some(row)) => (row.0, row.1),
        Ok(None) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "invalid_client"})),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "server_error", "error_description": e.to_string()})),
            )
                .into_response();
        }
    };

    if body.redirect_uri != registered_uri {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_request", "error_description": "redirect_uri mismatch"})),
        )
            .into_response();
    }

    // Look up authorization code
    let code_row = sqlx::query_as::<_, (Uuid, String, Uuid, String, bool)>(
        r#"SELECT id, user_id, app_id, scope, used
           FROM oauth_codes
           WHERE code = $1 AND expires_at > NOW()"#,
    )
    .bind(&body.code)
    .fetch_optional(&state.db)
    .await;

    let (code_id, user_id, code_app_id, scope, used) = match code_row {
        Ok(Some(row)) => (row.0, row.1, row.2, row.3, row.4),
        Ok(None) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "invalid_grant", "error_description": "Code expired or invalid"})),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "server_error", "error_description": e.to_string()})),
            )
                .into_response();
        }
    };

    if used {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_grant", "error_description": "Code already used"})),
        )
            .into_response();
    }

    if code_app_id != app_id {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_grant", "error_description": "Code not issued to this client"})),
        )
            .into_response();
    }

    // Mark code as used
    let _ = sqlx::query("UPDATE oauth_codes SET used = TRUE WHERE id = $1")
        .bind(code_id)
        .execute(&state.db)
        .await;

    // Generate access token (7 days)
    let access_token = Uuid::new_v4().to_string();
    let expires_in: i64 = 604800; // 7 days in seconds

    let insert_result = sqlx::query(
        r#"INSERT INTO oauth_tokens (user_id, app_id, access_token, scope, expires_at)
           VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')"#,
    )
    .bind(&user_id)
    .bind(app_id)
    .bind(&access_token)
    .bind(&scope)
    .execute(&state.db)
    .await;

    if let Err(e) = insert_result {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "server_error", "error_description": e.to_string()})),
        )
            .into_response();
    }

    // Fetch user info
    let user = sqlx::query_as::<_, (String, String, String, Option<String>)>(
        r#"SELECT id, name, email, image FROM "user" WHERE id = $1"#,
    )
    .bind(&user_id)
    .fetch_optional(&state.db)
    .await;

    let user_json = match user {
        Ok(Some(u)) => json!({
            "id": u.0,
            "name": u.1,
            "email": u.2,
            "image": u.3,
        }),
        _ => json!({"id": user_id}),
    };

    Json(json!({
        "access_token": access_token,
        "token_type": "Bearer",
        "expires_in": expires_in,
        "scope": scope,
        "user": user_json,
    }))
    .into_response()
}

// ── POST /oauth/authorize/consent ───────────────────────────────
// Called by the frontend consent page after user confirms.
// Requires session cookie (AuthUser-like validation).

#[derive(Deserialize)]
struct ConsentBody {
    client_id: String,
    redirect_uri: String,
    scope: Option<String>,
    state: Option<String>,
}

pub async fn authorize_consent(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(body): Json<ConsentBody>,
) -> Response {
    // Extract session from cookie
    let cookie_header = headers
        .get("cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let token = extract_session_token(cookie_header);
    let user_id = match token {
        Some(t) => match validate_session(&state.db, &t).await {
            Ok(Some(session)) => session.user_id,
            _ => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({"error": "not_authenticated"})),
                )
                    .into_response();
            }
        },
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "not_authenticated"})),
            )
                .into_response();
        }
    };

    // Validate client_id and redirect_uri
    let app = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM oauth_apps WHERE client_id = $1 AND redirect_uri = $2",
    )
    .bind(&body.client_id)
    .bind(&body.redirect_uri)
    .fetch_optional(&state.db)
    .await;

    let app_id = match app {
        Ok(Some(row)) => row.0,
        Ok(None) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "invalid_client"})),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "server_error", "error_description": e.to_string()})),
            )
                .into_response();
        }
    };

    // Generate authorization code (5 min expiry)
    let code = Uuid::new_v4().to_string();
    let scope = body.scope.unwrap_or_else(|| "profile".to_string());

    let insert_result = sqlx::query(
        r#"INSERT INTO oauth_codes (code, user_id, app_id, redirect_uri, scope, state, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '5 minutes')"#,
    )
    .bind(&code)
    .bind(&user_id)
    .bind(app_id)
    .bind(&body.redirect_uri)
    .bind(&scope)
    .bind(&body.state)
    .execute(&state.db)
    .await;

    if let Err(e) = insert_result {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "server_error", "error_description": e.to_string()})),
        )
            .into_response();
    }

    // Build redirect URL with code and state
    let mut redirect_url = format!("{}?code={}", body.redirect_uri, code);
    if let Some(ref st) = body.state {
        redirect_url.push_str(&format!("&state={}", st));
    }

    Json(json!({
        "redirect_url": redirect_url,
        "code": code,
    }))
    .into_response()
}

// ── Bearer Token Extractor ──────────────────────────────────────

#[derive(Debug, Clone)]
pub struct AuthOAuthToken {
    pub user_id: String,
    pub scope: String,
}

impl<S> FromRequestParts<S> for AuthOAuthToken
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
                Json(json!({"error": "invalid_token"})),
            )
        };

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

        let row = sqlx::query_as::<_, (String, String)>(
            "SELECT user_id, scope FROM oauth_tokens WHERE access_token = $1 AND expires_at > NOW()",
        )
        .bind(token)
        .fetch_optional(&app_state.db)
        .await
        .map_err(|_| reject())?
        .ok_or_else(reject)?;

        Ok(AuthOAuthToken {
            user_id: row.0,
            scope: row.1,
        })
    }
}

// ── Helpers ─────────────────────────────────────────────────────

fn extract_session_token(cookie_header: &str) -> Option<String> {
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
