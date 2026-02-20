use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Redirect, Response},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::auth::{
    oauth,
    password::{hash_password, verify_password},
    session::{self, validate_session},
};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/sign-up/email", post(sign_up_email))
        .route("/api/auth/sign-in/email", post(sign_in_email))
        .route("/api/auth/sign-out", post(sign_out))
        .route("/api/auth/get-session", get(get_session))
        .route(
            "/api/auth/sign-in/social",
            get(social_sign_in_redirect),
        )
        .route("/api/auth/callback/google", get(google_callback))
        .route("/api/auth/callback/github", get(github_callback))
}

#[derive(Deserialize)]
struct SignUpBody {
    email: String,
    password: String,
    name: String,
}

#[derive(Deserialize)]
struct SignInBody {
    email: String,
    password: String,
}

#[derive(Deserialize)]
struct SocialQuery {
    provider: String,
    #[serde(rename = "callbackURL")]
    callback_url: Option<String>,
}

#[derive(Deserialize)]
struct OAuthCallbackQuery {
    code: String,
}

async fn sign_up_email(
    State(state): State<AppState>,
    Json(body): Json<SignUpBody>,
) -> Response {
    // Check if user already exists
    let existing = sqlx::query_as::<_, (String,)>(r#"SELECT id FROM "user" WHERE email = $1"#)
        .bind(&body.email)
        .fetch_optional(&state.db)
        .await;

    match existing {
        Ok(Some(_)) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "User already exists"})),
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
        _ => {}
    }

    // Hash password
    let password_hash = match hash_password(&body.password) {
        Ok(h) => h,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to hash password"})),
            )
                .into_response();
        }
    };

    // Create user
    let user_id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().naive_utc();

    if let Err(e) = sqlx::query(
        r#"INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
           VALUES ($1, $2, $3, false, $4, $4)"#,
    )
    .bind(&user_id)
    .bind(&body.name)
    .bind(&body.email)
    .bind(now)
    .execute(&state.db)
    .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response();
    }

    // Create account with password
    let account_id = uuid::Uuid::new_v4().to_string();
    if let Err(e) = sqlx::query(
        r#"INSERT INTO account (id, user_id, account_id, provider_id, password, created_at, updated_at)
           VALUES ($1, $2, $3, 'credential', $4, $5, $5)"#,
    )
    .bind(&account_id)
    .bind(&user_id)
    .bind(&user_id)
    .bind(&password_hash)
    .bind(now)
    .execute(&state.db)
    .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response();
    }

    // Create session
    match session::create_session(&state.db, &user_id, None, None).await {
        Ok(session_data) => {
            let cookie = format!(
                "better-auth.session_token={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}",
                session_data.token,
                60 * 60 * 24 * 30
            );
            let mut resp = Json(json!({
                "user": {
                    "id": user_id,
                    "name": body.name,
                    "email": body.email,
                    "emailVerified": false,
                    "image": null,
                    "createdAt": now.to_string(),
                    "updatedAt": now.to_string(),
                },
                "session": {
                    "token": session_data.token,
                    "expiresAt": session_data.expires_at.to_string(),
                }
            }))
            .into_response();
            resp.headers_mut().insert(
                "set-cookie",
                cookie.parse().unwrap(),
            );
            resp
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn sign_in_email(
    State(state): State<AppState>,
    Json(body): Json<SignInBody>,
) -> Response {
    // Find user by email
    let user = sqlx::query_as::<_, (String, String)>(
        r#"SELECT id, name FROM "user" WHERE email = $1"#,
    )
    .bind(&body.email)
    .fetch_optional(&state.db)
    .await;

    let (user_id, user_name) = match user {
        Ok(Some(u)) => u,
        Ok(None) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Invalid email or password"})),
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
    };

    // Get password from account
    let account = sqlx::query_as::<_, (Option<String>,)>(
        r#"SELECT password FROM account WHERE user_id = $1 AND provider_id = 'credential'"#,
    )
    .bind(&user_id)
    .fetch_optional(&state.db)
    .await;

    let stored_hash = match account {
        Ok(Some((Some(h),))) => h,
        _ => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Invalid email or password"})),
            )
                .into_response();
        }
    };

    // Verify password
    if !verify_password(&body.password, &stored_hash) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Invalid email or password"})),
        )
            .into_response();
    }

    // Create session
    match session::create_session(&state.db, &user_id, None, None).await {
        Ok(session_data) => {
            let cookie = format!(
                "better-auth.session_token={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}",
                session_data.token,
                60 * 60 * 24 * 30
            );
            let mut resp = Json(json!({
                "user": {
                    "id": user_id,
                    "name": user_name,
                    "email": body.email,
                },
                "session": {
                    "token": session_data.token,
                    "expiresAt": session_data.expires_at.to_string(),
                }
            }))
            .into_response();
            resp.headers_mut().insert(
                "set-cookie",
                cookie.parse().unwrap(),
            );
            resp
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn sign_out(State(state): State<AppState>, headers: axum::http::HeaderMap) -> Response {
    let cookie_header = headers
        .get("cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if let Some(token) = extract_session_token(cookie_header) {
        let _ = session::delete_session(&state.db, &token).await;
    }

    let clear_cookie = "better-auth.session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
    let mut resp = Json(json!({"success": true})).into_response();
    resp.headers_mut()
        .insert("set-cookie", clear_cookie.parse().unwrap());
    resp
}

async fn get_session(State(state): State<AppState>, headers: axum::http::HeaderMap) -> Response {
    let cookie_header = headers
        .get("cookie")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let token = match extract_session_token(cookie_header) {
        Some(t) => t,
        None => {
            return (StatusCode::UNAUTHORIZED, Json(json!(null))).into_response();
        }
    };

    match validate_session(&state.db, &token).await {
        Ok(Some(s)) => Json(json!({
            "user": {
                "id": s.user_id,
                "name": s.name,
                "email": s.email,
                "image": s.image,
            },
            "session": {
                "token": token,
            }
        }))
        .into_response(),
        _ => (StatusCode::UNAUTHORIZED, Json(json!(null))).into_response(),
    }
}

async fn social_sign_in_redirect(
    State(state): State<AppState>,
    Query(query): Query<SocialQuery>,
) -> Response {
    let base_url = &state.config.better_auth_url;
    match query.provider.as_str() {
        "google" => {
            let callback = format!("{}/api/auth/callback/google", base_url);
            let url = oauth::google_auth_url(&state.config, &callback);
            Redirect::temporary(&url).into_response()
        }
        "github" => {
            let callback = format!("{}/api/auth/callback/github", base_url);
            let url = oauth::github_auth_url(&state.config, &callback);
            Redirect::temporary(&url).into_response()
        }
        _ => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Unsupported provider"})),
        )
            .into_response(),
    }
}

async fn google_callback(
    State(state): State<AppState>,
    Query(query): Query<OAuthCallbackQuery>,
) -> Response {
    let callback_url = format!("{}/api/auth/callback/google", state.config.better_auth_url);
    match oauth::handle_google_callback(&state.db, &state.config, &query.code, &callback_url).await
    {
        Ok(session_data) => {
            let cookie = format!(
                "better-auth.session_token={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}",
                session_data.token,
                60 * 60 * 24 * 30
            );
            // Redirect to frontend after successful OAuth
            let frontend_url = state.config.cors_origins().first().cloned().unwrap_or_else(|| "http://localhost:3500".to_string());
            let mut resp = Redirect::temporary(&frontend_url).into_response();
            resp.headers_mut()
                .insert("set-cookie", cookie.parse().unwrap());
            resp
        }
        Err(e) => {
            tracing::error!("Google OAuth error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "OAuth failed"})),
            )
                .into_response()
        }
    }
}

async fn github_callback(
    State(state): State<AppState>,
    Query(query): Query<OAuthCallbackQuery>,
) -> Response {
    match oauth::handle_github_callback(&state.db, &state.config, &query.code).await {
        Ok(session_data) => {
            let cookie = format!(
                "better-auth.session_token={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}",
                session_data.token,
                60 * 60 * 24 * 30
            );
            let frontend_url = state.config.cors_origins().first().cloned().unwrap_or_else(|| "http://localhost:3500".to_string());
            let mut resp = Redirect::temporary(&frontend_url).into_response();
            resp.headers_mut()
                .insert("set-cookie", cookie.parse().unwrap());
            resp
        }
        Err(e) => {
            tracing::error!("GitHub OAuth error: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "OAuth failed"})),
            )
                .into_response()
        }
    }
}

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
