use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, patch, post},
    Router,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/user/settings", get(get_settings).put(update_settings))
        .route("/api/settings/ip-whitelist", get(get_ip_whitelist).post(add_ip_whitelist))
        .route("/api/settings/ip-whitelist/{id}", delete(delete_ip_whitelist))
        .route("/api/settings/ip-whitelist/toggle", patch(toggle_ip_whitelist))
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

// ---------------------------------------------------------------------------
// IP Whitelist endpoints
// ---------------------------------------------------------------------------

/// GET /api/settings/ip-whitelist
async fn get_ip_whitelist(State(state): State<AppState>, user: AuthUser) -> Response {
    let enabled = sqlx::query_as::<_, (bool,)>(
        r#"SELECT COALESCE(ip_whitelist_enabled, false) FROM "user" WHERE id = $1"#,
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .map(|(e,)| e)
    .unwrap_or(false);

    let ips = sqlx::query_as::<_, (Uuid, String, chrono::NaiveDateTime)>(
        "SELECT id, ip_address, created_at FROM user_ip_whitelist WHERE user_id = $1 ORDER BY created_at",
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let items: Vec<serde_json::Value> = ips.into_iter().map(|(id, ip, created_at)| {
        json!({ "id": id, "ipAddress": ip, "createdAt": created_at.and_utc().to_rfc3339() })
    }).collect();

    Json(json!({ "enabled": enabled, "ips": items })).into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddIpBody {
    ip_address: String,
}

/// POST /api/settings/ip-whitelist
async fn add_ip_whitelist(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<AddIpBody>,
) -> Response {
    let ip = body.ip_address.trim().to_string();
    if ip.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "IP address is required"}))).into_response();
    }
    // Basic validation: must be valid IP or CIDR
    if !is_valid_ip_or_cidr(&ip) {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid IP address or CIDR format"}))).into_response();
    }

    let result = sqlx::query_as::<_, (Uuid, String, chrono::NaiveDateTime)>(
        r#"INSERT INTO user_ip_whitelist (user_id, ip_address)
           VALUES ($1, $2) RETURNING id, ip_address, created_at"#,
    )
    .bind(&user.id)
    .bind(&ip)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok((id, ip_addr, created_at)) => {
            (StatusCode::CREATED, Json(json!({
                "id": id, "ipAddress": ip_addr, "createdAt": created_at.and_utc().to_rfc3339()
            }))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// DELETE /api/settings/ip-whitelist/{id}
async fn delete_ip_whitelist(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let result = sqlx::query(
        "DELETE FROM user_ip_whitelist WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Json(json!({"ok": true})).into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

#[derive(Deserialize)]
struct ToggleBody {
    enabled: bool,
}

/// PATCH /api/settings/ip-whitelist/toggle
async fn toggle_ip_whitelist(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<ToggleBody>,
) -> Response {
    let result = sqlx::query(
        r#"UPDATE "user" SET ip_whitelist_enabled = $1 WHERE id = $2"#,
    )
    .bind(body.enabled)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({"enabled": body.enabled})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// Validate IP address or CIDR notation
fn is_valid_ip_or_cidr(s: &str) -> bool {
    if let Some((ip_part, prefix)) = s.rsplit_once('/') {
        // CIDR: check prefix is a number and IP is valid
        let Ok(bits) = prefix.parse::<u32>() else { return false };
        if ip_part.contains(':') {
            // IPv6 CIDR
            bits <= 128 && ip_part.parse::<std::net::Ipv6Addr>().is_ok()
        } else {
            // IPv4 CIDR
            bits <= 32 && ip_part.parse::<std::net::Ipv4Addr>().is_ok()
        }
    } else {
        // Plain IP
        s.parse::<std::net::IpAddr>().is_ok()
    }
}

/// Check if an IP address is in a user's whitelist. Used by agent auth middleware.
pub async fn check_ip_whitelist(db: &sqlx::PgPool, user_id: &str, client_ip: &str) -> Result<bool, ()> {
    let enabled = sqlx::query_as::<_, (bool,)>(
        r#"SELECT COALESCE(ip_whitelist_enabled, false) FROM "user" WHERE id = $1"#,
    )
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|_| ())?
    .map(|(e,)| e)
    .unwrap_or(false);

    if !enabled {
        return Ok(true); // Whitelist disabled = allow all
    }

    let ips = sqlx::query_as::<_, (String,)>(
        "SELECT ip_address FROM user_ip_whitelist WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_all(db)
    .await
    .map_err(|_| ())?;

    if ips.is_empty() {
        return Ok(true); // No IPs configured = allow all (even if enabled)
    }

    let client: std::net::IpAddr = match client_ip.parse() {
        Ok(ip) => ip,
        Err(_) => return Ok(false),
    };

    for (ip_entry,) in &ips {
        if ip_matches(ip_entry, client) {
            return Ok(true);
        }
    }

    Ok(false)
}

/// Check if a client IP matches an IP entry (plain IP or CIDR)
fn ip_matches(entry: &str, client: std::net::IpAddr) -> bool {
    if let Some((ip_part, prefix_str)) = entry.rsplit_once('/') {
        let Ok(prefix_len) = prefix_str.parse::<u32>() else { return false };
        match (ip_part.parse::<std::net::IpAddr>(), client) {
            (Ok(std::net::IpAddr::V4(net)), std::net::IpAddr::V4(c)) => {
                if prefix_len > 32 { return false; }
                let mask = if prefix_len == 0 { 0u32 } else { !0u32 << (32 - prefix_len) };
                u32::from(net) & mask == u32::from(c) & mask
            }
            (Ok(std::net::IpAddr::V6(net)), std::net::IpAddr::V6(c)) => {
                if prefix_len > 128 { return false; }
                let net_bits = u128::from(net);
                let c_bits = u128::from(c);
                let mask = if prefix_len == 0 { 0u128 } else { !0u128 << (128 - prefix_len) };
                net_bits & mask == c_bits & mask
            }
            _ => false,
        }
    } else {
        // Exact IP match
        entry.parse::<std::net::IpAddr>().map(|e| e == client).unwrap_or(false)
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
