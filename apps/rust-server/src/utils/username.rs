/// Validate username format:
/// - 3-32 characters
/// - lowercase a-z, 0-9, underscore only
/// - must start with a letter
/// - no consecutive underscores
pub fn validate_username(username: &str) -> Result<(), &'static str> {
    if username.len() < 3 {
        return Err("Username must be at least 3 characters");
    }
    if username.len() > 32 {
        return Err("Username must be at most 32 characters");
    }
    if !username.starts_with(|c: char| c.is_ascii_lowercase()) {
        return Err("Username must start with a letter");
    }
    if !username.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
        return Err("Username can only contain lowercase letters, numbers, and underscores");
    }
    if username.contains("__") {
        return Err("Username cannot contain consecutive underscores");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_usernames() {
        assert!(validate_username("ripple_42").is_ok());
        assert!(validate_username("abc").is_ok());
        assert!(validate_username("a_b_c").is_ok());
        assert!(validate_username("longusername12345678901234567890").is_ok()); // 32 chars
    }

    #[test]
    fn test_too_short() {
        assert_eq!(validate_username("ab").unwrap_err(), "Username must be at least 3 characters");
    }

    #[test]
    fn test_too_long() {
        let long = "a".repeat(33);
        assert_eq!(validate_username(&long).unwrap_err(), "Username must be at most 32 characters");
    }

    #[test]
    fn test_invalid_chars() {
        assert_eq!(validate_username("ripple-test").unwrap_err(), "Username can only contain lowercase letters, numbers, and underscores");
        assert_eq!(validate_username("rIpple").unwrap_err(), "Username can only contain lowercase letters, numbers, and underscores");
        assert_eq!(validate_username("rip ple").unwrap_err(), "Username can only contain lowercase letters, numbers, and underscores");
    }

    #[test]
    fn test_starts_with_number() {
        assert_eq!(validate_username("42ripple").unwrap_err(), "Username must start with a letter");
    }

    #[test]
    fn test_starts_with_underscore() {
        assert_eq!(validate_username("_ripple").unwrap_err(), "Username must start with a letter");
    }

    #[test]
    fn test_consecutive_underscores() {
        assert_eq!(validate_username("ripple__test").unwrap_err(), "Username cannot contain consecutive underscores");
    }
}
