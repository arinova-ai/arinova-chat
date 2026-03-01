use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use p256::ecdsa::{signature::Signer, SigningKey};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::config::Config;

#[derive(Debug, Serialize, Deserialize)]
pub struct PushPayload {
    #[serde(rename = "type")]
    pub notification_type: String,
    pub title: String,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

/// Send push notification to all subscriptions for a user.
/// Automatically removes expired/invalid subscriptions (410 Gone).
pub async fn send_push_to_user(
    pool: &PgPool,
    config: &Config,
    user_id: &str,
    payload: &PushPayload,
) -> Result<(), anyhow::Error> {
    if !config.is_push_enabled() {
        return Ok(());
    }

    let subs = sqlx::query_as::<_, (String, String, String, String)>(
        r#"SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1"#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    if subs.is_empty() {
        return Ok(());
    }

    let json_payload = serde_json::to_string(payload)?;
    let mut expired_ids: Vec<String> = Vec::new();

    let client = reqwest::Client::new();

    for (id, endpoint, p256dh, auth_key) in &subs {
        match send_web_push(
            &client,
            config,
            endpoint,
            p256dh,
            auth_key,
            json_payload.as_bytes(),
        )
        .await
        {
            Ok(status) => {
                if status == 404 || status == 410 {
                    expired_ids.push(id.clone());
                }
            }
            Err(e) => {
                tracing::warn!("Push notification failed for {}: {}", endpoint, e);
            }
        }
    }

    // Clean up expired subscriptions
    for id in &expired_ids {
        sqlx::query(r#"DELETE FROM push_subscriptions WHERE id = $1"#)
            .bind(id)
            .execute(pool)
            .await?;
    }

    Ok(())
}

/// Send a single web push notification.
/// Returns the HTTP status code.
async fn send_web_push(
    client: &reqwest::Client,
    config: &Config,
    endpoint: &str,
    _p256dh: &str,
    _auth: &str,
    payload: &[u8],
) -> Result<u16, anyhow::Error> {
    // For web push, we need VAPID JWT authorization
    let jwt = create_vapid_jwt(endpoint, &config.vapid_subject, &config.vapid_private_key)?;

    let vapid_header = format!(
        "vapid t={},k={}",
        jwt,
        config.vapid_public_key
    );

    let resp = client
        .post(endpoint)
        .header("Authorization", vapid_header)
        .header("Content-Type", "application/octet-stream")
        .header("TTL", "86400")
        .body(payload.to_vec())
        .send()
        .await?;

    Ok(resp.status().as_u16())
}

/// Create a VAPID JWT for web push authorization (ES256 / P-256 ECDSA).
fn create_vapid_jwt(
    endpoint: &str,
    subject: &str,
    private_key: &str,
) -> Result<String, anyhow::Error> {
    // Extract audience from endpoint URL
    let url: url::Url = endpoint.parse()?;
    let audience = format!("{}://{}", url.scheme(), url.host_str().unwrap_or(""));

    let now = chrono::Utc::now().timestamp();
    let exp = now + 12 * 3600; // 12 hours

    let header = serde_json::json!({
        "typ": "JWT",
        "alg": "ES256"
    });

    let claims = serde_json::json!({
        "aud": audience,
        "exp": exp,
        "sub": subject,
    });

    let header_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_string(&header)?.as_bytes());
    let claims_b64 = URL_SAFE_NO_PAD.encode(serde_json::to_string(&claims)?.as_bytes());

    let message = format!("{}.{}", header_b64, claims_b64);

    // Decode base64url private key (raw 32-byte P-256 scalar)
    let key_bytes = URL_SAFE_NO_PAD.decode(private_key)?;
    let secret_key = p256::SecretKey::from_slice(&key_bytes)
        .map_err(|e| anyhow::anyhow!("invalid VAPID private key: {}", e))?;
    let signing_key = SigningKey::from(secret_key);

    // ES256 sign (ECDSA P-256 + SHA-256, RFC 6979 deterministic)
    let signature: p256::ecdsa::Signature = signing_key.sign(message.as_bytes());
    let sig_b64 = URL_SAFE_NO_PAD.encode(signature.to_bytes());

    Ok(format!("{}.{}", message, sig_b64))
}
