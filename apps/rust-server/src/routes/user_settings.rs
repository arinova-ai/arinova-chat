use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/user/settings", get(get_settings).put(update_settings))
}

/// GET /api/user/settings — get current user's settings (never returns the actual key)
async fn get_settings(State(state): State<AppState>, user: AuthUser) -> Response {
    let row = sqlx::query_as::<_, (Option<String>,)>(
        "SELECT gemini_api_key FROM user_settings WHERE user_id = $1",
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some((key,))) => Json(json!({
            "hasGeminiKey": key.is_some(),
        })).into_response(),
        Ok(None) => Json(json!({
            "hasGeminiKey": false,
        })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSettingsBody {
    gemini_api_key: Option<String>,
}

/// PUT /api/user/settings — update current user's settings
async fn update_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<UpdateSettingsBody>,
) -> Response {
    let raw_key = body.gemini_api_key.as_deref().map(|k| k.trim()).filter(|k| !k.is_empty());

    // Encrypt if encryption key is configured, otherwise store plaintext (dev)
    let stored_key = raw_key.map(|k| {
        if let Some(ref enc_key) = state.config.settings_encryption_key {
            encrypt_value(enc_key, k).unwrap_or_else(|e| {
                tracing::error!("Failed to encrypt API key: {}", e);
                k.to_string()
            })
        } else {
            k.to_string()
        }
    });

    let result = sqlx::query(
        r#"INSERT INTO user_settings (user_id, gemini_api_key, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO UPDATE SET gemini_api_key = $2, updated_at = NOW()"#,
    )
    .bind(&user.id)
    .bind(stored_key.as_deref())
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({
            "hasGeminiKey": raw_key.is_some(),
        })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// Decrypt a user's Gemini API key from DB. Used by other routes (e.g. notes ask_ai).
pub fn decrypt_api_key(config: &crate::config::Config, stored: &str) -> String {
    if let Some(ref enc_key) = config.settings_encryption_key {
        decrypt_value(enc_key, stored).unwrap_or_else(|_| stored.to_string())
    } else {
        stored.to_string()
    }
}

// ---------------------------------------------------------------------------
// AES-256-GCM encryption helpers
// ---------------------------------------------------------------------------

use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use aes_gcm::aead::Aead;
use base64::Engine;

/// Encrypt a plaintext string. Returns "enc:" + base64(nonce + ciphertext).
fn encrypt_value(hex_key: &str, plaintext: &str) -> Result<String, String> {
    let key_bytes = hex::decode(hex_key).map_err(|e| format!("bad hex key: {}", e))?;
    if key_bytes.len() != 32 {
        return Err(format!("key must be 32 bytes, got {}", key_bytes.len()));
    }
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;

    let mut nonce_bytes = [0u8; 12];
    use rand::RngCore;
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher.encrypt(nonce, plaintext.as_bytes()).map_err(|e| e.to_string())?;

    let mut combined = Vec::with_capacity(12 + ciphertext.len());
    combined.extend_from_slice(&nonce_bytes);
    combined.extend_from_slice(&ciphertext);
    Ok(format!("enc:{}", base64::engine::general_purpose::STANDARD.encode(&combined)))
}

/// Decrypt "enc:" + base64(nonce + ciphertext). Falls back to plaintext if no "enc:" prefix.
fn decrypt_value(hex_key: &str, stored: &str) -> Result<String, String> {
    let encoded = match stored.strip_prefix("enc:") {
        Some(e) => e,
        None => return Ok(stored.to_string()),
    };

    let key_bytes = hex::decode(hex_key).map_err(|e| format!("bad hex key: {}", e))?;
    if key_bytes.len() != 32 {
        return Err(format!("key must be 32 bytes, got {}", key_bytes.len()));
    }
    let cipher = Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| e.to_string())?;

    let combined = base64::engine::general_purpose::STANDARD.decode(encoded)
        .map_err(|e| format!("bad base64: {}", e))?;
    if combined.len() < 12 {
        return Err("ciphertext too short".into());
    }
    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher.decrypt(nonce, ciphertext).map_err(|e| e.to_string())?;
    String::from_utf8(plaintext).map_err(|e| e.to_string())
}
