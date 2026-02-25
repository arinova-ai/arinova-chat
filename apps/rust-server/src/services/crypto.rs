use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::Rng;

/// Encrypt plaintext using AES-256-GCM.
/// Returns hex-encoded string: nonce (12 bytes) + ciphertext.
pub fn encrypt(plaintext: &str, key_hex: &str) -> Result<String, String> {
    let key_bytes = hex::decode(key_hex).map_err(|e| format!("Invalid key hex: {e}"))?;
    if key_bytes.len() != 32 {
        return Err("ENCRYPTION_KEY must be 64 hex chars (32 bytes)".into());
    }

    let cipher =
        Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| format!("Cipher init error: {e}"))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| format!("Encryption error: {e}"))?;

    // nonce (12 bytes) + ciphertext
    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(hex::encode(result))
}

/// Decrypt hex-encoded ciphertext (nonce + ciphertext) using AES-256-GCM.
pub fn decrypt(encrypted_hex: &str, key_hex: &str) -> Result<String, String> {
    let key_bytes = hex::decode(key_hex).map_err(|e| format!("Invalid key hex: {e}"))?;
    if key_bytes.len() != 32 {
        return Err("ENCRYPTION_KEY must be 64 hex chars (32 bytes)".into());
    }

    let data = hex::decode(encrypted_hex).map_err(|e| format!("Invalid ciphertext hex: {e}"))?;
    if data.len() < 13 {
        return Err("Ciphertext too short".into());
    }

    let cipher =
        Aes256Gcm::new_from_slice(&key_bytes).map_err(|e| format!("Cipher init error: {e}"))?;

    let nonce = Nonce::from_slice(&data[..12]);
    let ciphertext = &data[12..];

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| format!("Decryption error: {e}"))?;

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 error: {e}"))
}
