use axum::{
    extract::{FromRequestParts, Query, State},
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Json, Redirect, Response},
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::auth::middleware::{AuthUser, FromRef};
use crate::auth::session::validate_session;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/oauth/authorize", get(authorize))
        .route("/oauth/authorize/consent", post(authorize_consent))
        .route("/oauth/token", post(token_exchange))
        .route("/api/oauth/internal-token", post(internal_token))
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

/// Compare redirect_uri by origin (scheme + host + port).
/// Returns true if the origins match, ignoring path/query/fragment.
fn origins_match(registered: &str, provided: &str) -> bool {
    fn extract_origin(u: &str) -> Option<String> {
        let parsed = url::Url::parse(u).ok()?;
        let host = parsed.host_str()?;
        match parsed.port() {
            Some(p) => Some(format!("{}://{}:{}", parsed.scheme(), host, p)),
            None => Some(format!("{}://{}", parsed.scheme(), host)),
        }
    }
    match (extract_origin(registered), extract_origin(provided)) {
        (Some(a), Some(b)) => a == b,
        _ => false,
    }
}

/// Verify PKCE code_verifier against stored code_challenge (S256).
fn verify_pkce(code_verifier: &str, code_challenge: &str) -> bool {
    let mut hasher = Sha256::new();
    hasher.update(code_verifier.as_bytes());
    let hash = hasher.finalize();
    let computed = base64_url_encode(&hash);
    computed == code_challenge
}

fn base64_url_encode(data: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(data)
}

// ── GET /oauth/authorize ────────────────────────────────────────

#[derive(Deserialize)]
struct AuthorizeQuery {
    client_id: String,
    redirect_uri: String,
    scope: Option<String>,
    state: Option<String>,
    code_challenge: Option<String>,
    code_challenge_method: Option<String>,
}

async fn authorize(
    State(state): State<AppState>,
    Query(q): Query<AuthorizeQuery>,
) -> Response {
    // Validate client_id
    let app = sqlx::query_as::<_, (Uuid, String, String, bool)>(
        "SELECT id, redirect_uri, name, is_public FROM oauth_apps WHERE client_id = $1",
    )
    .bind(&q.client_id)
    .fetch_optional(&state.db)
    .await;

    let (_app_id, registered_uri, app_name, is_public) = match app {
        Ok(Some(row)) => (row.0, row.1, row.2, row.3),
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

    // redirect_uri: public client = origin match, confidential = exact match
    let uri_ok = if is_public {
        origins_match(&registered_uri, &q.redirect_uri)
    } else {
        q.redirect_uri == registered_uri
    };
    if !uri_ok {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_request", "error_description": "redirect_uri mismatch"})),
        )
            .into_response();
    }

    // Public clients must provide code_challenge at authorize time
    if is_public && q.code_challenge.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_request", "error_description": "Public clients must use PKCE (code_challenge required)"})),
        )
            .into_response();
    }

    // Validate code_challenge_method if provided
    if let Some(ref method) = q.code_challenge_method {
        if method != "S256" {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "invalid_request", "error_description": "Only S256 code_challenge_method is supported"})),
            )
                .into_response();
        }
    }

    // Redirect to the frontend consent page
    let frontend_url = state
        .config
        .frontend_url
        .clone()
        .or_else(|| {
            state.config.cors_origins().into_iter()
                .find(|o| o != "*")
        })
        .unwrap_or_else(|| "http://localhost:21000".to_string());

    let scope = q.scope.unwrap_or_else(|| "profile".to_string());

    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    serializer
        .append_pair("client_id", &q.client_id)
        .append_pair("redirect_uri", &q.redirect_uri)
        .append_pair("scope", &scope)
        .append_pair("app_name", &app_name);

    if let Some(ref cc) = q.code_challenge {
        serializer.append_pair("code_challenge", cc);
    }
    if let Some(ref ccm) = q.code_challenge_method {
        serializer.append_pair("code_challenge_method", ccm);
    }

    let consent_params = serializer.finish();
    let mut consent_url = format!("{}/oauth/authorize?{}", frontend_url, consent_params);
    if let Some(ref st) = q.state {
        consent_url.push_str(&format!(
            "&state={}",
            url::form_urlencoded::byte_serialize(st.as_bytes()).collect::<String>()
        ));
    }

    Redirect::temporary(&consent_url).into_response()
}

// ── POST /oauth/authorize/consent ───────────────────────────────

#[derive(Deserialize)]
struct ConsentBody {
    client_id: String,
    redirect_uri: String,
    scope: Option<String>,
    state: Option<String>,
    code_challenge: Option<String>,
    code_challenge_method: Option<String>,
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

    // Validate client_id
    let app = sqlx::query_as::<_, (Uuid, String, bool)>(
        "SELECT id, redirect_uri, is_public FROM oauth_apps WHERE client_id = $1",
    )
    .bind(&body.client_id)
    .fetch_optional(&state.db)
    .await;

    let (app_id, registered_uri, is_public) = match app {
        Ok(Some(row)) => (row.0, row.1, row.2),
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

    // redirect_uri: public client = origin match, confidential = exact match
    let uri_ok = if is_public {
        origins_match(&registered_uri, &body.redirect_uri)
    } else {
        body.redirect_uri == registered_uri
    };
    if !uri_ok {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_request", "error_description": "redirect_uri mismatch"})),
        )
            .into_response();
    }

    // Generate authorization code (5 min expiry)
    let code = Uuid::new_v4().to_string();
    let scope = body.scope.unwrap_or_else(|| "profile".to_string());

    let insert_result = sqlx::query(
        r#"INSERT INTO oauth_codes (code, user_id, app_id, redirect_uri, scope, state, code_challenge, code_challenge_method, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW() + INTERVAL '5 minutes')"#,
    )
    .bind(&code)
    .bind(&user_id)
    .bind(app_id)
    .bind(&body.redirect_uri)
    .bind(&scope)
    .bind(&body.state)
    .bind(&body.code_challenge)
    .bind(&body.code_challenge_method)
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

// ── POST /oauth/token ───────────────────────────────────────────

#[derive(Deserialize)]
struct TokenRequest {
    grant_type: String,
    code: String,
    client_id: String,
    client_secret: Option<String>,
    redirect_uri: String,
    code_verifier: Option<String>,
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

    // Look up the app
    let app = sqlx::query_as::<_, (Uuid, String, String, bool)>(
        "SELECT id, client_secret, redirect_uri, is_public FROM oauth_apps WHERE client_id = $1",
    )
    .bind(&body.client_id)
    .fetch_optional(&state.db)
    .await;

    let (app_id, stored_secret, registered_uri, is_public) = match app {
        Ok(Some(row)) => (row.0, row.1, row.2, row.3),
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

    // Confidential client: require client_secret
    if !is_public {
        match &body.client_secret {
            Some(secret) if secret == &stored_secret => {}
            _ => {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(json!({"error": "invalid_client", "error_description": "Invalid client_secret"})),
                )
                    .into_response();
            }
        }
    }

    // redirect_uri: public client = origin match, confidential = exact match
    let uri_ok = if is_public {
        origins_match(&registered_uri, &body.redirect_uri)
    } else {
        body.redirect_uri == registered_uri
    };
    if !uri_ok {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_request", "error_description": "redirect_uri mismatch"})),
        )
            .into_response();
    }

    // Look up authorization code (include PKCE fields)
    let code_row = sqlx::query_as::<_, (Uuid, String, Uuid, String, bool, Option<String>, Option<String>)>(
        r#"SELECT id, user_id, app_id, scope, used, code_challenge, code_challenge_method
           FROM oauth_codes
           WHERE code = $1 AND expires_at > NOW()"#,
    )
    .bind(&body.code)
    .fetch_optional(&state.db)
    .await;

    let (code_id, user_id, code_app_id, scope, used, code_challenge, _code_challenge_method) = match code_row {
        Ok(Some(row)) => (row.0, row.1, row.2, row.3, row.4, row.5, row.6),
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

    // PKCE verification for public clients
    if let Some(ref challenge) = code_challenge {
        match &body.code_verifier {
            Some(verifier) => {
                if !verify_pkce(verifier, challenge) {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({"error": "invalid_grant", "error_description": "PKCE verification failed"})),
                    )
                        .into_response();
                }
            }
            None => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "invalid_request", "error_description": "code_verifier required for PKCE flow"})),
                )
                    .into_response();
            }
        }
    } else if is_public {
        // Public client without PKCE is not allowed
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_request", "error_description": "Public clients must use PKCE"})),
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

// ── Internal Token (session → OAuth token for PiP iframes) ──────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InternalTokenBody {
    app_id: Option<String>,
}

/// POST /api/oauth/internal-token
/// Exchanges user session cookie for an OAuth access_token.
/// If appId is provided, token is scoped to that app.
/// If omitted, creates a first-party token (app_id = NULL).
async fn internal_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<InternalTokenBody>,
) -> Response {
    // Resolve app_id if provided
    let app_id: Option<Uuid> = if let Some(ref client_id) = body.app_id {
        let app = sqlx::query_as::<_, (Uuid,)>(
            "SELECT id FROM oauth_apps WHERE client_id = $1",
        )
        .bind(client_id)
        .fetch_optional(&state.db)
        .await;

        match app {
            Ok(Some(row)) => Some(row.0),
            Ok(None) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "invalid_app", "error_description": "App not found"})),
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
        }
    } else {
        None
    };

    let scope = "profile";

    // Check for existing valid token (match on app_id or IS NULL)
    let existing = if let Some(aid) = app_id {
        sqlx::query_as::<_, (String, i64)>(
            r#"SELECT access_token,
                      EXTRACT(EPOCH FROM (expires_at - NOW()))::BIGINT AS remaining
               FROM oauth_tokens
               WHERE user_id = $1 AND app_id = $2 AND expires_at > NOW() + INTERVAL '1 hour'
               ORDER BY expires_at DESC
               LIMIT 1"#,
        )
        .bind(&auth.id)
        .bind(aid)
        .fetch_optional(&state.db)
        .await
    } else {
        sqlx::query_as::<_, (String, i64)>(
            r#"SELECT access_token,
                      EXTRACT(EPOCH FROM (expires_at - NOW()))::BIGINT AS remaining
               FROM oauth_tokens
               WHERE user_id = $1 AND app_id IS NULL AND expires_at > NOW() + INTERVAL '1 hour'
               ORDER BY expires_at DESC
               LIMIT 1"#,
        )
        .bind(&auth.id)
        .fetch_optional(&state.db)
        .await
    };

    if let Ok(Some(row)) = existing {
        return Json(json!({
            "accessToken": row.0,
            "expiresIn": row.1,
        }))
        .into_response();
    }

    // Generate new token (7 days)
    let access_token = Uuid::new_v4().to_string();
    let expires_in: i64 = 604800;

    let insert = sqlx::query(
        r#"INSERT INTO oauth_tokens (user_id, app_id, access_token, scope, expires_at)
           VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')"#,
    )
    .bind(&auth.id)
    .bind(app_id)
    .bind(&access_token)
    .bind(scope)
    .execute(&state.db)
    .await;

    if let Err(e) = insert {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "server_error", "error_description": e.to_string()})),
        )
            .into_response();
    }

    Json(json!({
        "accessToken": access_token,
        "expiresIn": expires_in,
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
