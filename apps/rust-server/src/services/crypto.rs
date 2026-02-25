use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::Rng;

/// AES-256-GCM auth tag length in bytes.
const TAG_LEN: usize = 16;

/// Encrypt plaintext using AES-256-GCM.
/// Returns TS-compatible format: `hex(iv):hex(authTag):hex(ciphertext)`.
pub fn encrypt(plaintext: &str, key_hex: &str) -> Result<String, String> {
    let key_bytes = hex::decode(key_hex).map_err(|e| format!("Invalid key hex: {e}"))?;
    if key_bytes.len() != 32 {
        return Err("ENCRYPTION_KEY must be 64 hex chars (32 bytes)".into());
    }

    let cipher =
        Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| format!("Cipher init error: {e}"))?;

    let mut iv_bytes = [0u8; 12];
    rand::thread_rng().fill(&mut iv_bytes);
    let nonce = Nonce::from_slice(&iv_bytes);

    // aes-gcm returns ciphertext || authTag (16 bytes appended)
    let encrypted = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption error: {e}"))?;

    let ct_len = encrypted.len() - TAG_LEN;
    let ciphertext = &encrypted[..ct_len];
    let auth_tag = &encrypted[ct_len..];

    Ok(format!(
        "{}:{}:{}",
        hex::encode(iv_bytes),
        hex::encode(auth_tag),
        hex::encode(ciphertext),
    ))
}

/// Decrypt TS-compatible `hex(iv):hex(authTag):hex(ciphertext)` using AES-256-GCM.
pub fn decrypt(encrypted: &str, key_hex: &str) -> Result<String, String> {
    let key_bytes = hex::decode(key_hex).map_err(|e| format!("Invalid key hex: {e}"))?;
    if key_bytes.len() != 32 {
        return Err("ENCRYPTION_KEY must be 64 hex chars (32 bytes)".into());
    }

    let parts: Vec<&str> = encrypted.split(':').collect();
    if parts.len() != 3 {
        return Err("Invalid format: expected iv:authTag:ciphertext".into());
    }

    let iv = hex::decode(parts[0]).map_err(|e| format!("Invalid IV hex: {e}"))?;
    let auth_tag = hex::decode(parts[1]).map_err(|e| format!("Invalid authTag hex: {e}"))?;
    let ciphertext = hex::decode(parts[2]).map_err(|e| format!("Invalid ciphertext hex: {e}"))?;

    if iv.len() != 12 {
        return Err("IV must be 12 bytes".into());
    }
    if auth_tag.len() != TAG_LEN {
        return Err("Auth tag must be 16 bytes".into());
    }

    let cipher =
        Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| format!("Cipher init error: {e}"))?;

    let nonce = Nonce::from_slice(&iv);

    // aes-gcm expects ciphertext || authTag
    let mut payload = Vec::with_capacity(ciphertext.len() + TAG_LEN);
    payload.extend_from_slice(&ciphertext);
    payload.extend_from_slice(&auth_tag);

    let plaintext = cipher
        .decrypt(nonce, payload.as_slice())
        .map_err(|e| format!("Decryption error: {e}"))?;

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 error: {e}"))
}
