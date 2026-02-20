/// Unit tests for the Arinova Rust server.
/// These tests don't require database or Redis connections.

#[cfg(test)]
mod auth_tests {
    use arinova_server::auth::password::{hash_password, verify_password};

    #[test]
    fn test_password_hash_and_verify() {
        let password = "test_password_123!";
        let hash = hash_password(password).expect("Failed to hash password");

        // Hash should start with argon2 prefix
        assert!(hash.starts_with("$argon2"), "Hash should use argon2 format");

        // Verify correct password
        assert!(
            verify_password(password, &hash),
            "Correct password should verify"
        );

        // Verify wrong password
        assert!(
            !verify_password("wrong_password", &hash),
            "Wrong password should not verify"
        );
    }

    #[test]
    fn test_different_passwords_produce_different_hashes() {
        let hash1 = hash_password("password1").unwrap();
        let hash2 = hash_password("password2").unwrap();
        assert_ne!(hash1, hash2, "Different passwords should produce different hashes");
    }
}

#[cfg(test)]
mod pairing_code_tests {
    use arinova_server::utils::pairing_code::generate_secret_token;

    #[test]
    fn test_secret_token_format() {
        let token = generate_secret_token();
        assert!(
            token.starts_with("ari_"),
            "Token should start with 'ari_' prefix"
        );
        assert_eq!(token.len(), 52, "Token should be 52 characters (4 prefix + 48 hex)");

        // Verify hex part
        let hex_part = &token[4..];
        assert!(
            hex_part.chars().all(|c| c.is_ascii_hexdigit()),
            "Token suffix should be valid hex"
        );
    }

    #[test]
    fn test_tokens_are_unique() {
        let token1 = generate_secret_token();
        let token2 = generate_secret_token();
        assert_ne!(token1, token2, "Tokens should be unique");
    }
}

#[cfg(test)]
mod config_tests {
    #[test]
    fn test_cors_origins_parsing() {
        // Test with multiple origins
        let config = arinova_server::config::Config {
            port: 3501,
            database_url: "postgres://localhost/test".into(),
            redis_url: "redis://localhost".into(),
            cors_origin: "http://localhost:3500,https://app.arinova.ai".into(),
            better_auth_secret: "test".into(),
            better_auth_url: "http://localhost:3501".into(),
            google_client_id: String::new(),
            google_client_secret: String::new(),
            github_client_id: String::new(),
            github_client_secret: String::new(),
            upload_dir: "./uploads".into(),
            max_file_size: 10485760,
            r2_endpoint: String::new(),
            r2_access_key_id: String::new(),
            r2_secret_access_key: String::new(),
            r2_bucket: "test".into(),
            r2_public_url: String::new(),
            admin_emails: vec![],
            vapid_public_key: String::new(),
            vapid_private_key: String::new(),
            vapid_subject: "mailto:test@test.com".into(),
            sentry_dsn: String::new(),
        };

        let origins = config.cors_origins();
        assert_eq!(origins.len(), 2);
        assert_eq!(origins[0], "http://localhost:3500");
        assert_eq!(origins[1], "https://app.arinova.ai");
    }

    #[test]
    fn test_r2_not_configured() {
        let config = arinova_server::config::Config {
            port: 3501,
            database_url: "postgres://localhost/test".into(),
            redis_url: "redis://localhost".into(),
            cors_origin: "http://localhost:3500".into(),
            better_auth_secret: "test".into(),
            better_auth_url: "http://localhost:3501".into(),
            google_client_id: String::new(),
            google_client_secret: String::new(),
            github_client_id: String::new(),
            github_client_secret: String::new(),
            upload_dir: "./uploads".into(),
            max_file_size: 10485760,
            r2_endpoint: String::new(),
            r2_access_key_id: String::new(),
            r2_secret_access_key: String::new(),
            r2_bucket: "test".into(),
            r2_public_url: String::new(),
            admin_emails: vec![],
            vapid_public_key: String::new(),
            vapid_private_key: String::new(),
            vapid_subject: "mailto:test@test.com".into(),
            sentry_dsn: String::new(),
        };

        assert!(!config.is_r2_configured());
        assert!(!config.is_push_enabled());
    }

    #[test]
    fn test_r2_configured() {
        let config = arinova_server::config::Config {
            port: 3501,
            database_url: "postgres://localhost/test".into(),
            redis_url: "redis://localhost".into(),
            cors_origin: "http://localhost:3500".into(),
            better_auth_secret: "test".into(),
            better_auth_url: "http://localhost:3501".into(),
            google_client_id: String::new(),
            google_client_secret: String::new(),
            github_client_id: String::new(),
            github_client_secret: String::new(),
            upload_dir: "./uploads".into(),
            max_file_size: 10485760,
            r2_endpoint: "https://example.r2.cloudflarestorage.com".into(),
            r2_access_key_id: "key123".into(),
            r2_secret_access_key: "secret123".into(),
            r2_bucket: "test".into(),
            r2_public_url: "https://cdn.example.com".into(),
            admin_emails: vec![],
            vapid_public_key: String::new(),
            vapid_private_key: String::new(),
            vapid_subject: "mailto:test@test.com".into(),
            sentry_dsn: String::new(),
        };

        assert!(config.is_r2_configured());
    }
}

#[cfg(test)]
mod ws_state_tests {
    use arinova_server::ws::state::WsState;

    #[test]
    fn test_ws_state_initialization() {
        let ws = WsState::new();
        assert!(!ws.is_user_online("test-user"));
        assert!(!ws.is_user_foreground("test-user"));
        assert!(!ws.is_agent_connected("test-agent"));
        assert!(!ws.has_active_stream("test-conv"));
    }

    #[test]
    fn test_agent_skills_empty() {
        let ws = WsState::new();
        let skills = ws.get_agent_skills("nonexistent");
        assert!(skills.is_empty());
    }
}

#[cfg(test)]
mod sanitize_tests {
    // Test the sanitize_content function
    // We need to make it pub for testing, but for now test the regex patterns

    #[test]
    fn test_script_tag_removal() {
        let re = regex_lite::Regex::new(r"(?i)<script\b[^>]*>.*?</script>").unwrap();
        let result = re.replace_all("<script>alert('xss')</script>hello", "");
        assert_eq!(result, "hello");
    }

    #[test]
    fn test_iframe_removal() {
        let re = regex_lite::Regex::new(r"(?i)<iframe\b[^>]*>[\s\S]*?</iframe>").unwrap();
        let result = re.replace_all("<iframe src='evil.com'></iframe>hello", "");
        assert_eq!(result, "hello");
    }
}
