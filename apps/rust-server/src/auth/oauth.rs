use chrono::Utc;
use rand::Rng;
use reqwest::Client;
use serde::Deserialize;
use sqlx::PgPool;

use crate::auth::session;
use crate::config::Config;

#[derive(Deserialize)]
struct GoogleTokenResponse {
    access_token: String,
    id_token: Option<String>,
}

#[derive(Deserialize)]
struct GoogleUserInfo {
    sub: String,
    email: String,
    name: String,
    picture: Option<String>,
    email_verified: Option<bool>,
}

#[derive(Deserialize)]
struct GitHubTokenResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct GitHubUserInfo {
    id: i64,
    login: String,
    name: Option<String>,
    email: Option<String>,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
struct GitHubEmail {
    email: String,
    primary: bool,
    verified: bool,
}

fn generate_user_id() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.gen()).collect();
    hex::encode(bytes)
}

fn generate_account_id() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.gen()).collect();
    hex::encode(bytes)
}

// ===== Google OAuth =====

pub fn google_auth_url(config: &Config, callback_url: &str) -> String {
    format!(
        "https://accounts.google.com/o/oauth2/v2/auth?client_id={}&redirect_uri={}&response_type=code&scope=openid%20email%20profile&access_type=offline",
        urlencoding::encode(&config.google_client_id),
        urlencoding::encode(callback_url),
    )
}

pub async fn handle_google_callback(
    pool: &PgPool,
    config: &Config,
    code: &str,
    callback_url: &str,
) -> Result<session::SessionData, anyhow::Error> {
    let client = Client::new();

    // Exchange code for token
    let token_resp: GoogleTokenResponse = client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code),
            ("client_id", &config.google_client_id),
            ("client_secret", &config.google_client_secret),
            ("redirect_uri", callback_url),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await?
        .json()
        .await?;

    // Get user info
    let user_info: GoogleUserInfo = client
        .get("https://www.googleapis.com/oauth2/v3/userinfo")
        .bearer_auth(&token_resp.access_token)
        .send()
        .await?
        .json()
        .await?;

    // Find or create user + account
    let user_id =
        find_or_create_oauth_user(pool, &user_info.email, &user_info.name, user_info.picture.as_deref()).await?;

    // Upsert account
    upsert_oauth_account(
        pool,
        &user_id,
        &user_info.sub,
        "google",
        Some(&token_resp.access_token),
        token_resp.id_token.as_deref(),
    )
    .await?;

    // Create session
    let session_data = session::create_session(pool, &user_id, None, None).await?;
    Ok(session_data)
}

// ===== GitHub OAuth =====

pub fn github_auth_url(config: &Config, callback_url: &str) -> String {
    format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}&scope=user:email",
        urlencoding::encode(&config.github_client_id),
        urlencoding::encode(callback_url),
    )
}

pub async fn handle_github_callback(
    pool: &PgPool,
    config: &Config,
    code: &str,
) -> Result<session::SessionData, anyhow::Error> {
    let client = Client::new();

    // Exchange code for token
    let token_resp: GitHubTokenResponse = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("code", code),
            ("client_id", &config.github_client_id as &str),
            ("client_secret", &config.github_client_secret as &str),
        ])
        .send()
        .await?
        .json()
        .await?;

    // Get user info
    let user_info: GitHubUserInfo = client
        .get("https://api.github.com/user")
        .bearer_auth(&token_resp.access_token)
        .header("User-Agent", "Arinova-Server")
        .send()
        .await?
        .json()
        .await?;

    // Get primary email if not in user info
    let email = if let Some(email) = &user_info.email {
        email.clone()
    } else {
        let emails: Vec<GitHubEmail> = client
            .get("https://api.github.com/user/emails")
            .bearer_auth(&token_resp.access_token)
            .header("User-Agent", "Arinova-Server")
            .send()
            .await?
            .json()
            .await?;
        emails
            .into_iter()
            .find(|e| e.primary && e.verified)
            .map(|e| e.email)
            .ok_or_else(|| anyhow::anyhow!("No verified primary email found"))?
    };

    let name = user_info.name.unwrap_or(user_info.login.clone());

    // Find or create user
    let user_id = find_or_create_oauth_user(pool, &email, &name, user_info.avatar_url.as_deref()).await?;

    // Upsert account
    upsert_oauth_account(
        pool,
        &user_id,
        &user_info.id.to_string(),
        "github",
        Some(&token_resp.access_token),
        None,
    )
    .await?;

    let session_data = session::create_session(pool, &user_id, None, None).await?;
    Ok(session_data)
}

// ===== Helpers =====

async fn find_or_create_oauth_user(
    pool: &PgPool,
    email: &str,
    raw_name: &str,
    image: Option<&str>,
) -> Result<String, sqlx::Error> {
    // Sanitize external display name (strip HTML tags, enforce max 50 chars)
    let name = sanitize_display_name(raw_name);

    // Check if user exists by email
    let existing = sqlx::query_as::<_, (String,)>(r#"SELECT id FROM "user" WHERE email = $1"#)
        .bind(email)
        .fetch_optional(pool)
        .await?;

    if let Some((user_id,)) = existing {
        // Update image if provided
        if let Some(img) = image {
            sqlx::query(r#"UPDATE "user" SET image = $1, updated_at = NOW() WHERE id = $2"#)
                .bind(img)
                .bind(&user_id)
                .execute(pool)
                .await?;
        }
        return Ok(user_id);
    }

    // Create new user
    let user_id = generate_user_id();
    let now = Utc::now().naive_utc();

    sqlx::query(
        r#"INSERT INTO "user" (id, name, email, email_verified, image, created_at, updated_at)
           VALUES ($1, $2, $3, true, $4, $5, $5)"#,
    )
    .bind(&user_id)
    .bind(&name)
    .bind(email)
    .bind(image)
    .bind(now)
    .execute(pool)
    .await?;

    Ok(user_id)
}

async fn upsert_oauth_account(
    pool: &PgPool,
    user_id: &str,
    account_id: &str,
    provider_id: &str,
    access_token: Option<&str>,
    id_token: Option<&str>,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().naive_utc();

    // Check if account exists
    let existing = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM account WHERE user_id = $1 AND provider_id = $2"#,
    )
    .bind(user_id)
    .bind(provider_id)
    .fetch_optional(pool)
    .await?;

    if let Some((existing_id,)) = existing {
        sqlx::query(
            r#"UPDATE account SET access_token = $1, id_token = $2, updated_at = $3 WHERE id = $4"#,
        )
        .bind(access_token)
        .bind(id_token)
        .bind(now)
        .bind(&existing_id)
        .execute(pool)
        .await?;
    } else {
        let id = generate_account_id();
        sqlx::query(
            r#"INSERT INTO account (id, user_id, account_id, provider_id, access_token, id_token, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $7)"#,
        )
        .bind(&id)
        .bind(user_id)
        .bind(account_id)
        .bind(provider_id)
        .bind(access_token)
        .bind(id_token)
        .bind(now)
        .execute(pool)
        .await?;
    }

    Ok(())
}

/// Strip HTML tags and enforce max 50 characters for display names.
fn sanitize_display_name(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut in_tag = false;
    for ch in raw.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    let trimmed = out.trim();
    if trimmed.len() > 50 {
        trimmed.chars().take(50).collect::<String>().trim_end().to_string()
    } else {
        trimmed.to_string()
    }
}

mod urlencoding {
    pub fn encode(s: &str) -> String {
        url_escape(s)
    }

    fn url_escape(s: &str) -> String {
        let mut result = String::new();
        for b in s.bytes() {
            match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    result.push(b as char);
                }
                _ => {
                    result.push_str(&format!("%{:02X}", b));
                }
            }
        }
        result
    }
}
