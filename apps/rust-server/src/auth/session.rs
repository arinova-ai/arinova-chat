use chrono::{NaiveDateTime, Utc};
use rand::Rng;
use sqlx::PgPool;

const SESSION_EXPIRY_SECS: i64 = 60 * 60 * 24 * 30; // 30 days
const SESSION_UPDATE_AGE_SECS: i64 = 60 * 60 * 24; // 1 day

/// Generate a random session token.
fn generate_token() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    hex::encode(bytes)
}

/// Generate a random session ID.
fn generate_session_id() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..16).map(|_| rng.gen()).collect();
    hex::encode(bytes)
}

pub struct SessionData {
    pub user_id: String,
    pub user_email: String,
    pub user_name: String,
    pub token: String,
    pub expires_at: NaiveDateTime,
}

/// Create a new session for a user.
pub async fn create_session(
    pool: &PgPool,
    user_id: &str,
    ip_address: Option<&str>,
    user_agent: Option<&str>,
) -> Result<SessionData, sqlx::Error> {
    let session_id = generate_session_id();
    let token = generate_token();
    let now = Utc::now().naive_utc();
    let expires_at = now + chrono::Duration::seconds(SESSION_EXPIRY_SECS);

    sqlx::query(
        r#"INSERT INTO "session" (id, user_id, token, expires_at, ip_address, user_agent, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $7)"#,
    )
    .bind(&session_id)
    .bind(user_id)
    .bind(&token)
    .bind(expires_at)
    .bind(ip_address)
    .bind(user_agent)
    .bind(now)
    .execute(pool)
    .await?;

    // Fetch user info
    let user = sqlx::query_as::<_, (String, String)>(
        r#"SELECT email, name FROM "user" WHERE id = $1"#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(SessionData {
        user_id: user_id.to_string(),
        user_email: user.0,
        user_name: user.1,
        token,
        expires_at,
    })
}

pub struct ValidatedSession {
    pub user_id: String,
    pub email: String,
    pub name: String,
    pub image: Option<String>,
    pub session_id: String,
    pub expires_at: NaiveDateTime,
}

/// Validate a session token. Returns user info if valid.
pub async fn validate_session(
    pool: &PgPool,
    token: &str,
) -> Result<Option<ValidatedSession>, sqlx::Error> {
    let row = sqlx::query_as::<_, (String, String, NaiveDateTime, NaiveDateTime)>(
        r#"SELECT id, user_id, expires_at, updated_at FROM "session" WHERE token = $1"#,
    )
    .bind(token)
    .fetch_optional(pool)
    .await?;

    let (session_id, user_id, expires_at, updated_at) = match row {
        Some(r) => r,
        None => return Ok(None),
    };

    let now = Utc::now().naive_utc();

    // Check expiry
    if now > expires_at {
        // Delete expired session
        sqlx::query(r#"DELETE FROM "session" WHERE id = $1"#)
            .bind(&session_id)
            .execute(pool)
            .await?;
        return Ok(None);
    }

    // Refresh session if older than update age
    let age = (now - updated_at).num_seconds();
    if age > SESSION_UPDATE_AGE_SECS {
        let new_expires = now + chrono::Duration::seconds(SESSION_EXPIRY_SECS);
        sqlx::query(r#"UPDATE "session" SET expires_at = $1, updated_at = $2 WHERE id = $3"#)
            .bind(new_expires)
            .bind(now)
            .bind(&session_id)
            .execute(pool)
            .await?;
    }

    // Fetch user
    let user = sqlx::query_as::<_, (String, String, Option<String>)>(
        r#"SELECT email, name, image FROM "user" WHERE id = $1"#,
    )
    .bind(&user_id)
    .fetch_optional(pool)
    .await?;

    match user {
        Some((email, name, image)) => Ok(Some(ValidatedSession {
            user_id,
            email,
            name,
            image,
            session_id,
            expires_at,
        })),
        None => Ok(None),
    }
}

/// Delete a session by token.
pub async fn delete_session(pool: &PgPool, token: &str) -> Result<(), sqlx::Error> {
    sqlx::query(r#"DELETE FROM "session" WHERE token = $1"#)
        .bind(token)
        .execute(pool)
        .await?;
    Ok(())
}
