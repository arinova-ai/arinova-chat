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
            port: 21001,
            database_url: "postgres://localhost/test".into(),
            redis_url: "redis://localhost".into(),
            cors_origin: "http://localhost:21000,https://app.arinova.ai".into(),
            better_auth_secret: "test".into(),
            better_auth_url: "http://localhost:21001".into(),
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
        assert_eq!(origins[0], "http://localhost:21000");
        assert_eq!(origins[1], "https://app.arinova.ai");
    }

    #[test]
    fn test_r2_not_configured() {
        let config = arinova_server::config::Config {
            port: 21001,
            database_url: "postgres://localhost/test".into(),
            redis_url: "redis://localhost".into(),
            cors_origin: "http://localhost:21000".into(),
            better_auth_secret: "test".into(),
            better_auth_url: "http://localhost:21001".into(),
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
            port: 21001,
            database_url: "postgres://localhost/test".into(),
            redis_url: "redis://localhost".into(),
            cors_origin: "http://localhost:21000".into(),
            better_auth_secret: "test".into(),
            better_auth_url: "http://localhost:21001".into(),
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

// ============================================================================
// Task 2.6: Username validation tests
// (Comprehensive tests verifying the inline tests in utils/username.rs)
// ============================================================================
#[cfg(test)]
mod username_validation_tests {
    use arinova_server::utils::username::validate_username;

    #[test]
    fn test_valid_simple_username() {
        assert!(validate_username("alice").is_ok());
    }

    #[test]
    fn test_valid_username_with_numbers() {
        assert!(validate_username("ripple42").is_ok());
    }

    #[test]
    fn test_valid_username_with_underscores() {
        assert!(validate_username("a_b_c").is_ok());
    }

    #[test]
    fn test_valid_minimum_length() {
        // Exactly 3 characters — the minimum
        assert!(validate_username("abc").is_ok());
    }

    #[test]
    fn test_valid_maximum_length() {
        // Exactly 32 characters — the maximum
        let name = "a".repeat(32);
        assert!(validate_username(&name).is_ok());
    }

    #[test]
    fn test_reject_too_short() {
        assert!(validate_username("ab").is_err());
        assert!(validate_username("a").is_err());
        assert!(validate_username("").is_err());
    }

    #[test]
    fn test_reject_too_long() {
        let name = "a".repeat(33);
        assert!(validate_username(&name).is_err());
    }

    #[test]
    fn test_reject_starts_with_number() {
        assert!(validate_username("42ripple").is_err());
        assert!(validate_username("0abc").is_err());
    }

    #[test]
    fn test_reject_starts_with_underscore() {
        assert!(validate_username("_ripple").is_err());
    }

    #[test]
    fn test_reject_uppercase() {
        assert!(validate_username("Ripple").is_err());
        assert!(validate_username("rIpple").is_err());
    }

    #[test]
    fn test_reject_hyphens() {
        assert!(validate_username("rip-ple").is_err());
    }

    #[test]
    fn test_reject_spaces() {
        assert!(validate_username("rip ple").is_err());
    }

    #[test]
    fn test_reject_special_chars() {
        assert!(validate_username("rip@ple").is_err());
        assert!(validate_username("rip.ple").is_err());
        assert!(validate_username("rip!ple").is_err());
    }

    #[test]
    fn test_reject_consecutive_underscores() {
        assert!(validate_username("ripple__test").is_err());
        assert!(validate_username("a___b").is_err());
    }

    #[test]
    fn test_single_trailing_underscore_ok() {
        // Single underscore at end should be fine
        assert!(validate_username("ripple_").is_ok());
    }

    #[test]
    fn test_reject_unicode() {
        assert!(validate_username("rippλe").is_err());
    }
}

// ============================================================================
// Tasks 7.7–7.10: Two-layer agent dispatch filtering tests
// ============================================================================
#[cfg(test)]
mod agent_filter_tests {
    use arinova_server::ws::handler::{filter_agents_for_dispatch, AgentFilterConfig};

    /// Helper to build an AgentFilterConfig quickly.
    fn agent(id: &str, listen_mode: &str, owner: &str, allowed: &[&str]) -> AgentFilterConfig {
        AgentFilterConfig {
            agent_id: id.to_string(),
            listen_mode: listen_mode.to_string(),
            owner_user_id: owner.to_string(),
            allowed_user_ids: allowed.iter().map(|s| s.to_string()).collect(),
        }
    }

    // -----------------------------------------------------------------------
    // 7.7  mention_only=false delivers to ALL agents regardless of listen_mode
    // -----------------------------------------------------------------------

    #[test]
    fn test_7_7_mention_only_false_delivers_to_all_agents() {
        let agents = vec![
            agent("agent-1", "owner_only", "owner-1", &[]),
            agent("agent-2", "allowed_users", "owner-2", &[]),
            agent("agent-3", "all_mentions", "owner-3", &[]),
        ];
        // mention_only=false, no mentions, sender is unrelated
        let result = filter_agents_for_dispatch(false, "group", "random-user", &[], &agents);
        assert_eq!(result, vec!["agent-1", "agent-2", "agent-3"]);
    }

    #[test]
    fn test_7_7_mention_only_false_ignores_listen_mode_in_direct() {
        let agents = vec![agent("agent-1", "owner_only", "owner-1", &[])];
        let result = filter_agents_for_dispatch(false, "direct", "random-user", &[], &agents);
        assert_eq!(result, vec!["agent-1"]);
    }

    #[test]
    fn test_7_7_mention_only_false_delivers_even_without_mentions() {
        let agents = vec![
            agent("agent-1", "owner_only", "owner-1", &[]),
            agent("agent-2", "all_mentions", "owner-2", &[]),
        ];
        // No mentions at all, but mention_only=false means everything is dispatched
        let result = filter_agents_for_dispatch(false, "group", "some-user", &[], &agents);
        assert_eq!(result.len(), 2);
    }

    // -----------------------------------------------------------------------
    // 7.8  mention_only=true + owner_only — only owner's @mention triggers
    // -----------------------------------------------------------------------

    #[test]
    fn test_7_8_owner_only_owner_mentions_triggers() {
        let agents = vec![agent("agent-1", "owner_only", "owner-1", &[])];
        let mentions = vec!["agent-1".to_string()];
        let result =
            filter_agents_for_dispatch(true, "group", "owner-1", &mentions, &agents);
        assert_eq!(result, vec!["agent-1"]);
    }

    #[test]
    fn test_7_8_owner_only_non_owner_mention_rejected() {
        let agents = vec![agent("agent-1", "owner_only", "owner-1", &[])];
        let mentions = vec!["agent-1".to_string()];
        // Sender is not the owner
        let result =
            filter_agents_for_dispatch(true, "group", "other-user", &mentions, &agents);
        assert!(result.is_empty(), "Non-owner should not trigger owner_only agent");
    }

    #[test]
    fn test_7_8_owner_only_not_mentioned_at_all() {
        let agents = vec![agent("agent-1", "owner_only", "owner-1", &[])];
        // Owner sends but does not @mention the agent
        let result = filter_agents_for_dispatch(true, "group", "owner-1", &[], &agents);
        assert!(result.is_empty(), "Agent not mentioned should not be triggered");
    }

    #[test]
    fn test_7_8_owner_only_all_mention_from_owner() {
        let agents = vec![agent("agent-1", "owner_only", "owner-1", &[])];
        let mentions = vec!["__all__".to_string()];
        let result =
            filter_agents_for_dispatch(true, "group", "owner-1", &mentions, &agents);
        assert_eq!(result, vec!["agent-1"], "__all__ from owner should trigger owner_only");
    }

    #[test]
    fn test_7_8_owner_only_all_mention_from_non_owner() {
        let agents = vec![agent("agent-1", "owner_only", "owner-1", &[])];
        let mentions = vec!["__all__".to_string()];
        let result =
            filter_agents_for_dispatch(true, "group", "other-user", &mentions, &agents);
        assert!(result.is_empty(), "__all__ from non-owner should not trigger owner_only");
    }

    // -----------------------------------------------------------------------
    // 7.9  mention_only=true + allowed_users — whitelisted user triggers
    // -----------------------------------------------------------------------

    #[test]
    fn test_7_9_allowed_users_whitelisted_user_triggers() {
        let agents = vec![agent("agent-1", "allowed_users", "owner-1", &["alice"])];
        let mentions = vec!["agent-1".to_string()];
        let result =
            filter_agents_for_dispatch(true, "group", "alice", &mentions, &agents);
        assert_eq!(result, vec!["agent-1"], "Whitelisted user should trigger agent");
    }

    #[test]
    fn test_7_9_allowed_users_unlisted_user_rejected() {
        let agents = vec![agent("agent-1", "allowed_users", "owner-1", &["alice"])];
        let mentions = vec!["agent-1".to_string()];
        let result =
            filter_agents_for_dispatch(true, "group", "bob", &mentions, &agents);
        assert!(result.is_empty(), "Non-whitelisted user should not trigger agent");
    }

    #[test]
    fn test_7_9_allowed_users_owner_always_triggers() {
        let agents = vec![agent("agent-1", "allowed_users", "owner-1", &[])];
        let mentions = vec!["agent-1".to_string()];
        // Owner triggers even if not in allowed_user_ids
        let result =
            filter_agents_for_dispatch(true, "group", "owner-1", &mentions, &agents);
        assert_eq!(result, vec!["agent-1"], "Owner should always trigger allowed_users agent");
    }

    #[test]
    fn test_7_9_allowed_users_multiple_allowed() {
        let agents = vec![agent("agent-1", "allowed_users", "owner-1", &["alice", "bob", "charlie"])];
        let mentions = vec!["agent-1".to_string()];

        let result =
            filter_agents_for_dispatch(true, "group", "bob", &mentions, &agents);
        assert_eq!(result, vec!["agent-1"]);

        let result =
            filter_agents_for_dispatch(true, "group", "charlie", &mentions, &agents);
        assert_eq!(result, vec!["agent-1"]);

        let result =
            filter_agents_for_dispatch(true, "group", "dave", &mentions, &agents);
        assert!(result.is_empty());
    }

    // -----------------------------------------------------------------------
    // 7.10 mention_only=true + all_mentions — any @mention triggers
    // -----------------------------------------------------------------------

    #[test]
    fn test_7_10_all_mentions_any_user_triggers() {
        let agents = vec![agent("agent-1", "all_mentions", "owner-1", &[])];
        let mentions = vec!["agent-1".to_string()];
        let result =
            filter_agents_for_dispatch(true, "group", "random-stranger", &mentions, &agents);
        assert_eq!(result, vec!["agent-1"], "Any user mentioning should trigger all_mentions agent");
    }

    #[test]
    fn test_7_10_all_mentions_not_mentioned_not_triggered() {
        let agents = vec![agent("agent-1", "all_mentions", "owner-1", &[])];
        // Agent not mentioned at all
        let result =
            filter_agents_for_dispatch(true, "group", "random-user", &[], &agents);
        assert!(result.is_empty(), "Un-mentioned agent should not trigger");
    }

    #[test]
    fn test_7_10_all_mentions_via_all_keyword() {
        let agents = vec![agent("agent-1", "all_mentions", "owner-1", &[])];
        let mentions = vec!["__all__".to_string()];
        let result =
            filter_agents_for_dispatch(true, "group", "someone", &mentions, &agents);
        assert_eq!(result, vec!["agent-1"], "__all__ should trigger all_mentions agent");
    }

    // -----------------------------------------------------------------------
    // Mixed scenarios
    // -----------------------------------------------------------------------

    #[test]
    fn test_mixed_agents_selective_dispatch() {
        // Group has 3 agents with different listen_modes
        let agents = vec![
            agent("bot-a", "owner_only", "user-1", &[]),
            agent("bot-b", "allowed_users", "user-2", &["user-3"]),
            agent("bot-c", "all_mentions", "user-2", &[]),
        ];
        // user-3 mentions all agents
        let mentions = vec![
            "bot-a".to_string(),
            "bot-b".to_string(),
            "bot-c".to_string(),
        ];
        let result =
            filter_agents_for_dispatch(true, "group", "user-3", &mentions, &agents);
        // bot-a: owner_only, sender is user-3 (not owner) -> rejected
        // bot-b: allowed_users, user-3 is in whitelist -> accepted
        // bot-c: all_mentions -> accepted
        assert_eq!(result, vec!["bot-b", "bot-c"]);
    }

    #[test]
    fn test_mixed_agents_owner_triggers_all_own_bots() {
        let agents = vec![
            agent("bot-a", "owner_only", "user-1", &[]),
            agent("bot-b", "allowed_users", "user-1", &[]),
            agent("bot-c", "all_mentions", "user-1", &[]),
        ];
        let mentions = vec!["__all__".to_string()];
        let result =
            filter_agents_for_dispatch(true, "group", "user-1", &mentions, &agents);
        // All are owned by user-1 and all are mentioned via __all__
        assert_eq!(result, vec!["bot-a", "bot-b", "bot-c"]);
    }

    #[test]
    fn test_direct_conversation_always_dispatches() {
        let agents = vec![agent("agent-1", "owner_only", "owner-1", &[])];
        // Even with mention_only=true, direct conversations always dispatch
        let result = filter_agents_for_dispatch(true, "direct", "random-user", &[], &agents);
        assert_eq!(result, vec!["agent-1"]);
    }

    #[test]
    fn test_empty_agents_returns_empty() {
        let result = filter_agents_for_dispatch(false, "group", "user-1", &[], &[]);
        assert!(result.is_empty());
    }

    #[test]
    fn test_unknown_listen_mode_rejects() {
        let agents = vec![agent("agent-1", "invalid_mode", "owner-1", &[])];
        let mentions = vec!["agent-1".to_string()];
        let result =
            filter_agents_for_dispatch(true, "group", "owner-1", &mentions, &agents);
        assert!(result.is_empty(), "Unknown listen_mode should reject dispatch");
    }
}
