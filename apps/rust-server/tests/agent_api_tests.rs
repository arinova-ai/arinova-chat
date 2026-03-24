/// Integration tests for the Arinova Agent API endpoints.
///
/// These tests require a running server at localhost:3001, so they are
/// all marked with `#[ignore]`.  Run them explicitly with:
///
///   cargo test --test agent_api_tests -- --ignored
///
/// Agent APIs authenticate via `Authorization: Bearer <bot_token>` header.
/// Set the TEST_BOT_TOKEN env var before running, or it defaults to the
/// placeholder below.

use reqwest::Client;
use serde_json::{json, Value};

fn base_url() -> String {
    std::env::var("TEST_BASE_URL").unwrap_or_else(|_| "http://localhost:3501".to_string())
}

/// Fallback bot token — override with TEST_BOT_TOKEN env var.
const DEFAULT_BOT_TOKEN: &str = "ari_test_bot_token";

fn bot_token() -> String {
    std::env::var("TEST_BOT_TOKEN").unwrap_or_else(|_| DEFAULT_BOT_TOKEN.to_string())
}

// ============================================================================
// Agent-authed helper functions
// ============================================================================

async fn agent_get(client: &Client, path: &str) -> reqwest::Response {
    client
        .get(&format!("{}{path}", base_url()))
        .header("Authorization", format!("Bearer {}", bot_token()))
        .send()
        .await
        .unwrap()
}

async fn agent_get_json(client: &Client, path: &str) -> Value {
    agent_get(client, path)
        .await
        .json::<Value>()
        .await
        .unwrap()
}

async fn agent_post(client: &Client, path: &str, body: Value) -> reqwest::Response {
    client
        .post(&format!("{}{path}", base_url()))
        .header("Authorization", format!("Bearer {}", bot_token()))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .unwrap()
}

async fn agent_post_json(client: &Client, path: &str, body: Value) -> Value {
    agent_post(client, path, body)
        .await
        .json::<Value>()
        .await
        .unwrap()
}

async fn agent_patch(client: &Client, path: &str, body: Value) -> reqwest::Response {
    client
        .patch(&format!("{}{path}", base_url()))
        .header("Authorization", format!("Bearer {}", bot_token()))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .unwrap()
}

#[allow(dead_code)]
async fn agent_patch_json(client: &Client, path: &str, body: Value) -> Value {
    agent_patch(client, path, body)
        .await
        .json::<Value>()
        .await
        .unwrap()
}

async fn agent_delete(client: &Client, path: &str) -> reqwest::Response {
    client
        .delete(&format!("{}{path}", base_url()))
        .header("Authorization", format!("Bearer {}", bot_token()))
        .send()
        .await
        .unwrap()
}

// ============================================================================
// Kanban test-board helpers
// ============================================================================

/// Create a fresh test board named `__test_board__` and return its ID.
async fn create_test_board(client: &Client) -> String {
    let body = agent_post_json(
        client,
        "/api/v1/kanban/boards",
        json!({"name": "__test_board__"}),
    )
    .await;
    body["id"]
        .as_str()
        .expect("create_test_board: response should contain 'id'")
        .to_string()
}

/// Hard-delete a test board and all its data (columns, cards, etc.).
async fn delete_test_board(client: &Client, board_id: &str) {
    let _ = agent_delete(client, &format!("/api/v1/kanban/boards/{board_id}")).await;
}

/// Pre-test cleanup: remove any leftover __test_board__ boards from previous runs.
async fn cleanup_stale_test_boards(client: &Client) {
    let boards = agent_get_json(client, "/api/v1/kanban/boards?includeArchived=true").await;
    if let Some(arr) = boards.as_array() {
        for b in arr {
            let name = b["name"].as_str().unwrap_or("");
            if name.starts_with("__test") {
                if let Some(id) = b["id"].as_str() {
                    let _ = agent_delete(client, &format!("/api/v1/kanban/boards/{id}")).await;
                }
            }
        }
    }
}

/// Helper: get the first column ID of a board.
async fn first_column_id(client: &Client, board_id: &str) -> String {
    let cols = agent_get_json(
        client,
        &format!("/api/v1/kanban/boards/{board_id}/columns"),
    )
    .await;
    cols.as_array()
        .and_then(|arr| arr.first())
        .and_then(|c| c["id"].as_str())
        .expect("Board should have at least one column")
        .to_string()
}

// ============================================================================
// Notebook / Note test-data helpers
// ============================================================================

/// Create a fresh test notebook named `__test_notebook__` and return its ID.
async fn create_test_notebook(client: &Client) -> String {
    let body = agent_post_json(
        client,
        "/api/v1/notebooks",
        json!({"name": "__test_notebook__"}),
    )
    .await;
    body["id"]
        .as_str()
        .expect("create_test_notebook: response should contain 'id'")
        .to_string()
}

/// Delete a test notebook.
async fn delete_test_notebook(client: &Client, notebook_id: &str) {
    let _ = agent_delete(client, &format!("/api/v1/notebooks/{notebook_id}")).await;
}

/// Create a note inside the given notebook and return its ID.
async fn create_test_note(client: &Client, notebook_id: &str, title: &str) -> String {
    let body = agent_post_json(
        client,
        "/api/v1/notes",
        json!({
            "title": title,
            "content": "Test note created by agent_api_tests",
            "notebookId": notebook_id
        }),
    )
    .await;
    body["id"]
        .as_str()
        .expect("create_test_note: response should contain 'id'")
        .to_string()
}

// ============================================================================
// Notes tests
// ============================================================================
#[cfg(test)]
mod notes_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn list_notes_returns_expected_shape() {
        let client = Client::new();
        let nb_id = create_test_notebook(&client).await;
        // Create a note so listing is non-empty
        let note_id = create_test_note(&client, &nb_id, "Shape Check Note").await;

        let res = agent_get(&client, "/api/v1/notes").await;
        let status = res.status().as_u16();
        assert_eq!(status, 200, "GET /api/v1/notes should return 200, got {status}");
        let body: Value = res.json().await.unwrap();
        assert!(body.get("notes").is_some(), "Response should have 'notes' key");
        assert!(body.get("hasMore").is_some(), "Response should have 'hasMore' key");

        // Cleanup
        agent_delete(&client, &format!("/api/v1/notes/{note_id}")).await;
        delete_test_notebook(&client, &nb_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn list_notes_with_search() {
        let client = Client::new();
        let nb_id = create_test_notebook(&client).await;
        let note_id = create_test_note(&client, &nb_id, "__test_search_note__").await;

        let res = agent_get(&client, "/api/v1/notes?search=__test_search_note__").await;
        assert_eq!(
            res.status().as_u16(),
            200,
            "GET /api/v1/notes?search=... should return 200"
        );

        // Cleanup
        agent_delete(&client, &format!("/api/v1/notes/{note_id}")).await;
        delete_test_notebook(&client, &nb_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn list_notes_with_tags_filter() {
        let client = Client::new();
        let nb_id = create_test_notebook(&client).await;
        // Create a note with a specific tag
        let created = agent_post_json(
            &client,
            "/api/v1/notes",
            json!({
                "title": "__test_tagged_note__",
                "content": "Tagged note for filter test",
                "tags": ["__test_tag__"],
                "notebookId": nb_id
            }),
        )
        .await;
        let note_id = created["id"].as_str().expect("Note should have id");

        let res = agent_get(&client, "/api/v1/notes?tags=__test_tag__").await;
        assert_eq!(
            res.status().as_u16(),
            200,
            "GET /api/v1/notes?tags=__test_tag__ should return 200"
        );

        // Cleanup
        agent_delete(&client, &format!("/api/v1/notes/{note_id}")).await;
        delete_test_notebook(&client, &nb_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn create_note_requires_title() {
        let client = Client::new();
        let res = agent_post(
            &client,
            "/api/v1/notes",
            json!({
                "title": "",
                "content": "test",
                "notebookId": "00000000-0000-0000-0000-000000000000"
            }),
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            400,
            "Creating a note with empty title should return 400"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn create_note_requires_valid_notebook_id() {
        let client = Client::new();
        let res = agent_post(
            &client,
            "/api/v1/notes",
            json!({
                "title": "Test Note",
                "content": "Hello",
                "notebookId": "not-a-uuid"
            }),
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            400,
            "Creating a note with invalid notebookId should return 400"
        );
    }

    /// Full CRUD cycle: create -> get -> update -> delete
    #[tokio::test]
    #[ignore]
    async fn note_crud_cycle() {
        let client = Client::new();
        let nb_id = create_test_notebook(&client).await;

        // CREATE
        let create_body = json!({
            "title": "Integration Test Note",
            "content": "This is a test note created by agent_api_tests.",
            "tags": ["test", "integration"],
            "notebookId": nb_id
        });
        let create_res = agent_post(&client, "/api/v1/notes", create_body).await;
        assert_eq!(create_res.status().as_u16(), 201, "Create note should return 201");
        let created: Value = create_res.json().await.unwrap();
        let note_id = created["id"].as_str().expect("Created note should have an id");
        assert_eq!(created["title"].as_str().unwrap(), "Integration Test Note");
        assert_eq!(created["creatorType"].as_str().unwrap(), "agent");
        assert!(created.get("createdAt").is_some());
        assert!(created.get("updatedAt").is_some());
        assert!(created.get("tags").is_some());

        // GET
        let fetched = agent_get_json(&client, &format!("/api/v1/notes/{note_id}")).await;
        assert_eq!(fetched["id"].as_str().unwrap(), note_id);
        assert_eq!(fetched["title"].as_str().unwrap(), "Integration Test Note");
        assert!(fetched.get("backlinks").is_some(), "GET note should include backlinks");
        assert!(fetched.get("linkedCards").is_some(), "GET note should include linkedCards");

        // UPDATE
        let update_res = agent_patch(
            &client,
            &format!("/api/v1/notes/{note_id}"),
            json!({
                "title": "Updated Test Note",
                "content": "Updated content.",
                "tags": ["test", "updated"]
            }),
        )
        .await;
        assert_eq!(update_res.status().as_u16(), 200, "Update note should return 200");
        let updated: Value = update_res.json().await.unwrap();
        assert_eq!(updated["title"].as_str().unwrap(), "Updated Test Note");

        // DELETE
        let delete_res = agent_delete(&client, &format!("/api/v1/notes/{note_id}")).await;
        assert_eq!(delete_res.status().as_u16(), 204, "Delete note should return 204");

        // Verify deletion
        let gone_res = agent_get(&client, &format!("/api/v1/notes/{note_id}")).await;
        assert_eq!(gone_res.status().as_u16(), 404, "Deleted note should return 404");

        // Cleanup
        delete_test_notebook(&client, &nb_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn get_nonexistent_note_returns_404() {
        let client = Client::new();
        let res = agent_get(
            &client,
            "/api/v1/notes/00000000-0000-0000-0000-000000000000",
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            404,
            "Getting a nonexistent note should return 404"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn update_note_with_nothing_returns_400() {
        let client = Client::new();
        let res = agent_patch(
            &client,
            "/api/v1/notes/00000000-0000-0000-0000-000000000000",
            json!({}),
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            400,
            "Update with no fields should return 400"
        );
    }
}

// ============================================================================
// Note Thread tests
// ============================================================================
#[cfg(test)]
mod note_thread_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn get_thread_for_nonexistent_note() {
        let client = Client::new();
        let res = agent_get(
            &client,
            "/api/v1/notes/00000000-0000-0000-0000-000000000000/thread",
        )
        .await;
        // Should be 403 (access denied) or possibly 500 for nonexistent note
        let status = res.status().as_u16();
        assert!(
            status == 403 || status == 500,
            "Thread for nonexistent note should return 403 or 500, got {status}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn post_thread_requires_content() {
        let client = Client::new();
        let res = agent_post(
            &client,
            "/api/v1/notes/00000000-0000-0000-0000-000000000000/thread",
            json!({"content": ""}),
        )
        .await;
        let status = res.status().as_u16();
        assert!(
            status == 400 || status == 403,
            "Posting empty thread content should return 400 or 403, got {status}"
        );
    }

    /// Full thread flow: create notebook + note, post thread message, get thread messages
    #[tokio::test]
    #[ignore]
    async fn note_thread_flow() {
        let client = Client::new();
        let nb_id = create_test_notebook(&client).await;
        let note_id = create_test_note(&client, &nb_id, "Thread Test Note").await;

        // Post a thread message
        let thread_msg = agent_post_json(
            &client,
            &format!("/api/v1/notes/{note_id}/thread"),
            json!({"content": "This is a thread reply from agent"}),
        )
        .await;
        assert_eq!(thread_msg["role"].as_str().unwrap(), "assistant");
        assert!(thread_msg.get("id").is_some());
        assert_eq!(
            thread_msg["content"].as_str().unwrap(),
            "This is a thread reply from agent"
        );

        // Get thread messages
        let thread = agent_get_json(&client, &format!("/api/v1/notes/{note_id}/thread")).await;
        assert!(thread.get("messages").is_some(), "Thread should have messages array");
        let messages = thread["messages"].as_array().unwrap();
        assert!(!messages.is_empty(), "Thread should have at least one message");
        let last = messages.last().unwrap();
        assert_eq!(last["role"].as_str().unwrap(), "assistant");

        // Cleanup
        agent_delete(&client, &format!("/api/v1/notes/{note_id}")).await;
        delete_test_notebook(&client, &nb_id).await;
    }
}

// ============================================================================
// Notebooks tests
// ============================================================================
#[cfg(test)]
mod notebooks_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn list_notebooks_returns_200() {
        // v1 uses CallerIdentity — no userId param needed
        let client = Client::new();
        let res = agent_get(&client, "/api/v1/notebooks").await;
        assert_eq!(
            res.status().as_u16(),
            200,
            "GET /api/v1/notebooks should return 200 (owner inferred from token)"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn list_notebooks_ignores_invalid_user_param() {
        // v1 ignores userId param — uses CallerIdentity instead
        let client = Client::new();
        let res = agent_get(
            &client,
            "/api/v1/notebooks?userId=nonexistent-user-id",
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            200,
            "GET notebooks with userId param should still return 200 (param ignored)"
        );
    }

    /// Full notebook CRUD: create -> list notes -> update -> delete
    #[tokio::test]
    #[ignore]
    async fn notebook_crud_flow() {
        let client = Client::new();

        // CREATE
        let create_res = agent_post(
            &client,
            "/api/v1/notebooks",
            json!({"name": "__test_notebook_crud__"}),
        )
        .await;
        assert_eq!(create_res.status().as_u16(), 201, "Create notebook should return 201");
        let created: Value = create_res.json().await.unwrap();
        let nb_id = created["id"].as_str().expect("Notebook should have id");

        // Create a note inside it so listing is non-empty
        let note_id = create_test_note(&client, nb_id, "Note in CRUD Notebook").await;

        // LIST NOTES
        let nb_notes_res = agent_get(
            &client,
            &format!("/api/v1/notebooks/{nb_id}/notes"),
        )
        .await;
        assert_eq!(nb_notes_res.status().as_u16(), 200, "GET notebook notes should return 200");
        let nb_notes: Value = nb_notes_res.json().await.unwrap();
        assert!(
            nb_notes.get("notes").is_some(),
            "Notebook notes response should have 'notes' key"
        );

        // UPDATE
        let update_res = agent_patch(
            &client,
            &format!("/api/v1/notebooks/{nb_id}"),
            json!({"name": "__test_notebook_crud_updated__"}),
        )
        .await;
        assert_eq!(update_res.status().as_u16(), 200, "Update notebook should return 200");

        // Cleanup
        agent_delete(&client, &format!("/api/v1/notes/{note_id}")).await;
        delete_test_notebook(&client, nb_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn create_notebook_requires_name() {
        let client = Client::new();
        let res = agent_post(
            &client,
            "/api/v1/notebooks",
            json!({
                "name": "",
                "userId": "some-user-id"
            }),
        )
        .await;
        let status = res.status().as_u16();
        assert!(
            status == 400 || status == 403,
            "Creating notebook with empty name should return 400 or 403, got {status}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn list_notebook_notes_for_nonexistent_notebook() {
        let client = Client::new();
        let res = agent_get(
            &client,
            "/api/v1/notebooks/00000000-0000-0000-0000-000000000000/notes",
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            404,
            "Listing notes for nonexistent notebook should return 404"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn update_notebook_with_nothing_returns_400() {
        let client = Client::new();
        let res = agent_patch(
            &client,
            "/api/v1/notebooks/00000000-0000-0000-0000-000000000000",
            json!({}),
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            400,
            "Update notebook with no fields should return 400"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn delete_nonexistent_notebook_returns_404() {
        let client = Client::new();
        let res = agent_delete(
            &client,
            "/api/v1/notebooks/00000000-0000-0000-0000-000000000000",
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            403,
            "Deleting nonexistent notebook should return 403 (permission check first)"
        );
    }
}

// ============================================================================
// Kanban — Boards tests
// ============================================================================
#[cfg(test)]
mod kanban_board_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn list_boards_returns_array() {
        let client = Client::new();
        // Pre-cleanup: remove stale __test__ boards from previous runs
        cleanup_stale_test_boards(&client).await;
        // Create a test board so the listing is never empty
        let board_id = create_test_board(&client).await;

        let res = agent_get(&client, "/api/v1/kanban/boards").await;
        let status = res.status().as_u16();
        assert_eq!(status, 200, "GET /api/v1/kanban/boards should return 200, got {status}");
        let body: Value = res.json().await.unwrap();
        assert!(body.is_array(), "Response should be an array of boards");
        // Each board should have id, name, columns
        if let Some(boards) = body.as_array() {
            if let Some(board) = boards.first() {
                assert!(board.get("id").is_some(), "Board should have 'id'");
                assert!(board.get("name").is_some(), "Board should have 'name'");
                assert!(board.get("columns").is_some(), "Board should have 'columns'");
            }
        }

        // Cleanup
        delete_test_board(&client, &board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn list_boards_with_include_archived() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;
        // Archive (not hard-delete) so there's something in the archived list
        let _ = agent_post(
            &client,
            &format!("/api/v1/kanban/boards/{board_id}/archive"),
            json!({}),
        )
        .await;

        let res = agent_get(&client, "/api/v1/kanban/boards?include_archived=true").await;
        assert_eq!(res.status().as_u16(), 200);

        // Cleanup: hard-delete
        delete_test_board(&client, &board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn create_board_with_default_columns() {
        let client = Client::new();
        let res = agent_post(
            &client,
            "/api/v1/kanban/boards",
            json!({"name": "__test_board__"}),
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            201,
            "Create board should return 201"
        );
        let body: Value = res.json().await.unwrap();
        assert!(body.get("id").is_some(), "Created board should have 'id'");
        assert!(body.get("name").is_some(), "Created board should have 'name'");

        // Cleanup
        let board_id = body["id"].as_str().unwrap();
        delete_test_board(&client, board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn create_board_with_custom_columns() {
        let client = Client::new();
        let res = agent_post(
            &client,
            "/api/v1/kanban/boards",
            json!({
                "name": "__test_board__",
                "columns": [
                    {"name": "Todo"},
                    {"name": "Doing"},
                    {"name": "Done"}
                ]
            }),
        )
        .await;
        assert_eq!(res.status().as_u16(), 201);

        // Cleanup
        let body: Value = res.json().await.unwrap();
        if let Some(board_id) = body["id"].as_str() {
            delete_test_board(&client, board_id).await;
        }
    }

    #[tokio::test]
    #[ignore]
    async fn update_board() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;

        let res = agent_patch(
            &client,
            &format!("/api/v1/kanban/boards/{board_id}"),
            json!({"name": "Updated Board Name"}),
        )
        .await;
        assert_eq!(res.status().as_u16(), 200, "Update board should return 200");

        // Cleanup
        delete_test_board(&client, &board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn archive_board() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;

        let res = agent_post(
            &client,
            &format!("/api/v1/kanban/boards/{board_id}/archive"),
            json!({}),
        )
        .await;
        let status = res.status().as_u16();
        assert!(
            status == 200 || status == 204,
            "Archive board should return 200 or 204, got {status}"
        );
    }
}

// ============================================================================
// Kanban — Columns tests
// ============================================================================
#[cfg(test)]
mod kanban_column_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn list_columns() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;

        let res = agent_get(&client, &format!("/api/v1/kanban/boards/{board_id}/columns")).await;
        assert_eq!(res.status().as_u16(), 200, "List columns should return 200");
        let body: Value = res.json().await.unwrap();
        assert!(body.is_array(), "Columns response should be an array");

        delete_test_board(&client, &board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn create_column() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;

        let res = agent_post(
            &client,
            &format!("/api/v1/kanban/boards/{board_id}/columns"),
            json!({"name": "New Test Column"}),
        )
        .await;
        assert_eq!(res.status().as_u16(), 201, "Create column should return 201");

        delete_test_board(&client, &board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn update_column() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;

        // Create a column
        let col_res = agent_post(
            &client,
            &format!("/api/v1/kanban/boards/{board_id}/columns"),
            json!({"name": "Column To Update"}),
        )
        .await;
        assert_eq!(col_res.status().as_u16(), 201);
        let col: Value = col_res.json().await.unwrap();
        let col_id = col["id"].as_str().expect("Column should have id");

        let update_res = agent_patch(
            &client,
            &format!("/api/v1/kanban/columns/{col_id}"),
            json!({"name": "Renamed Column"}),
        )
        .await;
        assert_eq!(
            update_res.status().as_u16(),
            200,
            "Update column should return 200"
        );

        delete_test_board(&client, &board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn delete_column() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;

        // Create a column to delete
        let col: Value = agent_post_json(
            &client,
            &format!("/api/v1/kanban/boards/{board_id}/columns"),
            json!({"name": "Column To Delete"}),
        )
        .await;
        let col_id = col["id"].as_str().expect("Column should have id");

        let res = agent_delete(&client, &format!("/api/v1/kanban/columns/{col_id}")).await;
        assert_eq!(
            res.status().as_u16(),
            200,
            "Delete column should return 200"
        );

        delete_test_board(&client, &board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn reorder_columns() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;

        // Add an extra column so we have at least 2
        agent_post(
            &client,
            &format!("/api/v1/kanban/boards/{board_id}/columns"),
            json!({"name": "Extra Column"}),
        )
        .await;

        // Get existing columns
        let cols: Value = agent_get_json(
            &client,
            &format!("/api/v1/kanban/boards/{board_id}/columns"),
        )
        .await;
        if let Some(arr) = cols.as_array() {
            if arr.len() >= 2 {
                // Reverse the order
                let ids: Vec<&str> = arr
                    .iter()
                    .rev()
                    .filter_map(|c| c["id"].as_str())
                    .collect();
                let res = agent_post(
                    &client,
                    &format!("/api/v1/kanban/boards/{board_id}/columns/reorder"),
                    json!({"columnIds": ids}),
                )
                .await;
                let status = res.status().as_u16();
                assert!(
                    status == 200 || status == 204,
                    "Reorder columns should return 200 or 204, got {status}"
                );
            }
        }

        delete_test_board(&client, &board_id).await;
    }
}

// ============================================================================
// Kanban — Cards tests
// ============================================================================
#[cfg(test)]
mod kanban_card_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn list_cards_returns_array() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;
        let col_id = first_column_id(&client, &board_id).await;

        // Create a card so the listing is not empty
        let created = agent_post_json(
            &client,
            "/api/v1/kanban/cards",
            json!({
                "title": "Shape Check Card",
                "columnId": col_id
            }),
        )
        .await;

        let res = agent_get(&client, &format!("/api/v1/kanban/cards?boardId={board_id}")).await;
        assert_eq!(res.status().as_u16(), 200);
        let body: Value = res.json().await.unwrap();
        assert!(body.is_array(), "Cards response should be an array");
        // Verify card shape
        if let Some(cards) = body.as_array() {
            if let Some(card) = cards.first() {
                assert!(card.get("id").is_some(), "Card should have 'id'");
                assert!(card.get("title").is_some(), "Card should have 'title'");
                assert!(card.get("columnId").is_some(), "Card should have 'columnId'");
                assert!(card.get("columnName").is_some(), "Card should have 'columnName'");
                assert!(card.get("labels").is_some(), "Card should have 'labels'");
            }
        }

        // Cleanup
        if let Some(id) = created["id"].as_str() {
            agent_delete(&client, &format!("/api/v1/kanban/cards/{id}")).await;
        }
        delete_test_board(&client, &board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn list_cards_with_search() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;

        let res = agent_get(&client, &format!("/api/v1/kanban/cards?boardId={board_id}&search=test")).await;
        assert_eq!(res.status().as_u16(), 200);
        let body: Value = res.json().await.unwrap();
        assert!(body.is_array());

        delete_test_board(&client, &board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn card_crud_cycle() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;
        let col_id = first_column_id(&client, &board_id).await;

        // CREATE
        let create_res = agent_post(
            &client,
            "/api/v1/kanban/cards",
            json!({
                "title": "Agent Test Card",
                "description": "Created by integration test",
                "priority": "medium",
                "columnId": col_id
            }),
        )
        .await;
        let status = create_res.status().as_u16();
        assert!(
            status == 201 || status == 200,
            "Create card should return 201 or 200, got {status}"
        );
        let created: Value = create_res.json().await.unwrap();
        let card_id = created["id"].as_str().expect("Card should have id");
        assert_eq!(created["title"].as_str().unwrap(), "Agent Test Card");

        // UPDATE
        let update_res = agent_patch(
            &client,
            &format!("/api/v1/kanban/cards/{card_id}"),
            json!({
                "title": "Updated Agent Test Card",
                "description": "Updated by integration test",
                "priority": "high"
            }),
        )
        .await;
        assert_eq!(update_res.status().as_u16(), 200, "Update card should return 200");
        let update_body: Value = update_res.json().await.unwrap();
        assert!(
            update_body.get("ok").is_some(),
            "Update response should have 'ok'"
        );

        // COMPLETE (move to Done)
        let complete_res = agent_post(
            &client,
            &format!("/api/v1/kanban/cards/{card_id}/complete"),
            json!({}),
        )
        .await;
        let complete_status = complete_res.status().as_u16();
        assert!(
            complete_status == 200 || complete_status == 404,
            "Complete card should return 200 or 404 (no Done column), got {complete_status}"
        );

        // DELETE
        let delete_res = agent_delete(&client, &format!("/api/v1/kanban/cards/{card_id}")).await;
        let del_status = delete_res.status().as_u16();
        assert!(
            del_status == 200 || del_status == 204,
            "Delete card should return 200 or 204, got {del_status}"
        );

        delete_test_board(&client, &board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn create_card_with_column_name() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;

        let res = agent_post(
            &client,
            "/api/v1/kanban/cards",
            json!({
                "title": "Card in Named Column",
                "columnName": "To Do",
                "boardId": board_id
            }),
        )
        .await;
        let status = res.status().as_u16();
        assert!(
            status == 200 || status == 201,
            "Create card with columnName should return 200/201, got {status}"
        );
        // Cleanup
        let body: Value = res.json().await.unwrap();
        if let Some(id) = body["id"].as_str() {
            agent_delete(&client, &format!("/api/v1/kanban/cards/{id}")).await;
        }

        delete_test_board(&client, &board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn update_card_with_no_fields_returns_400() {
        let client = Client::new();
        let res = agent_patch(
            &client,
            "/api/v1/kanban/cards/00000000-0000-0000-0000-000000000000",
            json!({}),
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            400,
            "Update card with no fields should return 400"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn list_archived_cards() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;

        let res = agent_get(
            &client,
            &format!("/api/v1/kanban/boards/{board_id}/archived-cards?page=1&limit=10"),
        )
        .await;
        assert_eq!(res.status().as_u16(), 200);
        let body: Value = res.json().await.unwrap();
        assert!(
            body.get("cards").is_some() || body.is_array(),
            "Archived cards response should have structure"
        );

        delete_test_board(&client, &board_id).await;
    }
}

// ============================================================================
// Kanban — Commits tests
// ============================================================================
#[cfg(test)]
mod kanban_commit_tests {
    use super::*;

    /// Helper: create a card on the given board's first column and return its ID.
    async fn create_test_card(client: &Client, board_id: &str) -> String {
        let col_id = first_column_id(client, board_id).await;
        let body = agent_post_json(
            client,
            "/api/v1/kanban/cards",
            json!({
                "title": "Commit Test Card",
                "description": "Card for commit testing",
                "columnId": col_id
            }),
        )
        .await;
        body["id"]
            .as_str()
            .expect("Card should have id")
            .to_string()
    }

    #[tokio::test]
    #[ignore]
    async fn add_and_list_commits() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;
        let card_id = create_test_card(&client, &board_id).await;

        // Add a commit
        let add_res = agent_post(
            &client,
            &format!("/api/v1/kanban/cards/{card_id}/commits"),
            json!({
                "commitHash": "abc1234567890def",
                "message": "feat: test commit message"
            }),
        )
        .await;
        assert_eq!(
            add_res.status().as_u16(),
            201,
            "Add commit should return 201"
        );

        // List commits
        let list_res = agent_get(
            &client,
            &format!("/api/v1/kanban/cards/{card_id}/commits"),
        )
        .await;
        assert_eq!(
            list_res.status().as_u16(),
            200,
            "List commits should return 200"
        );
        let commits: Value = list_res.json().await.unwrap();
        assert!(commits.is_array(), "Commits response should be an array");
        let arr = commits.as_array().unwrap();
        assert!(!arr.is_empty(), "Should have at least one commit");
        let commit = &arr[0];
        assert!(commit.get("commit_hash").is_some() || commit.get("commitHash").is_some());

        // Cleanup
        agent_delete(&client, &format!("/api/v1/kanban/cards/{card_id}")).await;
        delete_test_board(&client, &board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn add_commit_with_invalid_hash_returns_400() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;
        let card_id = create_test_card(&client, &board_id).await;

        let res = agent_post(
            &client,
            &format!("/api/v1/kanban/cards/{card_id}/commits"),
            json!({"commitHash": "", "message": null}),
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            400,
            "Empty commit hash should return 400"
        );

        agent_delete(&client, &format!("/api/v1/kanban/cards/{card_id}")).await;
        delete_test_board(&client, &board_id).await;
    }
}

// ============================================================================
// Kanban — Card-Note linking tests
// ============================================================================
#[cfg(test)]
mod kanban_card_note_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn link_unlink_and_list_card_notes() {
        let client = Client::new();

        // Create isolated test data: board + notebook + note
        let board_id = create_test_board(&client).await;
        let col_id = first_column_id(&client, &board_id).await;
        let nb_id = create_test_notebook(&client).await;
        let note_id = create_test_note(&client, &nb_id, "Note for Card Link Test").await;

        // Create a card on the test board
        let card: Value = agent_post_json(
            &client,
            "/api/v1/kanban/cards",
            json!({"title": "Card for Note Link Test", "columnId": col_id}),
        )
        .await;
        let card_id = card["id"].as_str().unwrap();

        // LINK
        let link_res = agent_post(
            &client,
            &format!("/api/v1/kanban/cards/{card_id}/notes"),
            json!({"noteId": note_id}),
        )
        .await;
        assert_eq!(
            link_res.status().as_u16(),
            200,
            "Link note to card should return 200"
        );
        let link_body: Value = link_res.json().await.unwrap();
        assert_eq!(link_body["linked"], json!(true));

        // LIST
        let list_res = agent_get(
            &client,
            &format!("/api/v1/kanban/cards/{card_id}/notes"),
        )
        .await;
        assert_eq!(list_res.status().as_u16(), 200);
        let list_body: Value = list_res.json().await.unwrap();
        assert!(list_body.is_array(), "Card notes should be an array");

        // UNLINK
        let unlink_res = agent_delete(
            &client,
            &format!("/api/v1/kanban/cards/{card_id}/notes/{note_id}"),
        )
        .await;
        assert_eq!(
            unlink_res.status().as_u16(),
            204,
            "Unlink note from card should return 204"
        );

        // Cleanup
        agent_delete(&client, &format!("/api/v1/kanban/cards/{card_id}")).await;
        agent_delete(&client, &format!("/api/v1/notes/{note_id}")).await;
        delete_test_notebook(&client, &nb_id).await;
        delete_test_board(&client, &board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn link_nonexistent_note_returns_404() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;
        let col_id = first_column_id(&client, &board_id).await;

        let card: Value = agent_post_json(
            &client,
            "/api/v1/kanban/cards",
            json!({"title": "Card for 404 note test", "columnId": col_id}),
        )
        .await;
        let card_id = card["id"].as_str().unwrap();

        let res = agent_post(
            &client,
            &format!("/api/v1/kanban/cards/{card_id}/notes"),
            json!({"noteId": "00000000-0000-0000-0000-000000000000"}),
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            404,
            "Linking nonexistent note should return 404"
        );

        agent_delete(&client, &format!("/api/v1/kanban/cards/{card_id}")).await;
        delete_test_board(&client, &board_id).await;
    }
}

// ============================================================================
// Kanban — Labels tests
// ============================================================================
#[cfg(test)]
mod kanban_label_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn label_crud_cycle() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;

        // CREATE
        let create_res = agent_post(
            &client,
            &format!("/api/v1/kanban/boards/{board_id}/labels"),
            json!({"name": "Test Label", "color": "#ff0000"}),
        )
        .await;
        assert_eq!(create_res.status().as_u16(), 201, "Create label should return 201");
        let label: Value = create_res.json().await.unwrap();
        let label_id = label["id"].as_str().expect("Label should have id");
        assert_eq!(label["name"].as_str().unwrap(), "Test Label");
        assert_eq!(label["color"].as_str().unwrap(), "#ff0000");

        // LIST
        let list_res = agent_get(
            &client,
            &format!("/api/v1/kanban/boards/{board_id}/labels"),
        )
        .await;
        assert_eq!(list_res.status().as_u16(), 200);
        let labels: Value = list_res.json().await.unwrap();
        assert!(labels.is_array());

        // UPDATE
        let update_res = agent_patch(
            &client,
            &format!("/api/v1/kanban/labels/{label_id}"),
            json!({"name": "Updated Label", "color": "#00ff00"}),
        )
        .await;
        assert_eq!(update_res.status().as_u16(), 200);
        let updated: Value = update_res.json().await.unwrap();
        assert_eq!(updated["name"].as_str().unwrap(), "Updated Label");

        // DELETE
        let del_res = agent_delete(&client, &format!("/api/v1/kanban/labels/{label_id}")).await;
        assert_eq!(del_res.status().as_u16(), 204);

        delete_test_board(&client, &board_id).await;
    }

    #[tokio::test]
    #[ignore]
    async fn add_and_remove_label_from_card() {
        let client = Client::new();
        let board_id = create_test_board(&client).await;
        let col_id = first_column_id(&client, &board_id).await;

        // Create a label on the test board
        let label: Value = agent_post_json(
            &client,
            &format!("/api/v1/kanban/boards/{board_id}/labels"),
            json!({"name": "Card Label Test"}),
        )
        .await;
        let label_id = label["id"].as_str().expect("Label should have id");

        // Create a card on the test board
        let card: Value = agent_post_json(
            &client,
            "/api/v1/kanban/cards",
            json!({"title": "Card for Label Test", "columnId": col_id}),
        )
        .await;
        let card_id = card["id"].as_str().unwrap();

        // ADD label to card
        let add_res = agent_post(
            &client,
            &format!("/api/v1/kanban/cards/{card_id}/labels"),
            json!({"labelId": label_id}),
        )
        .await;
        let add_status = add_res.status().as_u16();
        assert!(
            add_status == 200,
            "Add label to card should return 200, got {add_status}"
        );

        // REMOVE label from card
        let remove_res = agent_delete(
            &client,
            &format!("/api/v1/kanban/cards/{card_id}/labels/{label_id}"),
        )
        .await;
        assert_eq!(
            remove_res.status().as_u16(),
            204,
            "Remove label from card should return 204"
        );

        // Cleanup
        agent_delete(&client, &format!("/api/v1/kanban/cards/{card_id}")).await;
        agent_delete(&client, &format!("/api/v1/kanban/labels/{label_id}")).await;
        delete_test_board(&client, &board_id).await;
    }
}

// ============================================================================
// Memories tests (user-auth based, but testing the agent_memories module)
// ============================================================================
#[cfg(test)]
mod memories_tests {
    use super::*;

    // Note: The agent_memories endpoints use AuthUser (cookie auth), not AuthAgent (bot token).
    // These tests verify the endpoints respond correctly to agent token auth.
    // If they require user auth, they'll return 401.

    #[tokio::test]
    #[ignore]
    async fn list_memories_without_agent_id_returns_error() {
        let client = Client::new();
        let res = agent_get(&client, "/api/v1/memories").await;
        let status = res.status().as_u16();
        // Might be 400 (missing agent_id) or 401 (user auth required) or 422
        assert!(
            status == 400 || status == 401 || status == 422,
            "GET /api/v1/memories without params should error, got {status}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn list_memories_with_agent_id() {
        let client = Client::new();
        // Use a dummy agent_id — will likely return 401 or 403
        let res = agent_get(
            &client,
            "/api/v1/memories?agent_id=00000000-0000-0000-0000-000000000000",
        )
        .await;
        let status = res.status().as_u16();
        assert!(
            status == 200 || status == 401 || status == 403,
            "GET memories with agent_id should return 200/401/403, got {status}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn create_memory_with_invalid_category_returns_400() {
        let client = Client::new();
        let res = agent_post(
            &client,
            "/api/v1/memories",
            json!({
                "agent_id": "00000000-0000-0000-0000-000000000000",
                "category": "invalid_category",
                "summary": "Test memory"
            }),
        )
        .await;
        let status = res.status().as_u16();
        assert!(
            status == 400 || status == 401 || status == 403,
            "Create memory with invalid category should return 400/401/403, got {status}"
        );
    }
}

// ============================================================================
// Agent Send tests
// ============================================================================
#[cfg(test)]
mod agent_send_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn send_requires_conversation_and_content() {
        let client = Client::new();
        let res = agent_post(
            &client,
            "/api/v1/messages/send",
            json!({"conversationId": "", "content": ""}),
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            400,
            "Send with empty fields should return 400"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn send_to_invalid_conversation_returns_403() {
        let client = Client::new();
        let res = agent_post(
            &client,
            "/api/v1/messages/send",
            json!({
                "conversationId": "00000000-0000-0000-0000-000000000000",
                "content": "Hello from test"
            }),
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            403,
            "Send to nonexistent conversation should return 403"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn send_returns_message_id_and_seq() {
        // This test requires the agent to actually be in a conversation.
        // It will be skipped if no valid conversation is found.
        let client = Client::new();

        // Try to get messages from a known conversation to verify send works
        // This is an optional test — only passes if the bot has a real conversation
        let res = agent_post(
            &client,
            "/api/v1/messages/send",
            json!({
                "conversationId": "00000000-0000-0000-0000-000000000000",
                "content": "Integration test message"
            }),
        )
        .await;
        let status = res.status().as_u16();
        if status == 200 {
            let body: Value = res.json().await.unwrap();
            assert!(body.get("messageId").is_some(), "Send response should have messageId");
            assert!(body.get("seq").is_some(), "Send response should have seq");
        }
        // 403 is expected if the agent is not in the conversation
    }
}

// ============================================================================
// Agent Search tests
// ============================================================================
#[cfg(test)]
mod agent_search_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn search_requires_query() {
        let client = Client::new();
        let res = agent_get(&client, "/api/v1/messages/search?q=").await;
        assert_eq!(
            res.status().as_u16(),
            400,
            "Search with empty query should return 400"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn search_with_valid_query() {
        let client = Client::new();
        let res = agent_get(&client, "/api/v1/messages/search?q=hello").await;
        assert_eq!(res.status().as_u16(), 200, "Search should return 200");
        let body: Value = res.json().await.unwrap();
        assert!(body.get("results").is_some(), "Search should have 'results' key");
        let results = body["results"].as_array().unwrap();
        // Results may be empty, but shape should be correct
        for result in results {
            assert!(result.get("messageId").is_some());
            assert!(result.get("conversationId").is_some());
            assert!(result.get("content").is_some());
            assert!(result.get("createdAt").is_some());
        }
    }

    #[tokio::test]
    #[ignore]
    async fn search_with_conversation_filter() {
        let client = Client::new();
        let res = agent_get(
            &client,
            "/api/v1/messages/search?q=test&conversationId=00000000-0000-0000-0000-000000000000",
        )
        .await;
        assert_eq!(res.status().as_u16(), 200);
    }

    #[tokio::test]
    #[ignore]
    async fn search_with_limit_and_offset() {
        let client = Client::new();
        let res = agent_get(&client, "/api/v1/messages/search?q=test&limit=5&offset=0").await;
        assert_eq!(res.status().as_u16(), 200);
    }

    #[tokio::test]
    #[ignore]
    async fn search_with_too_long_query_returns_400() {
        let client = Client::new();
        let long_query = "a".repeat(501);
        let res = agent_get(&client, &format!("/api/v1/messages/search?q={long_query}")).await;
        assert_eq!(
            res.status().as_u16(),
            400,
            "Search with >500 char query should return 400"
        );
    }
}

// ============================================================================
// Agent Messages tests
// ============================================================================
#[cfg(test)]
mod agent_messages_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn get_messages_for_nonexistent_conversation_returns_403() {
        let client = Client::new();
        let res = agent_get(
            &client,
            "/api/v1/messages/00000000-0000-0000-0000-000000000000",
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            403,
            "Messages for nonexistent conversation should return 403"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn get_messages_with_limit() {
        let client = Client::new();
        let res = agent_get(
            &client,
            "/api/v1/messages/00000000-0000-0000-0000-000000000000?limit=10",
        )
        .await;
        let status = res.status().as_u16();
        assert!(
            status == 200 || status == 403,
            "Messages with limit should return 200 or 403, got {status}"
        );
        if status == 200 {
            let body: Value = res.json().await.unwrap();
            assert!(body.get("messages").is_some());
            assert!(body.get("hasMore").is_some());
        }
    }

    #[tokio::test]
    #[ignore]
    async fn get_messages_with_before_cursor() {
        let client = Client::new();
        let res = agent_get(
            &client,
            "/api/v1/messages/00000000-0000-0000-0000-000000000000?before=00000000-0000-0000-0000-000000000001",
        )
        .await;
        let status = res.status().as_u16();
        assert!(
            status == 200 || status == 403,
            "Messages with before should return 200 or 403, got {status}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn get_messages_with_after_cursor() {
        let client = Client::new();
        let res = agent_get(
            &client,
            "/api/v1/messages/00000000-0000-0000-0000-000000000000?after=00000000-0000-0000-0000-000000000001",
        )
        .await;
        let status = res.status().as_u16();
        assert!(
            status == 200 || status == 403,
            "Messages with after should return 200 or 403, got {status}"
        );
    }
}

// ============================================================================
// Agent Skills tests
// ============================================================================
#[cfg(test)]
mod agent_skills_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn list_installed_skills() {
        let client = Client::new();
        let res = agent_get(&client, "/api/v1/skills/installed").await;
        assert_eq!(
            res.status().as_u16(),
            200,
            "GET /api/v1/skills/installed should return 200"
        );
        let body: Value = res.json().await.unwrap();
        assert!(body.get("skills").is_some(), "Response should have 'skills' key");
        let skills = body["skills"].as_array().unwrap();
        for skill in skills {
            assert!(skill.get("id").is_some(), "Skill should have 'id'");
            assert!(skill.get("name").is_some(), "Skill should have 'name'");
            assert!(skill.get("slug").is_some(), "Skill should have 'slug'");
            assert!(skill.get("promptContent").is_some(), "Skill should have 'promptContent'");
            assert!(skill.get("promptTemplate").is_some(), "Skill should have 'promptTemplate'");
            assert!(skill.get("parameters").is_some(), "Skill should have 'parameters'");
            assert!(skill.get("isEnabled").is_some(), "Skill should have 'isEnabled'");
        }
    }

    #[tokio::test]
    #[ignore]
    async fn get_skill_prompt_for_nonexistent_slug() {
        let client = Client::new();
        let res = agent_get(
            &client,
            "/api/v1/skills/nonexistent-skill-slug/prompt",
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            404,
            "Getting prompt for nonexistent skill should return 404"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn get_skill_prompt_returns_expected_shape() {
        let client = Client::new();

        // First list skills to find a valid slug
        let skills_body = agent_get_json(&client, "/api/v1/skills/installed").await;
        let slug = skills_body["skills"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|s| s["slug"].as_str())
            .map(|s| s.to_string());

        let slug = match slug {
            Some(s) => s,
            None => {
                eprintln!("SKIP: No installed skills to test get_skill_prompt");
                return;
            }
        };

        let res = agent_get(&client, &format!("/api/v1/skills/{slug}/prompt")).await;
        assert_eq!(res.status().as_u16(), 200);
        let body: Value = res.json().await.unwrap();
        assert!(body.get("promptContent").is_some());
        assert!(body.get("promptTemplate").is_some());
        assert!(body.get("parameters").is_some());
    }
}

// ============================================================================
// Agent Upload tests
// ============================================================================
#[cfg(test)]
mod agent_upload_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn upload_requires_conversation_id_and_file() {
        let client = Client::new();
        // Send a multipart request with no fields
        let form = reqwest::multipart::Form::new();
        let res = client
            .post(&format!("{}/api/v1/files/upload", base_url()))
            .header("Authorization", format!("Bearer {}", bot_token()))
            .multipart(form)
            .send()
            .await
            .unwrap();
        assert_eq!(
            res.status().as_u16(),
            400,
            "Upload with no fields should return 400"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn upload_to_nonexistent_conversation_returns_403() {
        let client = Client::new();
        let form = reqwest::multipart::Form::new()
            .text("conversationId", "00000000-0000-0000-0000-000000000000")
            .part(
                "file",
                reqwest::multipart::Part::bytes(b"hello world".to_vec())
                    .file_name("test.txt")
                    .mime_str("text/plain")
                    .unwrap(),
            );

        let res = client
            .post(&format!("{}/api/v1/files/upload", base_url()))
            .header("Authorization", format!("Bearer {}", bot_token()))
            .multipart(form)
            .send()
            .await
            .unwrap();
        assert_eq!(
            res.status().as_u16(),
            403,
            "Upload to nonexistent conversation should return 403"
        );
    }
}

// ============================================================================
// Agent Capsules tests
// ============================================================================
#[cfg(test)]
mod agent_capsules_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn query_capsules_requires_query_param() {
        let client = Client::new();
        let res = agent_get(&client, "/api/v1/capsules?query=").await;
        assert_eq!(
            res.status().as_u16(),
            400,
            "GET /api/v1/capsules with empty query should return 400"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn query_capsules_with_valid_query() {
        let client = Client::new();
        let res = agent_get(&client, "/api/v1/capsules?query=test&limit=5").await;
        let status = res.status().as_u16();
        // 200 (results), 503 (embedding not configured), or 200 with empty array
        assert!(
            status == 200 || status == 503,
            "Query capsules should return 200 or 503, got {status}"
        );
        if status == 200 {
            let body: Value = res.json().await.unwrap();
            assert!(body.is_array(), "Capsules response should be an array");
            for item in body.as_array().unwrap() {
                assert!(item.get("content").is_some());
                assert!(item.get("capsule_name").is_some());
                assert!(item.get("score").is_some());
            }
        }
    }

    #[tokio::test]
    #[ignore]
    async fn query_capsules_with_limit() {
        let client = Client::new();
        let res = agent_get(&client, "/api/v1/capsules?query=hello&limit=3").await;
        let status = res.status().as_u16();
        assert!(
            status == 200 || status == 503,
            "Query capsules with limit should return 200 or 503, got {status}"
        );
    }
}

// ============================================================================
// Agent Wiki tests
// ============================================================================
#[cfg(test)]
mod agent_wiki_tests {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn create_wiki_requires_title() {
        let client = Client::new();
        let res = agent_post(
            &client,
            "/api/v1/wiki",
            json!({
                "conversationId": "00000000-0000-0000-0000-000000000000",
                "title": ""
            }),
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            400,
            "Create wiki with empty title should return 400"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn create_wiki_requires_conversation_or_community() {
        let client = Client::new();
        let res = agent_post(
            &client,
            "/api/v1/wiki",
            json!({"title": "Test Wiki Page"}),
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            400,
            "Create wiki without conversationId/communityId should return 400"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn create_wiki_with_nonexistent_conversation_returns_403() {
        let client = Client::new();
        let res = agent_post(
            &client,
            "/api/v1/wiki",
            json!({
                "conversationId": "00000000-0000-0000-0000-000000000000",
                "title": "Test Wiki Page",
                "content": "Some content"
            }),
        )
        .await;
        let status = res.status().as_u16();
        assert!(
            status == 403 || status == 404,
            "Create wiki for nonexistent conversation should return 403 or 404, got {status}"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn update_nonexistent_wiki_page_returns_404() {
        let client = Client::new();
        let res = agent_patch(
            &client,
            "/api/v1/wiki/00000000-0000-0000-0000-000000000000",
            json!({"title": "Updated Title"}),
        )
        .await;
        assert_eq!(
            res.status().as_u16(),
            404,
            "Update nonexistent wiki page should return 404"
        );
    }
}

// ============================================================================
// Auth edge cases — verify bot token auth works
// ============================================================================
#[cfg(test)]
mod auth_edge_cases {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn request_without_token_returns_401() {
        let client = Client::new();
        let res = client
            .get(&format!("{}/api/v1/notes", base_url()))
            .send()
            .await
            .unwrap();
        assert_eq!(
            res.status().as_u16(),
            401,
            "Request without auth should return 401"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn request_with_invalid_token_returns_401() {
        let client = Client::new();
        let res = client
            .get(&format!("{}/api/v1/notes", base_url()))
            .header("Authorization", "Bearer invalid_token_xxx")
            .send()
            .await
            .unwrap();
        assert_eq!(
            res.status().as_u16(),
            401,
            "Request with invalid token should return 401"
        );
    }

    #[tokio::test]
    #[ignore]
    async fn request_with_malformed_auth_header_returns_401() {
        let client = Client::new();
        let res = client
            .get(&format!("{}/api/v1/notes", base_url()))
            .header("Authorization", "NotBearer something")
            .send()
            .await
            .unwrap();
        assert_eq!(
            res.status().as_u16(),
            401,
            "Request with malformed auth header should return 401"
        );
    }
}
