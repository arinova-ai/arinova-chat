use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use scrypt::scrypt;

/// Better Auth scrypt parameters: N=16384, r=16, p=1, dkLen=64
const SCRYPT_LOG_N: u8 = 14; // 2^14 = 16384
const SCRYPT_R: u32 = 16;
const SCRYPT_P: u32 = 1;
const SCRYPT_DK_LEN: usize = 64;

/// Hash a password using argon2id (for new users created by the Rust server).
pub fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2.hash_password(password.as_bytes(), &salt)?;
    Ok(hash.to_string())
}

/// Verify a password against a hash.
/// Supports both:
/// - Better Auth scrypt format: `hex_salt:hex_key` (32:128 hex chars)
/// - Argon2id format: `$argon2id$...`
pub fn verify_password(password: &str, hash: &str) -> bool {
    if hash.starts_with("$argon2") {
        // Argon2 format
        let parsed_hash = match PasswordHash::new(hash) {
            Ok(h) => h,
            Err(_) => return false,
        };
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok()
    } else if hash.contains(':') {
        // Better Auth scrypt format: salt:key (both hex-encoded)
        verify_scrypt_password(password, hash)
    } else {
        false
    }
}

/// Verify a password against Better Auth's scrypt format.
/// Format: `hex_salt:hex_key`
/// Parameters: N=16384, r=16, p=1, dkLen=64
///
/// IMPORTANT: Better Auth passes the hex salt STRING (not decoded bytes) to scrypt.
/// i.e., scrypt(password_utf8, salt_hex_string_utf8, params) -> key
fn verify_scrypt_password(password: &str, hash: &str) -> bool {
    let parts: Vec<&str> = hash.split(':').collect();
    if parts.len() != 2 {
        return false;
    }

    let salt_hex = parts[0];
    let expected_key_hex = parts[1];

    let expected_key = match hex::decode(expected_key_hex) {
        Ok(k) => k,
        Err(_) => return false,
    };

    // Better Auth passes the hex salt string directly to scrypt (NOT decoded bytes).
    // The JS scryptAsync converts the string to UTF-8 bytes internally.
    // Password is NFKC-normalized (no-op for ASCII).
    let params = match scrypt::Params::new(SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P, SCRYPT_DK_LEN) {
        Ok(p) => p,
        Err(_) => return false,
    };

    let mut derived_key = vec![0u8; SCRYPT_DK_LEN];
    if scrypt(password.as_bytes(), salt_hex.as_bytes(), &params, &mut derived_key).is_err() {
        return false;
    }

    // Constant-time comparison
    derived_key == expected_key
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify() {
        let password = "test-password-123";
        let hash = hash_password(password).unwrap();
        assert!(verify_password(password, &hash));
        assert!(!verify_password("wrong-password", &hash));
    }

    #[test]
    fn test_verify_better_auth_scrypt() {
        // Better Auth passes the hex salt STRING (not decoded bytes) to scrypt.
        let password = "testpassword";
        let salt_hex = "24ddd1c68abdb50a1db5df4eff777f0f";

        let params = scrypt::Params::new(SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P, SCRYPT_DK_LEN).unwrap();
        let mut key = vec![0u8; SCRYPT_DK_LEN];
        scrypt(password.as_bytes(), salt_hex.as_bytes(), &params, &mut key).unwrap();

        let hash = format!("{}:{}", salt_hex, hex::encode(&key));
        assert!(verify_password(password, &hash));
        assert!(!verify_password("wrong", &hash));
    }
}
