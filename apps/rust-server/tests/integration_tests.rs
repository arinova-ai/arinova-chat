/// Integration tests for the Arinova Rust server.
///
/// These tests require a running server at localhost:3001, so they are
/// all marked with `#[ignore]`.  Run them explicitly with:
///
///   cargo test --test integration_tests -- --ignored
///

use reqwest::Client;
use serde_json::{json, Value};

const BASE: &str = "http://localhost:3001";

async fn create_test_user(client: &Client, email: &str, password: &str, name: &str) -> Value {
    client
        .post(&format!("{BASE}/api/auth/sign-up/email"))
        .json(&json!({"email": email, "password": password, "name": name}))
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap()
}

async fn login(client: &Client, email: &str, password: &str) -> (String, Value) {
    let res = client
        .post(&format!("{BASE}/api/auth/sign-in/email"))
        .json(&json!({"email": email, "password": password}))
        .send()
        .await
        .unwrap();
    let cookies = res
        .headers()
        .get_all("set-cookie")
        .iter()
        .map(|v| v.to_str().unwrap().to_string())
        .collect::<Vec<_>>()
        .join("; ");
    let body = res.json::<Value>().await.unwrap();
    (cookies, body)
}

async fn authed_get(client: &Client, cookie: &str, path: &str) -> Value {
    client
        .get(&format!("{BASE}{path}"))
        .header("Cookie", cookie)
        .send()
        .await
        .unwrap()
        .json::<Value>()
        .await
        .unwrap()
}

async fn authed_post(
    client: &Client,
    cookie: &str,
    path: &str,
    body: Value,
) -> reqwest::Response {
    client
        .post(&format!("{BASE}{path}"))
        .header("Cookie", cookie)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .unwrap()
}

async fn authed_patch(
    client: &Client,
    cookie: &str,
    path: &str,
    body: Value,
) -> reqwest::Response {
    client
        .patch(&format!("{BASE}{path}"))
        .header("Cookie", cookie)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .unwrap()
}

async fn authed_delete(client: &Client, cookie: &str, path: &str) -> reqwest::Response {
    client
        .delete(&format!("{BASE}{path}"))
        .header("Cookie", cookie)
        .send()
        .await
        .unwrap()
}

// ============================================================================
// Auth tests
// ============================================================================
#[cfg(test)]
mod auth_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn sign_up_creates_user() {
        let client = Client::new();
        let email = "test_sign_up_creates_user@test.local";
        let res = create_test_user(&client, email, "Password123!", "Test User").await;

        assert!(res.get("user").is_some() || res.get("id").is_some(),
            "sign-up response should contain a user object: {res}");

        let user = if res.get("user").is_some() {
            res["user"].clone()
        } else {
            res.clone()
        };

        assert!(user.get("id").is_some(), "user should have an id");
        assert!(user.get("name").is_some(), "user should have a name");
        assert!(user.get("email").is_some(), "user should have an email");
    }

    #[tokio::test]
    #[ignore]
    async fn sign_in_returns_session() {
        let client = Client::new();
        let email = "test_sign_in_returns_session@test.local";
        create_test_user(&client, email, "Password123!", "Sign In User").await;

        let res = client
            .post(&format!("{BASE}/api/auth/sign-in/email"))
            .json(&json!({"email": email, "password": "Password123!"}))
            .send()
            .await
            .unwrap();

        assert_eq!(res.status().as_u16(), 200, "sign-in should return 200");

        let has_cookie = res.headers().get_all("set-cookie").iter().count() > 0;
        assert!(has_cookie, "sign-in response should include set-cookie header");
    }

    #[tokio::test]
    #[ignore]
    async fn protected_route_requires_auth() {
        let client = Client::new();
        let res = client
            .get(&format!("{BASE}/api/conversations"))
            .send()
            .await
            .unwrap();

        assert_eq!(
            res.status().as_u16(),
            401,
            "accessing protected route without auth should return 401"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn session_validates_correctly() {
        let client = Client::new();
        let email = "test_session_validates@test.local";
        create_test_user(&client, email, "Password123!", "Session User").await;
        let (cookie, _) = login(&client, email, "Password123!").await;

        let res = client
            .get(&format!("{BASE}/api/conversations"))
            .header("Cookie", &cookie)
            .send()
            .await
            .unwrap();

        assert_eq!(
            res.status().as_u16(),
            200,
            "authenticated request should return 200"
        );
    }
}

// ============================================================================
// Conversation tests
// ============================================================================
#[cfg(test)]
mod conversation_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn create_conversation_returns_id() {
        let client = Client::new();
        let email = "test_create_conv@test.local";
        create_test_user(&client, email, "Password123!", "Conv Creator").await;
        let (cookie, _) = login(&client, email, "Password123!").await;

        let res = authed_post(
            &client,
            &cookie,
            "/api/conversations",
            json!({"title": "Test Conversation"}),
        )
        .await;

        assert!(
            res.status().as_u16() == 201 || res.status().as_u16() == 200,
            "create conversation should return 201 or 200, got {}",
            res.status().as_u16()
        );

        let body: Value = res.json().await.unwrap();
        assert!(
            body.get("id").is_some() || body.get("conversationId").is_some(),
            "response should contain an id: {body}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn list_conversations_returns_array() {
        let client = Client::new();
        let email = "test_list_convs@test.local";
        create_test_user(&client, email, "Password123!", "Conv Lister").await;
        let (cookie, _) = login(&client, email, "Password123!").await;

        let body = authed_get(&client, &cookie, "/api/conversations").await;

        // The response should contain a conversations array (at top level or nested)
        let has_array = body.is_array()
            || body.get("conversations").map_or(false, |v| v.is_array());
        assert!(has_array, "list conversations should return an array: {body}");
    }

    #[tokio::test]
    #[ignore]
    async fn get_single_conversation() {
        let client = Client::new();
        let email = "test_get_single_conv@test.local";
        create_test_user(&client, email, "Password123!", "Conv Getter").await;
        let (cookie, _) = login(&client, email, "Password123!").await;

        // Create a conversation first
        let create_res = authed_post(
            &client,
            &cookie,
            "/api/conversations",
            json!({"title": "Single Conv Test"}),
        )
        .await;
        let created: Value = create_res.json().await.unwrap();
        let conv_id = created
            .get("id")
            .or_else(|| created.get("conversationId"))
            .expect("created conversation should have an id")
            .as_str()
            .expect("id should be a string");

        let body = authed_get(&client, &cookie, &format!("/api/conversations/{conv_id}")).await;

        assert!(
            body.get("id").is_some() || body.get("conversation").is_some(),
            "get single conversation should return a conversation object: {body}"
        );
    }
}

// ============================================================================
// Message tests
// ============================================================================
#[cfg(test)]
mod message_tests {
    use super::*;

    async fn setup_conversation(client: &Client, email: &str) -> (String, String) {
        create_test_user(client, email, "Password123!", "Msg Tester").await;
        let (cookie, _) = login(client, email, "Password123!").await;

        let res = authed_post(
            client,
            &cookie,
            "/api/conversations",
            json!({"title": "Message Test Conv"}),
        )
        .await;
        let body: Value = res.json().await.unwrap();
        let conv_id = body
            .get("id")
            .or_else(|| body.get("conversationId"))
            .expect("conversation should have an id")
            .as_str()
            .expect("id should be a string")
            .to_string();

        (cookie, conv_id)
    }

    #[tokio::test]
    #[ignore]
    async fn send_message_via_api() {
        let client = Client::new();
        let email = "test_send_msg@test.local";
        let (cookie, conv_id) = setup_conversation(&client, email).await;

        let res = authed_post(
            &client,
            &cookie,
            &format!("/api/conversations/{conv_id}/messages"),
            json!({"content": "Hello from integration test"}),
        )
        .await;

        let status = res.status().as_u16();
        assert!(
            status == 200 || status == 201,
            "send message should return 200 or 201, got {status}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn list_messages_returns_array() {
        let client = Client::new();
        let email = "test_list_msgs@test.local";
        let (cookie, conv_id) = setup_conversation(&client, email).await;

        // Send a message first so there's something to list
        authed_post(
            &client,
            &cookie,
            &format!("/api/conversations/{conv_id}/messages"),
            json!({"content": "Message for listing"}),
        )
        .await;

        let body = authed_get(
            &client,
            &cookie,
            &format!("/api/conversations/{conv_id}/messages"),
        )
        .await;

        let has_array = body.is_array()
            || body.get("messages").map_or(false, |v| v.is_array());
        assert!(has_array, "list messages should return an array: {body}");
    }

    #[tokio::test]
    #[ignore]
    async fn delete_message() {
        let client = Client::new();
        let email = "test_delete_msg@test.local";
        let (cookie, conv_id) = setup_conversation(&client, email).await;

        // Create a message
        let create_res = authed_post(
            &client,
            &cookie,
            &format!("/api/conversations/{conv_id}/messages"),
            json!({"content": "Message to delete"}),
        )
        .await;
        let msg_body: Value = create_res.json().await.unwrap();
        let msg_id = msg_body
            .get("id")
            .or_else(|| msg_body.get("messageId"))
            .expect("message should have an id")
            .as_str()
            .expect("id should be a string");

        let del_res = authed_delete(
            &client,
            &cookie,
            &format!("/api/conversations/{conv_id}/messages/{msg_id}"),
        )
        .await;

        let status = del_res.status().as_u16();
        assert!(
            status == 204 || status == 200,
            "delete message should return 204 or 200, got {status}"
        );
    }
}

// ============================================================================
// Community tests
// ============================================================================
#[cfg(test)]
mod community_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn create_community() {
        let client = Client::new();
        let email = "test_create_community@test.local";
        create_test_user(&client, email, "Password123!", "Community Creator").await;
        let (cookie, _) = login(&client, email, "Password123!").await;

        let res = authed_post(
            &client,
            &cookie,
            "/api/communities",
            json!({"name": "Test Community", "description": "Integration test community"}),
        )
        .await;

        let status = res.status().as_u16();
        assert!(
            status == 201 || status == 200,
            "create community should return 201, got {status}"
        );

        let body: Value = res.json().await.unwrap();
        assert!(
            body.get("id").is_some() || body.get("communityId").is_some(),
            "response should contain a community id: {body}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn list_communities() {
        let client = Client::new();
        let email = "test_list_communities@test.local";
        create_test_user(&client, email, "Password123!", "Community Lister").await;
        let (cookie, _) = login(&client, email, "Password123!").await;

        let body = authed_get(&client, &cookie, "/api/communities").await;

        let has_array = body.is_array()
            || body.get("communities").map_or(false, |v| v.is_array());
        assert!(has_array, "list communities should return an array: {body}");
    }

    #[tokio::test]
    #[ignore]
    async fn join_community() {
        let client = Client::new();

        // User A creates the community
        let email_a = "test_join_community_a@test.local";
        create_test_user(&client, email_a, "Password123!", "Owner A").await;
        let (cookie_a, _) = login(&client, email_a, "Password123!").await;

        let create_res = authed_post(
            &client,
            &cookie_a,
            "/api/communities",
            json!({"name": "Joinable Community", "description": "Join test"}),
        )
        .await;
        let created: Value = create_res.json().await.unwrap();
        let community_id = created
            .get("id")
            .or_else(|| created.get("communityId"))
            .expect("community should have an id")
            .as_str()
            .expect("id should be a string");

        // User B joins the community
        let email_b = "test_join_community_b@test.local";
        create_test_user(&client, email_b, "Password123!", "Joiner B").await;
        let (cookie_b, _) = login(&client, email_b, "Password123!").await;

        let join_res = authed_post(
            &client,
            &cookie_b,
            &format!("/api/communities/{community_id}/join"),
            json!({}),
        )
        .await;

        let status = join_res.status().as_u16();
        assert!(
            status == 200 || status == 201,
            "join community should return 200, got {status}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn community_hidden_users() {
        let client = Client::new();

        // Create community owner
        let email_owner = "test_hidden_users_owner@test.local";
        create_test_user(&client, email_owner, "Password123!", "Hidden Owner").await;
        let (cookie_owner, _) = login(&client, email_owner, "Password123!").await;

        let create_res = authed_post(
            &client,
            &cookie_owner,
            "/api/communities",
            json!({"name": "Hidden Users Community", "description": "Hide test"}),
        )
        .await;
        let created: Value = create_res.json().await.unwrap();
        let community_id = created
            .get("id")
            .or_else(|| created.get("communityId"))
            .expect("community should have an id")
            .as_str()
            .expect("id should be a string");

        // Create a second user to hide
        let email_target = "test_hidden_users_target@test.local";
        create_test_user(&client, email_target, "Password123!", "Hidden Target").await;
        let (_, target_body) = login(&client, email_target, "Password123!").await;
        let target_user = if target_body.get("user").is_some() {
            target_body["user"].clone()
        } else {
            target_body.clone()
        };
        let target_id = target_user["id"].as_str().expect("target should have id");

        // Hide the user
        let hide_res = authed_post(
            &client,
            &cookie_owner,
            &format!("/api/communities/{community_id}/hidden-users"),
            json!({"userId": target_id}),
        )
        .await;
        assert!(
            hide_res.status().is_success(),
            "hide user should succeed, got {}",
            hide_res.status().as_u16()
        );

        // Get hidden users list
        let hidden = authed_get(
            &client,
            &cookie_owner,
            &format!("/api/communities/{community_id}/hidden-users"),
        )
        .await;
        let hidden_arr = if hidden.is_array() {
            hidden.as_array().unwrap().clone()
        } else {
            hidden
                .get("hiddenUsers")
                .or_else(|| hidden.get("users"))
                .expect("should have hidden users list")
                .as_array()
                .unwrap()
                .clone()
        };
        assert!(
            !hidden_arr.is_empty(),
            "hidden users list should not be empty after hiding a user"
        );

        // Unhide the user
        let unhide_res = authed_delete(
            &client,
            &cookie_owner,
            &format!("/api/communities/{community_id}/hidden-users/{target_id}"),
        )
        .await;
        let status = unhide_res.status().as_u16();
        assert!(
            status == 200 || status == 204,
            "unhide user should return 200 or 204, got {status}"
        );
    }
}

// ============================================================================
// Expert Hub tests
// ============================================================================
#[cfg(test)]
mod expert_hub_tests {
    use super::*;

    async fn setup_expert(client: &Client, email: &str) -> (String, String) {
        create_test_user(client, email, "Password123!", "Expert Creator").await;
        let (cookie, _) = login(client, email, "Password123!").await;

        let res = authed_post(
            client,
            &cookie,
            "/api/expert-hub",
            json!({
                "name": "Test Expert",
                "description": "An expert for integration testing",
                "systemPrompt": "You are a helpful test assistant."
            }),
        )
        .await;

        let body: Value = res.json().await.unwrap();
        let expert_id = body
            .get("id")
            .or_else(|| body.get("spaceId"))
            .expect("expert should have an id")
            .as_str()
            .expect("id should be a string")
            .to_string();

        (cookie, expert_id)
    }

    #[tokio::test]
    #[ignore]
    async fn create_expert() {
        let client = Client::new();
        let email = "test_create_expert@test.local";
        create_test_user(&client, email, "Password123!", "Expert Creator").await;
        let (cookie, _) = login(&client, email, "Password123!").await;

        let res = authed_post(
            &client,
            &cookie,
            "/api/expert-hub",
            json!({
                "name": "Create Expert Test",
                "description": "Testing expert creation",
                "systemPrompt": "You are a test assistant."
            }),
        )
        .await;

        let status = res.status().as_u16();
        assert!(
            status == 201 || status == 200,
            "create expert should return 201, got {status}"
        );

        let body: Value = res.json().await.unwrap();
        assert!(
            body.get("id").is_some() || body.get("spaceId").is_some(),
            "response should contain an expert id: {body}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn list_experts() {
        let client = Client::new();
        let email = "test_list_experts@test.local";
        create_test_user(&client, email, "Password123!", "Expert Lister").await;
        let (cookie, _) = login(&client, email, "Password123!").await;

        let body = authed_get(&client, &cookie, "/api/expert-hub").await;

        let has_array = body.is_array()
            || body.get("spaces").map_or(false, |v| v.is_array())
            || body.get("experts").map_or(false, |v| v.is_array());
        assert!(has_array, "list experts should return an array: {body}");
    }

    #[tokio::test]
    #[ignore]
    async fn add_knowledge() {
        let client = Client::new();
        let email = "test_add_knowledge@test.local";
        let (cookie, expert_id) = setup_expert(&client, email).await;

        let res = authed_post(
            &client,
            &cookie,
            &format!("/api/expert-hub/{expert_id}/knowledge"),
            json!({
                "content": "This is test knowledge content for the expert.",
                "title": "Test Knowledge"
            }),
        )
        .await;

        let status = res.status().as_u16();
        assert!(
            status == 200 || status == 201,
            "add knowledge should return 200, got {status}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn publish_requires_knowledge() {
        let client = Client::new();
        let email = "test_publish_no_knowledge@test.local";
        // Create expert without adding any knowledge
        let (cookie, expert_id) = setup_expert(&client, email).await;

        let res = authed_patch(
            &client,
            &cookie,
            &format!("/api/expert-hub/{expert_id}"),
            json!({"isPublished": true}),
        )
        .await;

        assert_eq!(
            res.status().as_u16(),
            400,
            "publishing without knowledge should return 400"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn add_example() {
        let client = Client::new();
        let email = "test_add_example@test.local";
        let (cookie, expert_id) = setup_expert(&client, email).await;

        let res = authed_post(
            &client,
            &cookie,
            &format!("/api/expert-hub/{expert_id}/examples"),
            json!({
                "question": "What is Rust?",
                "answer": "Rust is a systems programming language."
            }),
        )
        .await;

        let status = res.status().as_u16();
        assert!(
            status == 201 || status == 200,
            "add example should return 201, got {status}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn list_examples() {
        let client = Client::new();
        let email = "test_list_examples@test.local";
        let (cookie, expert_id) = setup_expert(&client, email).await;

        // Add an example first
        authed_post(
            &client,
            &cookie,
            &format!("/api/expert-hub/{expert_id}/examples"),
            json!({
                "question": "Example input for listing",
                "answer": "Example output for listing"
            }),
        )
        .await;

        let body = authed_get(
            &client,
            &cookie,
            &format!("/api/expert-hub/{expert_id}/examples"),
        )
        .await;

        let has_array = body.is_array()
            || body.get("examples").map_or(false, |v| v.is_array());
        assert!(has_array, "list examples should return an array: {body}");
    }

    #[tokio::test]
    #[ignore]
    async fn update_example() {
        let client = Client::new();
        let email = "test_update_example@test.local";
        let (cookie, expert_id) = setup_expert(&client, email).await;

        // Create an example
        let create_res = authed_post(
            &client,
            &cookie,
            &format!("/api/expert-hub/{expert_id}/examples"),
            json!({
                "question": "Original input",
                "answer": "Original output"
            }),
        )
        .await;
        let created: Value = create_res.json().await.unwrap();
        let example_id = created
            .get("id")
            .or_else(|| created.get("exampleId"))
            .expect("example should have an id")
            .as_str()
            .expect("id should be a string");

        // Update the example
        let update_res = authed_patch(
            &client,
            &cookie,
            &format!("/api/expert-hub/{expert_id}/examples/{example_id}"),
            json!({
                "question": "Updated input",
                "answer": "Updated output"
            }),
        )
        .await;

        let status = update_res.status().as_u16();
        assert!(
            status == 200,
            "update example should return 200, got {status}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn delete_example() {
        let client = Client::new();
        let email = "test_delete_example@test.local";
        let (cookie, expert_id) = setup_expert(&client, email).await;

        // Create an example
        let create_res = authed_post(
            &client,
            &cookie,
            &format!("/api/expert-hub/{expert_id}/examples"),
            json!({
                "question": "Example to delete",
                "answer": "This will be deleted"
            }),
        )
        .await;
        let created: Value = create_res.json().await.unwrap();
        let example_id = created
            .get("id")
            .or_else(|| created.get("exampleId"))
            .expect("example should have an id")
            .as_str()
            .expect("id should be a string");

        // Delete the example
        let del_res = authed_delete(
            &client,
            &cookie,
            &format!("/api/expert-hub/{expert_id}/examples/{example_id}"),
        )
        .await;

        let status = del_res.status().as_u16();
        assert!(
            status == 204 || status == 200,
            "delete example should return 204, got {status}"
        );
    }
}

// ============================================================================
// Memory Capsule tests
// ============================================================================
#[cfg(test)]
mod memory_capsule_tests {
    use super::*;

    async fn setup_user(client: &Client) -> String {
        let email = "test_capsule@test.com";
        let _ = create_test_user(client, email, "pass123", "CapsuleUser").await;
        let (cookie, _) = login(client, email, "pass123").await;
        cookie
    }

    #[tokio::test]
    #[ignore]
    async fn create_capsule() {
        // POST a conversation first, then create a capsule for it
        // The capsule creation might be implicit (on first extraction)
        // or via POST /api/memory/capsules
        let client = Client::new();
        let cookie = setup_user(&client).await;
        let res = authed_get(&client, &cookie, "/api/memory/capsules").await;
        assert!(res.is_object() || res.is_array()); // Can list capsules
    }

    #[tokio::test]
    #[ignore]
    async fn capsule_entries_require_auth() {
        let client = Client::new();
        let res = client
            .get(&format!("{BASE}/api/memory/capsules"))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status().as_u16(), 401);
    }

    #[tokio::test]
    #[ignore]
    async fn by_timestamp_endpoint() {
        // GET /api/conversations/:id/messages/by-timestamp?ts=...
        // Should return 400 for invalid timestamp
        let client = Client::new();
        let cookie = setup_user(&client).await;
        let res = client
            .get(&format!(
                "{BASE}/api/conversations/00000000-0000-0000-0000-000000000000/messages/by-timestamp?ts=invalid"
            ))
            .header("Cookie", &cookie)
            .send()
            .await
            .unwrap();
        assert!(res.status().as_u16() == 400 || res.status().as_u16() == 404);
    }

    #[tokio::test]
    #[ignore]
    async fn backfill_embeddings_admin_only() {
        let client = Client::new();
        let cookie = setup_user(&client).await;
        let res =
            authed_post(&client, &cookie, "/api/admin/backfill-embeddings", json!({})).await;
        // Non-admin should get 403
        assert!(res.status().as_u16() == 403 || res.status().as_u16() == 401);
    }
}

// ============================================================================
// Notebook & Kanban tests
// ============================================================================
#[cfg(test)]
mod notebook_kanban_tests {
    use super::*;

    async fn setup_user(client: &Client) -> String {
        let email = "test_nb_kanban@test.com";
        let _ = create_test_user(client, email, "pass123", "NbKanban").await;
        let (cookie, _) = login(client, email, "pass123").await;
        cookie
    }

    #[tokio::test]
    #[ignore]
    async fn list_notebooks() {
        let client = Client::new();
        let cookie = setup_user(&client).await;
        let res = authed_get(&client, &cookie, "/api/notebooks").await;
        let notebooks = res.get("notebooks").and_then(|v| v.as_array());
        assert!(notebooks.is_some());
        // Default notebook should exist
        assert!(notebooks.unwrap().len() >= 1);
    }

    #[tokio::test]
    #[ignore]
    async fn create_note_standalone() {
        let client = Client::new();
        let cookie = setup_user(&client).await;
        // Get default notebook
        let nbs = authed_get(&client, &cookie, "/api/notebooks").await;
        let nb_id = nbs["notebooks"][0]["id"].as_str().unwrap();
        let res = authed_post(
            &client,
            &cookie,
            "/api/notes",
            json!({
                "notebookId": nb_id,
                "title": "Test Note",
                "content": "Test content",
                "tags": ["test"]
            }),
        )
        .await;
        assert!(res.status().is_success());
        let body: Value = res.json().await.unwrap();
        assert!(body.get("id").is_some());
    }

    #[tokio::test]
    #[ignore]
    async fn update_note_standalone() {
        let client = Client::new();
        let cookie = setup_user(&client).await;
        let nbs = authed_get(&client, &cookie, "/api/notebooks").await;
        let nb_id = nbs["notebooks"][0]["id"].as_str().unwrap();
        let create_res = authed_post(
            &client,
            &cookie,
            "/api/notes",
            json!({
                "notebookId": nb_id, "title": "Update Me", "content": "old"
            }),
        )
        .await;
        let note: Value = create_res.json().await.unwrap();
        let note_id = note["id"].as_str().unwrap();
        let patch_res = authed_patch(
            &client,
            &cookie,
            &format!("/api/notes/{note_id}"),
            json!({
                "title": "Updated", "content": "new content"
            }),
        )
        .await;
        assert!(patch_res.status().is_success());
    }

    #[tokio::test]
    #[ignore]
    async fn delete_note_standalone() {
        let client = Client::new();
        let cookie = setup_user(&client).await;
        let nbs = authed_get(&client, &cookie, "/api/notebooks").await;
        let nb_id = nbs["notebooks"][0]["id"].as_str().unwrap();
        let create_res = authed_post(
            &client,
            &cookie,
            "/api/notes",
            json!({
                "notebookId": nb_id, "title": "Delete Me", "content": ""
            }),
        )
        .await;
        let note: Value = create_res.json().await.unwrap();
        let note_id = note["id"].as_str().unwrap();
        let del_res = authed_delete(&client, &cookie, &format!("/api/notes/{note_id}")).await;
        assert!(del_res.status().as_u16() == 204 || del_res.status().is_success());
    }

    #[tokio::test]
    #[ignore]
    async fn kanban_boards_auto_create() {
        let client = Client::new();
        let cookie = setup_user(&client).await;
        let res = authed_get(&client, &cookie, "/api/kanban/boards").await;
        // Should auto-create default board
        let boards = if res.is_array() {
            res.as_array().unwrap().clone()
        } else {
            vec![]
        };
        assert!(boards.len() >= 1);
    }

    #[tokio::test]
    #[ignore]
    async fn kanban_create_card() {
        let client = Client::new();
        let cookie = setup_user(&client).await;
        let boards = authed_get(&client, &cookie, "/api/kanban/boards").await;
        let board_id = boards.as_array().unwrap()[0]["id"].as_str().unwrap();
        let board = authed_get(
            &client,
            &cookie,
            &format!("/api/kanban/boards/{board_id}"),
        )
        .await;
        let col_id = board["columns"][0]["id"].as_str().unwrap();
        let res = authed_post(
            &client,
            &cookie,
            "/api/kanban/cards",
            json!({
                "boardId": board_id, "columnId": col_id, "title": "Test Card"
            }),
        )
        .await;
        assert!(res.status().is_success());
    }
}

// ============================================================================
// Spaces tests
// ============================================================================
#[cfg(test)]
mod spaces_tests {
    use super::*;

    async fn setup_user(client: &Client) -> String {
        let email = "test_spaces@test.com";
        let _ = create_test_user(client, email, "pass123", "SpacesUser").await;
        let (cookie, _) = login(client, email, "pass123").await;
        cookie
    }

    #[tokio::test]
    #[ignore]
    async fn list_spaces_public() {
        let client = Client::new();
        let cookie = setup_user(&client).await;
        let res = authed_get(&client, &cookie, "/api/spaces").await;
        assert!(res.get("spaces").is_some());
        assert!(res.get("total").is_some());
    }

    #[tokio::test]
    #[ignore]
    async fn create_space() {
        let client = Client::new();
        let cookie = setup_user(&client).await;
        let res = authed_post(
            &client,
            &cookie,
            "/api/spaces",
            json!({
                "name": "Test Space", "description": "A test", "category": "other"
            }),
        )
        .await;
        assert!(res.status().is_success());
        let body: Value = res.json().await.unwrap();
        assert!(body.get("id").is_some());
    }

    #[tokio::test]
    #[ignore]
    async fn update_space_cover_url() {
        let client = Client::new();
        let cookie = setup_user(&client).await;
        let create = authed_post(
            &client,
            &cookie,
            "/api/spaces",
            json!({
                "name": "Cover Test", "description": "", "category": "other"
            }),
        )
        .await;
        let body: Value = create.json().await.unwrap();
        let id = body["id"].as_str().unwrap();
        let update = client
            .put(&format!("{BASE}/api/spaces/{id}"))
            .header("Cookie", &cookie)
            .json(&json!({"coverImageUrl": "https://example.com/cover.png"}))
            .send()
            .await
            .unwrap();
        assert!(update.status().is_success());
    }

    #[tokio::test]
    #[ignore]
    async fn delete_space() {
        let client = Client::new();
        let cookie = setup_user(&client).await;
        let create = authed_post(
            &client,
            &cookie,
            "/api/spaces",
            json!({
                "name": "Delete Me", "description": "", "category": "other"
            }),
        )
        .await;
        let body: Value = create.json().await.unwrap();
        let id = body["id"].as_str().unwrap();
        let del = authed_delete(&client, &cookie, &format!("/api/spaces/{id}")).await;
        assert!(del.status().as_u16() == 204 || del.status().is_success());
    }
}

// ============================================================================
// Navigation tests
// ============================================================================
#[cfg(test)]
mod navigation_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn deep_link_conversation_param() {
        // Verify that the web app serves HTML for /?c=xxx
        // (Next.js should return the SPA regardless of query params)
        let client = Client::new();
        let res = client
            .get(&format!("{BASE}/?c=test-conv-id"))
            .send()
            .await
            .unwrap();
        // Should get 200 (SPA) not 404
        assert!(res.status().is_success());
    }

    #[tokio::test]
    #[ignore]
    async fn deep_link_with_message_param() {
        let client = Client::new();
        let res = client
            .get(&format!("{BASE}/?c=test-conv&m=test-msg"))
            .send()
            .await
            .unwrap();
        assert!(res.status().is_success());
    }

    #[tokio::test]
    #[ignore]
    async fn protected_pages_redirect() {
        // /settings, /creator, /office should still serve the SPA
        // (client-side auth guard handles redirect)
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        for path in ["/settings", "/creator", "/office"] {
            let res = client
                .get(&format!("{BASE}{path}"))
                .send()
                .await
                .unwrap();
            // Should get 200 (SPA) or 307 redirect
            assert!(res.status().as_u16() == 200 || res.status().as_u16() == 307);
        }
    }
}
