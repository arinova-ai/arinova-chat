use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, patch, post},
    Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::middleware::{AuthAgent, AuthUser};
use crate::ws::handler::trigger_agent_response;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // User API
        .route("/api/kanban/boards", get(list_boards).post(create_board))
        .route("/api/kanban/boards/{id}", get(get_board).patch(update_board))
        .route("/api/kanban/boards/{id}/archive", post(archive_board))
        .route("/api/kanban/boards/{id}/columns", get(list_columns).post(create_column))
        .route("/api/kanban/columns/{id}", patch(update_column).delete(delete_column))
        .route("/api/kanban/boards/{id}/columns/reorder", post(reorder_columns))
        .route(
            "/api/kanban/boards/{id}/archived-cards",
            get(list_archived_cards),
        )
        .route("/api/kanban/cards", post(create_card))
        .route("/api/kanban/cards/{id}", patch(update_card).delete(delete_card))
        .route("/api/kanban/cards/{id}/agents", post(assign_agent))
        .route(
            "/api/kanban/cards/{card_id}/agents/{agent_id}",
            delete(unassign_agent),
        )
        .route("/api/kanban/cards/{id}/share", post(share_card))
        .route(
            "/api/kanban/cards/{cardId}/share-to/{conversationId}",
            post(share_card_to_conversation),
        )
        .route(
            "/api/kanban/cards/{id}/public-share",
            post(create_card_public_share).delete(revoke_card_public_share),
        )
        .route("/api/public/cards/{shareToken}", get(get_public_card))
        .route("/api/kanban/cards/{id}/archive", post(archive_card))
        .route("/api/kanban/cards/{id}/unarchive", post(unarchive_card))
        .route(
            "/api/kanban/cards/{id}/notes",
            get(list_card_notes).post(link_note_to_card),
        )
        .route(
            "/api/kanban/cards/{card_id}/notes/{note_id}",
            delete(unlink_note_from_card),
        )
        .route(
            "/api/kanban/cards/{cardId}/commits",
            get(list_card_commits).post(add_card_commit),
        )
        .route(
            "/api/kanban/cards/{cardId}/commits/{commitHash}",
            delete(delete_card_commit),
        )
        // Agent API
        .route("/api/agent/kanban/boards", get(agent_list_boards).post(agent_create_board))
        .route("/api/agent/kanban/boards/{id}", patch(agent_update_board))
        .route("/api/agent/kanban/boards/{id}/archive", post(agent_archive_board))
        .route("/api/agent/kanban/boards/{id}/columns", get(agent_list_columns).post(agent_create_column))
        .route("/api/agent/kanban/columns/{id}", patch(agent_update_column).delete(agent_delete_column))
        .route("/api/agent/kanban/boards/{id}/columns/reorder", post(agent_reorder_columns))
        .route("/api/agent/kanban/cards", get(agent_list_cards).post(agent_create_card))
        .route("/api/agent/kanban/cards/{id}", patch(agent_update_card))
        .route("/api/agent/kanban/cards/{id}/complete", post(agent_complete_card))
        .route(
            "/api/agent/kanban/boards/{id}/archived-cards",
            get(agent_list_archived_cards),
        )
        .route(
            "/api/agent/kanban/cards/{cardId}/commits",
            get(agent_list_card_commits).post(agent_add_card_commit),
        )
        // User notes lookup (for note selector in card detail)
        .route("/api/kanban/owner-notes", get(list_owner_notes))
}

// ── Types ─────────────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct BoardRow {
    id: Uuid,
    name: String,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ColumnRow {
    id: Uuid,
    board_id: Uuid,
    name: String,
    sort_order: i32,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct CardRow {
    id: Uuid,
    column_id: Uuid,
    title: String,
    description: Option<String>,
    priority: Option<String>,
    due_date: Option<chrono::DateTime<chrono::Utc>>,
    sort_order: i32,
    created_by: Option<String>,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
    updated_at: Option<chrono::DateTime<chrono::Utc>>,
    share_token: Option<String>,
    is_public: bool,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct CardAgentRow {
    card_id: Uuid,
    agent_id: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct CardNoteRow {
    card_id: Uuid,
    note_id: Uuid,
    note_title: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct CardCommitRow {
    card_id: Uuid,
    commit_hash: String,
    message: Option<String>,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateCardBody {
    board_id: Uuid,
    column_id: Uuid,
    title: String,
    description: Option<String>,
    priority: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateCardBody {
    title: Option<String>,
    description: Option<String>,
    priority: Option<String>,
    column_id: Option<Uuid>,
    sort_order: Option<i32>,
}

impl UpdateCardBody {
    fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.description.is_none()
            && self.priority.is_none()
            && self.column_id.is_none()
            && self.sort_order.is_none()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssignAgentBody {
    agent_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentCreateCardBody {
    title: String,
    description: Option<String>,
    priority: Option<String>,
    column_name: Option<String>,
    column_id: Option<Uuid>,
    board_id: Option<Uuid>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ArchivedCardRow {
    id: Uuid,
    column_id: Uuid,
    title: String,
    description: Option<String>,
    priority: Option<String>,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
    updated_at: Option<chrono::DateTime<chrono::Utc>>,
    archived_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
struct PaginationQuery {
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateBoardBody {
    name: String,
    columns: Option<Vec<CreateColumnInput>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateColumnInput {
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateBoardBody {
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateColumnBody {
    name: String,
    sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateColumnBody {
    name: Option<String>,
    sort_order: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeleteColumnQuery {
    move_to_column_id: Option<Uuid>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReorderColumnsBody {
    column_ids: Vec<Uuid>,
}

// ── Helpers ───────────────────────────────────────────────────

/// Ensure the user has at least one board; if not, create a default one.
async fn ensure_default_board(db: &sqlx::PgPool, owner_id: &str) -> Result<Uuid, Response> {
    let existing = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM kanban_boards WHERE owner_id = $1 LIMIT 1",
    )
    .bind(owner_id)
    .fetch_optional(db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response()
    })?;

    if let Some(board_id) = existing {
        return Ok(board_id);
    }

    // Create default board + 5 columns
    let board_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO kanban_boards (owner_id, name) VALUES ($1, 'My Board') RETURNING id",
    )
    .bind(owner_id)
    .fetch_one(db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response()
    })?;

    for (name, order) in [("Backlog", 0), ("To Do", 1), ("In Progress", 2), ("Review", 3), ("Done", 4)] {
        sqlx::query(
            "INSERT INTO kanban_columns (board_id, name, sort_order) VALUES ($1, $2, $3)",
        )
        .bind(board_id)
        .bind(name)
        .bind(order)
        .execute(db)
        .await
        .map_err(|e| {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
                .into_response()
        })?;
    }

    Ok(board_id)
}

/// Check that a board belongs to the given user. Returns board_id if valid.
async fn verify_board_owner(
    db: &sqlx::PgPool,
    board_id: Uuid,
    owner_id: &str,
) -> Result<(), Response> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM kanban_boards WHERE id = $1 AND owner_id = $2)",
    )
    .bind(board_id)
    .bind(owner_id)
    .fetch_one(db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response()
    })?;

    if !exists {
        return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "Board not found" })))
            .into_response());
    }
    Ok(())
}

/// Check that a card belongs to the given user (through board ownership).
async fn verify_card_owner(
    db: &sqlx::PgPool,
    card_id: Uuid,
    owner_id: &str,
) -> Result<(), Response> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM kanban_cards c
            JOIN kanban_columns col ON col.id = c.column_id
            JOIN kanban_boards b ON b.id = col.board_id
            WHERE c.id = $1 AND b.owner_id = $2
        )"#,
    )
    .bind(card_id)
    .bind(owner_id)
    .fetch_one(db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response()
    })?;

    if !exists {
        return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "Card not found" })))
            .into_response());
    }
    Ok(())
}

/// Check that a column belongs to the given user (through board ownership).
async fn verify_column_owner(
    db: &sqlx::PgPool,
    column_id: Uuid,
    owner_id: &str,
) -> Result<(), Response> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM kanban_columns col
            JOIN kanban_boards b ON b.id = col.board_id
            WHERE col.id = $1 AND b.owner_id = $2
        )"#,
    )
    .bind(column_id)
    .bind(owner_id)
    .fetch_one(db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response()
    })?;

    if !exists {
        return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "Column not found" })))
            .into_response());
    }
    Ok(())
}

/// Lazy-archive: mark cards in Done columns as archived if updated_at > 3 days ago.
async fn lazy_archive_done_cards(db: &sqlx::PgPool, board_id: Uuid) {
    let _ = sqlx::query(
        r#"UPDATE kanban_cards SET archived = TRUE, archived_at = NOW()
           WHERE archived = FALSE
             AND column_id IN (
               SELECT id FROM kanban_columns WHERE board_id = $1 AND name = 'Done'
             )
             AND updated_at < NOW() - INTERVAL '3 days'"#,
    )
    .bind(board_id)
    .execute(db)
    .await;
}

/// Lazy-archive across all boards owned by a user.
async fn lazy_archive_done_cards_by_owner(db: &sqlx::PgPool, owner_id: &str) {
    let _ = sqlx::query(
        r#"UPDATE kanban_cards SET archived = TRUE, archived_at = NOW()
           WHERE archived = FALSE
             AND column_id IN (
               SELECT kc.id FROM kanban_columns kc
               JOIN kanban_boards kb ON kb.id = kc.board_id
               WHERE kb.owner_id = $1 AND kc.name = 'Done'
             )
             AND updated_at < NOW() - INTERVAL '3 days'"#,
    )
    .bind(owner_id)
    .execute(db)
    .await;
}

// ── User API ──────────────────────────────────────────────────

/// GET /api/kanban/boards — list user's boards (auto-create default if none)
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ListBoardsQuery {
    #[serde(default)]
    include_archived: Option<bool>,
}

async fn list_boards(
    State(state): State<AppState>,
    user: AuthUser,
    Query(query): Query<ListBoardsQuery>,
) -> Response {
    let _ = ensure_default_board(&state.db, &user.id).await;

    let include_archived = query.include_archived.unwrap_or(false);
    let boards = if include_archived {
        sqlx::query_as::<_, BoardRow>(
            "SELECT id, name, created_at FROM kanban_boards WHERE owner_id = $1 ORDER BY created_at",
        )
        .bind(&user.id)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as::<_, BoardRow>(
            "SELECT id, name, created_at FROM kanban_boards WHERE owner_id = $1 AND archived = false ORDER BY created_at",
        )
        .bind(&user.id)
        .fetch_all(&state.db)
        .await
    };

    match boards {
        Ok(rows) => Json(json!(rows)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// GET /api/kanban/boards/:id — get board with columns, cards, and card agents
async fn get_board(
    State(state): State<AppState>,
    user: AuthUser,
    Path(board_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_board_owner(&state.db, board_id, &user.id).await {
        return e;
    }

    // Lazy-archive Done cards older than 3 days
    lazy_archive_done_cards(&state.db, board_id).await;

    let columns = sqlx::query_as::<_, ColumnRow>(
        "SELECT id, board_id, name, sort_order FROM kanban_columns WHERE board_id = $1 ORDER BY sort_order",
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await;

    let cards = sqlx::query_as::<_, CardRow>(
        r#"SELECT c.id, c.column_id, c.title, c.description, c.priority,
                  c.due_date, c.sort_order, c.created_by, c.created_at, c.updated_at,
                  c.share_token, COALESCE(c.is_public, false) AS is_public
           FROM kanban_cards c
           JOIN kanban_columns col ON col.id = c.column_id
           WHERE col.board_id = $1 AND c.archived = FALSE
           ORDER BY c.sort_order"#,
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await;

    let card_agents = sqlx::query_as::<_, CardAgentRow>(
        r#"SELECT ca.card_id, ca.agent_id
           FROM kanban_card_agents ca
           JOIN kanban_cards c ON c.id = ca.card_id
           JOIN kanban_columns col ON col.id = c.column_id
           WHERE col.board_id = $1"#,
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await;

    let card_notes = sqlx::query_as::<_, CardNoteRow>(
        r#"SELECT cn.card_id, n.id AS note_id, n.title AS note_title
           FROM kanban_card_notes cn
           JOIN conversation_notes n ON n.id = cn.note_id
           JOIN kanban_cards c ON c.id = cn.card_id
           JOIN kanban_columns col ON col.id = c.column_id
           WHERE col.board_id = $1
           ORDER BY cn.created_at"#,
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await;

    let card_commits = sqlx::query_as::<_, CardCommitRow>(
        r#"SELECT cc.card_id, cc.commit_hash, cc.message, cc.created_at
           FROM kanban_card_commits cc
           JOIN kanban_cards c ON c.id = cc.card_id
           JOIN kanban_columns col ON col.id = c.column_id
           WHERE col.board_id = $1
           ORDER BY cc.created_at DESC"#,
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await;

    match (columns, cards, card_agents, card_notes, card_commits) {
        (Ok(cols), Ok(crds), Ok(agents), Ok(notes), Ok(commits)) => Json(json!({
            "id": board_id,
            "columns": cols,
            "cards": crds,
            "cardAgents": agents,
            "cardNotes": notes,
            "cardCommits": commits,
        }))
        .into_response(),
        _ => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Failed to fetch board" })))
            .into_response(),
    }
}

/// POST /api/kanban/boards
async fn create_board(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateBoardBody>,
) -> Response {
    let board_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO kanban_boards (owner_id, name) VALUES ($1, $2) RETURNING id",
    )
    .bind(&user.id)
    .bind(&body.name)
    .fetch_one(&state.db)
    .await;

    let board_id = match board_id {
        Ok(id) => id,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    if let Some(cols) = &body.columns {
        for (i, col) in cols.iter().enumerate() {
            let _ = sqlx::query(
                "INSERT INTO kanban_columns (board_id, name, sort_order) VALUES ($1, $2, $3)",
            )
            .bind(board_id)
            .bind(&col.name)
            .bind(i as i32)
            .execute(&state.db)
            .await;
        }
    } else {
        // No columns provided — create default 5 columns (same as ensure_default_board)
        for (name, order) in [("Backlog", 0), ("To Do", 1), ("In Progress", 2), ("Review", 3), ("Done", 4)] {
            let _ = sqlx::query(
                "INSERT INTO kanban_columns (board_id, name, sort_order) VALUES ($1, $2, $3)",
            )
            .bind(board_id)
            .bind(name)
            .bind(order)
            .execute(&state.db)
            .await;
        }
    }

    let board = sqlx::query_as::<_, BoardRow>(
        "SELECT id, name, created_at FROM kanban_boards WHERE id = $1",
    )
    .bind(board_id)
    .fetch_one(&state.db)
    .await;

    match board {
        Ok(b) => (StatusCode::CREATED, Json(json!(b))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// PATCH /api/kanban/boards/:id
async fn update_board(
    State(state): State<AppState>,
    user: AuthUser,
    Path(board_id): Path<Uuid>,
    Json(body): Json<UpdateBoardBody>,
) -> Response {
    if let Err(e) = verify_board_owner(&state.db, board_id, &user.id).await {
        return e;
    }

    let result = sqlx::query("UPDATE kanban_boards SET name = $1 WHERE id = $2")
        .bind(&body.name)
        .bind(board_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => Json(json!({ "ok": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// DELETE /api/kanban/boards/:id
/// POST /api/kanban/boards/:id/archive — toggle archived state
async fn archive_board(
    State(state): State<AppState>,
    user: AuthUser,
    Path(board_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_board_owner(&state.db, board_id, &user.id).await {
        return e;
    }

    // Check current archived state
    let current_archived = sqlx::query_scalar::<_, bool>(
        "SELECT archived FROM kanban_boards WHERE id = $1",
    )
    .bind(board_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    // If archiving (not unarchiving), check that it's not the last non-archived board
    if !current_archived {
        let non_archived_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM kanban_boards WHERE owner_id = $1 AND archived = false",
        )
        .bind(&user.id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

        if non_archived_count <= 1 {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Cannot archive the last board" }))).into_response();
        }
    }

    let new_archived = !current_archived;

    if let Err(e) = sqlx::query("UPDATE kanban_boards SET archived = $1 WHERE id = $2")
        .bind(new_archived)
        .bind(board_id)
        .execute(&state.db)
        .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
    }

    // If archiving, clear kanban_board_id references in conversation settings
    if new_archived {
        let _ = sqlx::query(
            "UPDATE conversation_user_settings SET kanban_board_id = NULL WHERE kanban_board_id = $1",
        )
        .bind(board_id)
        .execute(&state.db)
        .await;
    }

    Json(json!({ "ok": true, "archived": new_archived })).into_response()
}

/// GET /api/kanban/boards/:id/columns
async fn list_columns(
    State(state): State<AppState>,
    user: AuthUser,
    Path(board_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_board_owner(&state.db, board_id, &user.id).await {
        return e;
    }

    let cols = sqlx::query_as::<_, ColumnRow>(
        "SELECT id, board_id, name, sort_order FROM kanban_columns WHERE board_id = $1 ORDER BY sort_order",
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await;

    match cols {
        Ok(rows) => Json(json!(rows)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// POST /api/kanban/boards/:id/columns
async fn create_column(
    State(state): State<AppState>,
    user: AuthUser,
    Path(board_id): Path<Uuid>,
    Json(body): Json<CreateColumnBody>,
) -> Response {
    if let Err(e) = verify_board_owner(&state.db, board_id, &user.id).await {
        return e;
    }

    let sort_order = if let Some(order) = body.sort_order {
        order
    } else {
        sqlx::query_scalar::<_, i32>(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM kanban_columns WHERE board_id = $1",
        )
        .bind(board_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0)
    };

    let col = sqlx::query_as::<_, ColumnRow>(
        "INSERT INTO kanban_columns (board_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id, board_id, name, sort_order",
    )
    .bind(board_id)
    .bind(&body.name)
    .bind(sort_order)
    .fetch_one(&state.db)
    .await;

    match col {
        Ok(c) => (StatusCode::CREATED, Json(json!(c))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// PATCH /api/kanban/columns/:id
async fn update_column(
    State(state): State<AppState>,
    user: AuthUser,
    Path(column_id): Path<Uuid>,
    Json(body): Json<UpdateColumnBody>,
) -> Response {
    if let Err(e) = verify_column_owner(&state.db, column_id, &user.id).await {
        return e;
    }

    if body.name.is_none() && body.sort_order.is_none() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Nothing to update" }))).into_response();
    }

    let result = sqlx::query(
        r#"UPDATE kanban_columns SET
            name = COALESCE($1, name),
            sort_order = COALESCE($2, sort_order)
        WHERE id = $3"#,
    )
    .bind(&body.name)
    .bind(body.sort_order)
    .bind(column_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({ "ok": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// DELETE /api/kanban/columns/:id
async fn delete_column(
    State(state): State<AppState>,
    user: AuthUser,
    Path(column_id): Path<Uuid>,
    Query(query): Query<DeleteColumnQuery>,
) -> Response {
    if let Err(e) = verify_column_owner(&state.db, column_id, &user.id).await {
        return e;
    }

    if let Some(target_id) = query.move_to_column_id {
        if target_id == column_id {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Cannot move cards to the same column" }))).into_response();
        }
        // Verify target column belongs to same board and same owner
        let same_board = sqlx::query_scalar::<_, bool>(
            r#"SELECT EXISTS(
                SELECT 1 FROM kanban_columns t
                JOIN kanban_columns s ON s.id = $1
                JOIN kanban_boards b ON b.id = t.board_id
                WHERE t.id = $2 AND t.board_id = s.board_id AND b.owner_id = $3
            )"#,
        )
        .bind(column_id)
        .bind(target_id)
        .bind(&user.id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);
        if !same_board {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Target column not found on same board" }))).into_response();
        }
        if let Err(e) = sqlx::query("UPDATE kanban_cards SET column_id = $1 WHERE column_id = $2")
            .bind(target_id)
            .bind(column_id)
            .execute(&state.db)
            .await
        {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
        }
    } else {
        // Delete cards (and their relations) in this column
        let _ = sqlx::query(
            "DELETE FROM kanban_card_agents WHERE card_id IN (SELECT id FROM kanban_cards WHERE column_id = $1)",
        ).bind(column_id).execute(&state.db).await;
        let _ = sqlx::query(
            "DELETE FROM kanban_card_notes WHERE card_id IN (SELECT id FROM kanban_cards WHERE column_id = $1)",
        ).bind(column_id).execute(&state.db).await;
        let _ = sqlx::query(
            "DELETE FROM kanban_card_commits WHERE card_id IN (SELECT id FROM kanban_cards WHERE column_id = $1)",
        ).bind(column_id).execute(&state.db).await;
        let _ = sqlx::query("DELETE FROM kanban_cards WHERE column_id = $1")
            .bind(column_id).execute(&state.db).await;
    }

    let result = sqlx::query("DELETE FROM kanban_columns WHERE id = $1")
        .bind(column_id).execute(&state.db).await;

    match result {
        Ok(_) => Json(json!({ "ok": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// POST /api/kanban/boards/:id/columns/reorder
async fn reorder_columns(
    State(state): State<AppState>,
    user: AuthUser,
    Path(board_id): Path<Uuid>,
    Json(body): Json<ReorderColumnsBody>,
) -> Response {
    if let Err(e) = verify_board_owner(&state.db, board_id, &user.id).await {
        return e;
    }

    // Validate: request set must match DB set exactly (no duplicates, no missing)
    let db_ids = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM kanban_columns WHERE board_id = $1 ORDER BY sort_order",
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let mut req_sorted = body.column_ids.clone();
    req_sorted.sort();
    req_sorted.dedup();
    let mut db_sorted = db_ids.clone();
    db_sorted.sort();
    if req_sorted != db_sorted {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "columnIds must contain exactly all columns of this board with no duplicates" }))).into_response();
    }

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    for (i, col_id) in body.column_ids.iter().enumerate() {
        if let Err(e) = sqlx::query("UPDATE kanban_columns SET sort_order = $1 WHERE id = $2 AND board_id = $3")
            .bind(i as i32)
            .bind(col_id)
            .bind(board_id)
            .execute(&mut *tx)
            .await
        {
            let _ = tx.rollback().await;
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
        }
    }
    if let Err(e) = tx.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
    }

    Json(json!({ "ok": true })).into_response()
}

/// POST /api/kanban/cards — create a new card
async fn create_card(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateCardBody>,
) -> Response {
    if let Err(e) = verify_board_owner(&state.db, body.board_id, &user.id).await {
        return e;
    }

    // Verify column belongs to the board
    let col_ok = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM kanban_columns WHERE id = $1 AND board_id = $2)",
    )
    .bind(body.column_id)
    .bind(body.board_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !col_ok {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Column does not belong to this board" })))
            .into_response();
    }

    // Get max sort_order in the target column
    let max_order = sqlx::query_scalar::<_, Option<i32>>(
        "SELECT MAX(sort_order) FROM kanban_cards WHERE column_id = $1",
    )
    .bind(body.column_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(None)
    .unwrap_or(-1);

    let result = sqlx::query_as::<_, CardRow>(
        r#"INSERT INTO kanban_cards (column_id, title, description, priority, sort_order, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, column_id, title, description, priority, due_date, sort_order, created_by, created_at, updated_at, share_token, COALESCE(is_public, false) AS is_public"#,
    )
    .bind(body.column_id)
    .bind(&body.title)
    .bind(&body.description)
    .bind(body.priority.as_deref().unwrap_or("medium"))
    .bind(max_order + 1)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(card) => (StatusCode::CREATED, Json(json!(card))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// PATCH /api/kanban/cards/:id — update a card
async fn update_card(
    State(state): State<AppState>,
    user: AuthUser,
    Path(card_id): Path<Uuid>,
    Json(body): Json<UpdateCardBody>,
) -> Response {
    if body.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "No fields to update" })))
            .into_response();
    }

    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    // If moving to a different column, verify the target column belongs to the same board
    if let Some(target_col) = body.column_id {
        let same_board = sqlx::query_scalar::<_, bool>(
            r#"SELECT EXISTS(
                SELECT 1 FROM kanban_columns target
                JOIN kanban_cards c ON c.id = $1
                JOIN kanban_columns cur ON cur.id = c.column_id
                WHERE target.id = $2 AND target.board_id = cur.board_id
            )"#,
        )
        .bind(card_id)
        .bind(target_col)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);

        if !same_board {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Target column does not belong to the same board" })))
                .into_response();
        }
    }

    let result = sqlx::query(
        r#"UPDATE kanban_cards SET
             title = COALESCE($2, title),
             description = COALESCE($3, description),
             priority = COALESCE($4, priority),
             column_id = COALESCE($5, column_id),
             sort_order = COALESCE($6, sort_order),
             updated_at = NOW()
           WHERE id = $1"#,
    )
    .bind(card_id)
    .bind(&body.title)
    .bind(&body.description)
    .bind(&body.priority)
    .bind(body.column_id)
    .bind(body.sort_order)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({ "ok": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// DELETE /api/kanban/cards/:id — delete a card
async fn delete_card(
    State(state): State<AppState>,
    user: AuthUser,
    Path(card_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    let result = sqlx::query("DELETE FROM kanban_cards WHERE id = $1")
        .bind(card_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => Json(json!({ "ok": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// POST /api/kanban/cards/:id/agents — assign an agent to a card
async fn assign_agent(
    State(state): State<AppState>,
    user: AuthUser,
    Path(card_id): Path<Uuid>,
    Json(body): Json<AssignAgentBody>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    let result = sqlx::query(
        "INSERT INTO kanban_card_agents (card_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(card_id)
    .bind(&body.agent_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::CREATED, Json(json!({ "ok": true }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// DELETE /api/kanban/cards/:card_id/agents/:agent_id — remove agent from card
async fn unassign_agent(
    State(state): State<AppState>,
    user: AuthUser,
    Path((card_id, agent_id)): Path<(Uuid, String)>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    let result = sqlx::query("DELETE FROM kanban_card_agents WHERE card_id = $1 AND agent_id = $2")
        .bind(card_id)
        .bind(&agent_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => Json(json!({ "ok": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

// ── Agent API ─────────────────────────────────────────────────

/// Find the owner_id for a given agent (via agents table).
async fn agent_owner_id(db: &sqlx::PgPool, agent_id: Uuid) -> Result<String, Response> {
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM agents WHERE id = $1",
    )
    .bind(agent_id)
    .fetch_optional(db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response()
    })?;

    owner.ok_or_else(|| {
        (StatusCode::NOT_FOUND, Json(json!({ "error": "Agent owner not found" }))).into_response()
    })
}

/// GET /api/agent/kanban/boards — list owner's boards (auto-create default if none)
async fn agent_list_boards(
    State(state): State<AppState>,
    agent: AuthAgent,
    Query(query): Query<ListBoardsQuery>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };

    let _ = ensure_default_board(&state.db, &owner_id).await;

    let include_archived = query.include_archived.unwrap_or(false);
    let boards = if include_archived {
        sqlx::query_as::<_, BoardRow>(
            "SELECT id, name, created_at FROM kanban_boards WHERE owner_id = $1 ORDER BY created_at",
        )
        .bind(&owner_id)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as::<_, BoardRow>(
            "SELECT id, name, created_at FROM kanban_boards WHERE owner_id = $1 AND archived = false ORDER BY created_at",
        )
        .bind(&owner_id)
        .fetch_all(&state.db)
        .await
    };

    let boards = match boards {
        Ok(rows) => rows,
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
                .into_response()
        }
    };

    let board_ids: Vec<Uuid> = boards.iter().map(|b| b.id).collect();
    let col_rows = sqlx::query(
        "SELECT id, board_id, name, sort_order FROM kanban_columns WHERE board_id = ANY($1) ORDER BY sort_order",
    )
    .bind(&board_ids)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let mut col_map: std::collections::HashMap<Uuid, Vec<serde_json::Value>> =
        std::collections::HashMap::new();
    for row in &col_rows {
        use sqlx::Row;
        let board_id: Uuid = row.get("board_id");
        let col = json!({
            "id": row.get::<Uuid, _>("id"),
            "name": row.get::<String, _>("name"),
            "sortOrder": row.get::<i32, _>("sort_order"),
        });
        col_map.entry(board_id).or_default().push(col);
    }

    let result: Vec<serde_json::Value> = boards
        .iter()
        .map(|b| {
            json!({
                "id": b.id,
                "name": b.name,
                "createdAt": b.created_at,
                "columns": col_map.get(&b.id).cloned().unwrap_or_default(),
            })
        })
        .collect();

    Json(json!(result)).into_response()
}

/// POST /api/agent/kanban/boards
async fn agent_create_board(
    State(state): State<AppState>,
    agent: AuthAgent,
    Json(body): Json<CreateBoardBody>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };

    let board_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO kanban_boards (owner_id, name) VALUES ($1, $2) RETURNING id",
    )
    .bind(&owner_id)
    .bind(&body.name)
    .fetch_one(&state.db)
    .await;

    let board_id = match board_id {
        Ok(id) => id,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    if let Some(cols) = &body.columns {
        for (i, col) in cols.iter().enumerate() {
            let _ = sqlx::query(
                "INSERT INTO kanban_columns (board_id, name, sort_order) VALUES ($1, $2, $3)",
            )
            .bind(board_id)
            .bind(&col.name)
            .bind(i as i32)
            .execute(&state.db)
            .await;
        }
    } else {
        // No columns provided — create default 5 columns (same as ensure_default_board)
        for (name, order) in [("Backlog", 0), ("To Do", 1), ("In Progress", 2), ("Review", 3), ("Done", 4)] {
            let _ = sqlx::query(
                "INSERT INTO kanban_columns (board_id, name, sort_order) VALUES ($1, $2, $3)",
            )
            .bind(board_id)
            .bind(name)
            .bind(order)
            .execute(&state.db)
            .await;
        }
    }

    let board = sqlx::query_as::<_, BoardRow>(
        "SELECT id, name, created_at FROM kanban_boards WHERE id = $1",
    )
    .bind(board_id)
    .fetch_one(&state.db)
    .await;

    match board {
        Ok(b) => (StatusCode::CREATED, Json(json!(b))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// PATCH /api/agent/kanban/boards/:id
async fn agent_update_board(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(board_id): Path<Uuid>,
    Json(body): Json<UpdateBoardBody>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_board_owner(&state.db, board_id, &owner_id).await {
        return e;
    }

    let result = sqlx::query("UPDATE kanban_boards SET name = $1 WHERE id = $2")
        .bind(&body.name)
        .bind(board_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => Json(json!({ "ok": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// DELETE /api/agent/kanban/boards/:id
/// POST /api/agent/kanban/boards/:id/archive — toggle archived state
async fn agent_archive_board(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(board_id): Path<Uuid>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_board_owner(&state.db, board_id, &owner_id).await {
        return e;
    }

    let current_archived = sqlx::query_scalar::<_, bool>(
        "SELECT archived FROM kanban_boards WHERE id = $1",
    )
    .bind(board_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !current_archived {
        let non_archived_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM kanban_boards WHERE owner_id = $1 AND archived = false",
        )
        .bind(&owner_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

        if non_archived_count <= 1 {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Cannot archive the last board" }))).into_response();
        }
    }

    let new_archived = !current_archived;

    if let Err(e) = sqlx::query("UPDATE kanban_boards SET archived = $1 WHERE id = $2")
        .bind(new_archived)
        .bind(board_id)
        .execute(&state.db)
        .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
    }

    if new_archived {
        let _ = sqlx::query(
            "UPDATE conversation_user_settings SET kanban_board_id = NULL WHERE kanban_board_id = $1",
        )
        .bind(board_id)
        .execute(&state.db)
        .await;
    }

    Json(json!({ "ok": true, "archived": new_archived })).into_response()
}

/// GET /api/agent/kanban/boards/:id/columns
async fn agent_list_columns(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(board_id): Path<Uuid>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_board_owner(&state.db, board_id, &owner_id).await {
        return e;
    }

    let cols = sqlx::query_as::<_, ColumnRow>(
        "SELECT id, board_id, name, sort_order FROM kanban_columns WHERE board_id = $1 ORDER BY sort_order",
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await;

    match cols {
        Ok(rows) => Json(json!(rows)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// POST /api/agent/kanban/boards/:id/columns
async fn agent_create_column(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(board_id): Path<Uuid>,
    Json(body): Json<CreateColumnBody>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_board_owner(&state.db, board_id, &owner_id).await {
        return e;
    }

    let sort_order = if let Some(order) = body.sort_order {
        order
    } else {
        sqlx::query_scalar::<_, i32>(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM kanban_columns WHERE board_id = $1",
        )
        .bind(board_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0)
    };

    let col = sqlx::query_as::<_, ColumnRow>(
        "INSERT INTO kanban_columns (board_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id, board_id, name, sort_order",
    )
    .bind(board_id)
    .bind(&body.name)
    .bind(sort_order)
    .fetch_one(&state.db)
    .await;

    match col {
        Ok(c) => (StatusCode::CREATED, Json(json!(c))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// PATCH /api/agent/kanban/columns/:id
async fn agent_update_column(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(column_id): Path<Uuid>,
    Json(body): Json<UpdateColumnBody>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_column_owner(&state.db, column_id, &owner_id).await {
        return e;
    }

    if body.name.is_none() && body.sort_order.is_none() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Nothing to update" }))).into_response();
    }

    let result = sqlx::query(
        r#"UPDATE kanban_columns SET
            name = COALESCE($1, name),
            sort_order = COALESCE($2, sort_order)
        WHERE id = $3"#,
    )
    .bind(&body.name)
    .bind(body.sort_order)
    .bind(column_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({ "ok": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// DELETE /api/agent/kanban/columns/:id
async fn agent_delete_column(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(column_id): Path<Uuid>,
    Query(query): Query<DeleteColumnQuery>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_column_owner(&state.db, column_id, &owner_id).await {
        return e;
    }

    if let Some(target_id) = query.move_to_column_id {
        if target_id == column_id {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Cannot move cards to the same column" }))).into_response();
        }
        let same_board = sqlx::query_scalar::<_, bool>(
            r#"SELECT EXISTS(
                SELECT 1 FROM kanban_columns t
                JOIN kanban_columns s ON s.id = $1
                JOIN kanban_boards b ON b.id = t.board_id
                WHERE t.id = $2 AND t.board_id = s.board_id AND b.owner_id = $3
            )"#,
        )
        .bind(column_id)
        .bind(target_id)
        .bind(&owner_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);
        if !same_board {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Target column not found on same board" }))).into_response();
        }
        if let Err(e) = sqlx::query("UPDATE kanban_cards SET column_id = $1 WHERE column_id = $2")
            .bind(target_id)
            .bind(column_id)
            .execute(&state.db)
            .await
        {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
        }
    } else {
        let _ = sqlx::query(
            "DELETE FROM kanban_card_agents WHERE card_id IN (SELECT id FROM kanban_cards WHERE column_id = $1)",
        ).bind(column_id).execute(&state.db).await;
        let _ = sqlx::query(
            "DELETE FROM kanban_card_notes WHERE card_id IN (SELECT id FROM kanban_cards WHERE column_id = $1)",
        ).bind(column_id).execute(&state.db).await;
        let _ = sqlx::query(
            "DELETE FROM kanban_card_commits WHERE card_id IN (SELECT id FROM kanban_cards WHERE column_id = $1)",
        ).bind(column_id).execute(&state.db).await;
        let _ = sqlx::query("DELETE FROM kanban_cards WHERE column_id = $1")
            .bind(column_id).execute(&state.db).await;
    }

    let result = sqlx::query("DELETE FROM kanban_columns WHERE id = $1")
        .bind(column_id).execute(&state.db).await;

    match result {
        Ok(_) => Json(json!({ "ok": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// POST /api/agent/kanban/boards/:id/columns/reorder
async fn agent_reorder_columns(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(board_id): Path<Uuid>,
    Json(body): Json<ReorderColumnsBody>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_board_owner(&state.db, board_id, &owner_id).await {
        return e;
    }

    // Validate: request set must match DB set exactly
    let db_ids = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM kanban_columns WHERE board_id = $1 ORDER BY sort_order",
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let mut req_sorted = body.column_ids.clone();
    req_sorted.sort();
    req_sorted.dedup();
    let mut db_sorted = db_ids.clone();
    db_sorted.sort();
    if req_sorted != db_sorted {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "columnIds must contain exactly all columns of this board with no duplicates" }))).into_response();
    }

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };
    for (i, col_id) in body.column_ids.iter().enumerate() {
        if let Err(e) = sqlx::query("UPDATE kanban_columns SET sort_order = $1 WHERE id = $2 AND board_id = $3")
            .bind(i as i32)
            .bind(col_id)
            .bind(board_id)
            .execute(&mut *tx)
            .await
        {
            let _ = tx.rollback().await;
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
        }
    }
    if let Err(e) = tx.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
    }

    Json(json!({ "ok": true })).into_response()
}

/// GET /api/agent/kanban/cards — list owner's kanban cards
async fn agent_list_cards(State(state): State<AppState>, agent: AuthAgent) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };

    lazy_archive_done_cards_by_owner(&state.db, &owner_id).await;

    #[derive(Debug, Serialize, sqlx::FromRow)]
    #[serde(rename_all = "camelCase")]
    struct AgentCardRow {
        id: Uuid,
        column_id: Uuid,
        column_name: String,
        title: String,
        description: Option<String>,
        priority: Option<String>,
        due_date: Option<chrono::DateTime<chrono::Utc>>,
        sort_order: i32,
        created_by: Option<String>,
        created_at: Option<chrono::DateTime<chrono::Utc>>,
        updated_at: Option<chrono::DateTime<chrono::Utc>>,
    }

    let cards = sqlx::query_as::<_, AgentCardRow>(
        r#"SELECT c.id, c.column_id, col.name AS column_name, c.title, c.description, c.priority,
                  c.due_date, c.sort_order, c.created_by, c.created_at, c.updated_at
           FROM kanban_cards c
           JOIN kanban_columns col ON col.id = c.column_id
           JOIN kanban_boards b ON b.id = col.board_id
           WHERE b.owner_id = $1 AND c.archived = FALSE
           ORDER BY c.sort_order"#,
    )
    .bind(&owner_id)
    .fetch_all(&state.db)
    .await;

    match cards {
        Ok(rows) => Json(json!(rows)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// POST /api/agent/kanban/cards — create a card on owner's board
async fn agent_create_card(
    State(state): State<AppState>,
    agent: AuthAgent,
    Json(body): Json<AgentCreateCardBody>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };

    let board_id = if let Some(bid) = body.board_id {
        if let Err(e) = verify_board_owner(&state.db, bid, &owner_id).await {
            return e;
        }
        bid
    } else {
        match ensure_default_board(&state.db, &owner_id).await {
            Ok(id) => id,
            Err(e) => return e,
        }
    };

    // Resolve column: prefer column_id, then column_name, then first column
    let column_id = if let Some(cid) = body.column_id {
        let valid = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM kanban_columns WHERE id = $1 AND board_id = $2)",
        )
        .bind(cid)
        .bind(board_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);
        if valid { Some(cid) } else { None }
    } else {
        None
    };

    let column_id = match column_id {
        Some(id) => id,
        None => {
            // Try column_name lookup
            let column_name = body.column_name.as_deref().unwrap_or("Backlog");
            let by_name = sqlx::query_scalar::<_, Uuid>(
                "SELECT id FROM kanban_columns WHERE board_id = $1 AND name = $2 LIMIT 1",
            )
            .bind(board_id)
            .bind(column_name)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();

            match by_name {
                Some(id) => id,
                None => {
                    // Fall back to first column
                    match sqlx::query_scalar::<_, Uuid>(
                        "SELECT id FROM kanban_columns WHERE board_id = $1 ORDER BY sort_order LIMIT 1",
                    )
                    .bind(board_id)
                    .fetch_optional(&state.db)
                    .await
                    {
                        Ok(Some(id)) => id,
                        _ => {
                            return (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(json!({ "error": "No columns found" })),
                            )
                                .into_response()
                        }
                    }
                }
            }
        }
    };

    let max_order = sqlx::query_scalar::<_, Option<i32>>(
        "SELECT MAX(sort_order) FROM kanban_cards WHERE column_id = $1",
    )
    .bind(column_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(None)
    .unwrap_or(-1);

    let result = sqlx::query_as::<_, CardRow>(
        r#"INSERT INTO kanban_cards (column_id, title, description, priority, sort_order, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, column_id, title, description, priority, due_date, sort_order, created_by, created_at, updated_at, share_token, COALESCE(is_public, false) AS is_public"#,
    )
    .bind(column_id)
    .bind(&body.title)
    .bind(&body.description)
    .bind(body.priority.as_deref().unwrap_or("medium"))
    .bind(max_order + 1)
    .bind(agent.id.to_string())
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(card) => {
            // Auto-assign the agent to the card
            let _ = sqlx::query(
                "INSERT INTO kanban_card_agents (card_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            )
            .bind(card.id)
            .bind(agent.id.to_string())
            .execute(&state.db)
            .await;

            (StatusCode::CREATED, Json(json!(card))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// PATCH /api/agent/kanban/cards/:id — update a card
async fn agent_update_card(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(card_id): Path<Uuid>,
    Json(body): Json<UpdateCardBody>,
) -> Response {
    if body.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "No fields to update" })))
            .into_response();
    }

    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };

    if let Err(e) = verify_card_owner(&state.db, card_id, &owner_id).await {
        return e;
    }

    let result = sqlx::query(
        r#"UPDATE kanban_cards SET
             title = COALESCE($2, title),
             description = COALESCE($3, description),
             priority = COALESCE($4, priority),
             column_id = COALESCE($5, column_id),
             sort_order = COALESCE($6, sort_order),
             updated_at = NOW()
           WHERE id = $1"#,
    )
    .bind(card_id)
    .bind(&body.title)
    .bind(&body.description)
    .bind(&body.priority)
    .bind(body.column_id)
    .bind(body.sort_order)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({ "ok": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// POST /api/agent/kanban/cards/:id/complete — move card to Done column
async fn agent_complete_card(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(card_id): Path<Uuid>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };

    if let Err(e) = verify_card_owner(&state.db, card_id, &owner_id).await {
        return e;
    }

    // Find the Done column for this card's board
    let done_col = sqlx::query_scalar::<_, Uuid>(
        r#"SELECT col2.id FROM kanban_cards c
           JOIN kanban_columns col ON col.id = c.column_id
           JOIN kanban_columns col2 ON col2.board_id = col.board_id AND col2.name = 'Done'
           WHERE c.id = $1
           LIMIT 1"#,
    )
    .bind(card_id)
    .fetch_optional(&state.db)
    .await;

    match done_col {
        Ok(Some(done_id)) => {
            let _ = sqlx::query(
                "UPDATE kanban_cards SET column_id = $2, updated_at = NOW() WHERE id = $1",
            )
            .bind(card_id)
            .bind(done_id)
            .execute(&state.db)
            .await;
            Json(json!({ "ok": true })).into_response()
        }
        _ => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Done column not found" })),
        )
            .into_response(),
    }
}

// ── Archived cards endpoints ─────────────────────────────────

/// GET /api/kanban/boards/:id/archived-cards?page=1&limit=20
async fn list_archived_cards(
    State(state): State<AppState>,
    user: AuthUser,
    Path(board_id): Path<Uuid>,
    Query(params): Query<PaginationQuery>,
) -> Response {
    if let Err(e) = verify_board_owner(&state.db, board_id, &user.id).await {
        return e;
    }

    lazy_archive_done_cards(&state.db, board_id).await;

    let limit = params.limit.unwrap_or(20).min(100).max(1);
    let page = params.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;

    let total = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM kanban_cards c
           JOIN kanban_columns col ON col.id = c.column_id
           WHERE col.board_id = $1 AND c.archived = TRUE"#,
    )
    .bind(board_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let cards = sqlx::query_as::<_, ArchivedCardRow>(
        r#"SELECT c.id, c.column_id, c.title, c.description, c.priority,
                  c.created_at, c.updated_at, c.archived_at
           FROM kanban_cards c
           JOIN kanban_columns col ON col.id = c.column_id
           WHERE col.board_id = $1 AND c.archived = TRUE
           ORDER BY c.archived_at DESC NULLS LAST
           LIMIT $2 OFFSET $3"#,
    )
    .bind(board_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await;

    match cards {
        Ok(rows) => Json(json!({
            "cards": rows,
            "total": total,
            "page": page,
            "limit": limit,
        }))
        .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// POST /api/kanban/cards/:id/archive — archive a card
async fn archive_card(
    State(state): State<AppState>,
    user: AuthUser,
    Path(card_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    let result = sqlx::query(
        "UPDATE kanban_cards SET archived = TRUE, archived_at = NOW(), updated_at = NOW() WHERE id = $1",
    )
    .bind(card_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({ "ok": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// POST /api/kanban/cards/:id/unarchive — move card back to Done column (un-archived)
async fn unarchive_card(
    State(state): State<AppState>,
    user: AuthUser,
    Path(card_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    let result = sqlx::query(
        "UPDATE kanban_cards SET archived = FALSE, archived_at = NULL, updated_at = NOW() WHERE id = $1",
    )
    .bind(card_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({ "ok": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// GET /api/agent/kanban/boards/:id/archived-cards?page=1&limit=20
async fn agent_list_archived_cards(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(board_id): Path<Uuid>,
    Query(params): Query<PaginationQuery>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };

    if let Err(e) = verify_board_owner(&state.db, board_id, &owner_id).await {
        return e;
    }

    lazy_archive_done_cards(&state.db, board_id).await;

    let limit = params.limit.unwrap_or(20).min(100).max(1);
    let page = params.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;

    let total = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM kanban_cards c
           JOIN kanban_columns col ON col.id = c.column_id
           WHERE col.board_id = $1 AND c.archived = TRUE"#,
    )
    .bind(board_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let cards = sqlx::query_as::<_, ArchivedCardRow>(
        r#"SELECT c.id, c.column_id, c.title, c.description, c.priority,
                  c.created_at, c.updated_at, c.archived_at
           FROM kanban_cards c
           JOIN kanban_columns col ON col.id = c.column_id
           WHERE col.board_id = $1 AND c.archived = TRUE
           ORDER BY c.archived_at DESC NULLS LAST
           LIMIT $2 OFFSET $3"#,
    )
    .bind(board_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await;

    match cards {
        Ok(rows) => Json(json!({
            "cards": rows,
            "total": total,
            "page": page,
            "limit": limit,
        }))
        .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

// ── Kanban Card ↔ Note Links ─────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct LinkedNoteRow {
    id: Uuid,
    title: String,
    tags: Vec<String>,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkNoteBody {
    note_id: Uuid,
}

/// POST /api/kanban/cards/:id/notes — link a note to a card
async fn link_note_to_card(
    State(state): State<AppState>,
    user: AuthUser,
    Path(card_id): Path<Uuid>,
    Json(body): Json<LinkNoteBody>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    // Verify the note exists
    let note_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM conversation_notes WHERE id = $1)",
    )
    .bind(body.note_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !note_exists {
        return (StatusCode::NOT_FOUND, Json(json!({ "error": "Note not found" }))).into_response();
    }

    let result = sqlx::query(
        "INSERT INTO kanban_card_notes (card_id, note_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(card_id)
    .bind(body.note_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({ "linked": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// DELETE /api/kanban/cards/:card_id/notes/:note_id — unlink a note from a card
async fn unlink_note_from_card(
    State(state): State<AppState>,
    user: AuthUser,
    Path((card_id, note_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    let result = sqlx::query(
        "DELETE FROM kanban_card_notes WHERE card_id = $1 AND note_id = $2",
    )
    .bind(card_id)
    .bind(note_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// GET /api/kanban/cards/:id/notes — list notes linked to a card
async fn list_card_notes(
    State(state): State<AppState>,
    user: AuthUser,
    Path(card_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    let notes = sqlx::query_as::<_, LinkedNoteRow>(
        r#"SELECT n.id, n.title, n.tags, n.created_at
           FROM conversation_notes n
           JOIN kanban_card_notes cn ON cn.note_id = n.id
           WHERE cn.card_id = $1
           ORDER BY cn.created_at DESC"#,
    )
    .bind(card_id)
    .fetch_all(&state.db)
    .await;

    match notes {
        Ok(rows) => Json(json!(rows)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// GET /api/kanban/owner-notes — list all notes owned by the current user (for note picker)
async fn list_owner_notes(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<OwnerNotesQuery>,
) -> Response {
    let search = q.q.unwrap_or_default();
    let limit = q.limit.unwrap_or(20).min(50);

    let notes = if search.is_empty() {
        sqlx::query_as::<_, LinkedNoteRow>(
            r#"SELECT id, title, tags, created_at
               FROM conversation_notes
               WHERE creator_id = $1 AND archived_at IS NULL
               ORDER BY updated_at DESC
               LIMIT $2"#,
        )
        .bind(&user.id)
        .bind(limit)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as::<_, LinkedNoteRow>(
            r#"SELECT id, title, tags, created_at
               FROM conversation_notes
               WHERE creator_id = $1 AND archived_at IS NULL
                 AND LOWER(title) LIKE '%' || LOWER($2) || '%'
               ORDER BY updated_at DESC
               LIMIT $3"#,
        )
        .bind(&user.id)
        .bind(&search)
        .bind(limit)
        .fetch_all(&state.db)
        .await
    };

    match notes {
        Ok(rows) => Json(json!(rows)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

#[derive(Debug, Deserialize)]
struct OwnerNotesQuery {
    q: Option<String>,
    limit: Option<i64>,
}

// ── Card Commits ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddCommitBody {
    commit_hash: String,
    message: Option<String>,
}

/// POST /api/kanban/cards/:cardId/commits
async fn add_card_commit(
    State(state): State<AppState>,
    user: AuthUser,
    Path(card_id): Path<Uuid>,
    Json(body): Json<AddCommitBody>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    let hash = body.commit_hash.trim();
    if hash.is_empty() || hash.len() > 40 {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Invalid commit hash" }))).into_response();
    }

    let result = sqlx::query(
        "INSERT INTO kanban_card_commits (card_id, commit_hash, message) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    )
    .bind(card_id)
    .bind(hash)
    .bind(body.message.as_deref())
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => StatusCode::CREATED.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// GET /api/kanban/cards/:cardId/commits
async fn list_card_commits(
    State(state): State<AppState>,
    user: AuthUser,
    Path(card_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    let rows = sqlx::query_as::<_, CardCommitRow>(
        "SELECT card_id, commit_hash, message, created_at FROM kanban_card_commits WHERE card_id = $1 ORDER BY created_at DESC",
    )
    .bind(card_id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(r) => Json(json!(r)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// DELETE /api/kanban/cards/:cardId/commits/:commitHash
async fn delete_card_commit(
    State(state): State<AppState>,
    user: AuthUser,
    Path((card_id, commit_hash)): Path<(Uuid, String)>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    let result = sqlx::query(
        "DELETE FROM kanban_card_commits WHERE card_id = $1 AND commit_hash = $2",
    )
    .bind(card_id)
    .bind(&commit_hash)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// GET /api/agent/kanban/cards/:cardId/commits
async fn agent_list_card_commits(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(card_id): Path<Uuid>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_card_owner(&state.db, card_id, &owner_id).await {
        return e;
    }

    let rows = sqlx::query_as::<_, CardCommitRow>(
        "SELECT card_id, commit_hash, message, created_at FROM kanban_card_commits WHERE card_id = $1 ORDER BY created_at DESC",
    )
    .bind(card_id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(r) => Json(json!(r)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// POST /api/agent/kanban/cards/:cardId/commits
async fn agent_add_card_commit(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(card_id): Path<Uuid>,
    Json(body): Json<AddCommitBody>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_card_owner(&state.db, card_id, &owner_id).await {
        return e;
    }

    let hash = body.commit_hash.trim();
    if hash.is_empty() || hash.len() > 40 {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Invalid commit hash" }))).into_response();
    }

    let result = sqlx::query(
        "INSERT INTO kanban_card_commits (card_id, commit_hash, message) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
    )
    .bind(card_id)
    .bind(hash)
    .bind(body.message.as_deref())
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => StatusCode::CREATED.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

// ── Share Card to Conversation ───────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShareCardBody {
    conversation_id: Uuid,
}

/// POST /api/kanban/cards/:id/share — share a kanban card to a conversation as a rich system message
async fn share_card(
    State(state): State<AppState>,
    user: AuthUser,
    Path(card_id): Path<Uuid>,
    Json(body): Json<ShareCardBody>,
) -> Response {
    // Verify card ownership
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    // Verify user is conversation member
    let is_member = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM conversation_user_members WHERE conversation_id = $1 AND user_id = $2",
    )
    .bind(body.conversation_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if is_member == 0 {
        // Fallback: direct conversation owner
        let is_owner = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM conversations WHERE id = $1 AND user_id = $2",
        )
        .bind(body.conversation_id)
        .bind(&user.id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

        if is_owner == 0 {
            return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not a member" }))).into_response();
        }
    }

    // Fetch card with column name
    let card = sqlx::query_as::<_, (String, Option<String>, Option<String>, String)>(
        r#"SELECT c.title, c.description, c.priority, col.name
           FROM kanban_cards c
           JOIN kanban_columns col ON col.id = c.column_id
           WHERE c.id = $1"#,
    )
    .bind(card_id)
    .fetch_optional(&state.db)
    .await;

    let (title, description, priority, column_name) = match card {
        Ok(Some(c)) => c,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({ "error": "Card not found" }))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let preview = description.as_deref().map(|d| {
        if d.len() > 120 {
            format!("{}...", &d[..d.char_indices().nth(120).map(|(i, _)| i).unwrap_or(d.len())])
        } else {
            d.to_string()
        }
    });

    let metadata = json!({
        "type": "kanban_card",
        "cardId": card_id,
        "title": title,
        "preview": preview,
        "priority": priority,
        "columnName": column_name,
    });

    let msg_id = Uuid::new_v4();
    let result = sqlx::query(
        r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_user_id, metadata, created_at, updated_at)
           VALUES ($1, $2, 0, 'system', $3, 'completed', $4, $5, NOW(), NOW())"#,
    )
    .bind(msg_id)
    .bind(body.conversation_id)
    .bind(format!("shared a task: {}", title))
    .bind(&user.id)
    .bind(metadata.clone())
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            // Get conversation member IDs for broadcast
            let members: Vec<(String,)> = sqlx::query_as(
                "SELECT user_id FROM conversation_user_members WHERE conversation_id = $1",
            )
            .bind(body.conversation_id)
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();

            let member_ids: Vec<String> = if members.is_empty() {
                sqlx::query_as::<_, (String,)>(
                    "SELECT user_id FROM conversations WHERE id = $1",
                )
                .bind(body.conversation_id)
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten()
                .map(|(id,)| vec![id])
                .unwrap_or_default()
            } else {
                members.into_iter().map(|(id,)| id).collect()
            };

            state.ws.broadcast_to_members(
                &member_ids,
                &json!({
                    "type": "new_message",
                    "conversationId": body.conversation_id.to_string(),
                    "message": {
                        "id": msg_id.to_string(),
                        "conversationId": body.conversation_id.to_string(),
                        "seq": 0,
                        "role": "system",
                        "content": format!("shared a task: {}", title),
                        "status": "completed",
                        "senderUserId": &user.id,
                        "metadata": metadata,
                        "createdAt": Utc::now().to_rfc3339(),
                        "updatedAt": Utc::now().to_rfc3339(),
                    },
                }),
                &state.redis,
            );

            Json(json!({
                "messageId": msg_id,
                "cardId": card_id,
                "title": title,
            }))
            .into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

// ── Share Card to Conversation (Rich Card + Agent dispatch) ──

/// POST /api/kanban/cards/:cardId/share-to/:conversationId
async fn share_card_to_conversation(
    State(state): State<AppState>,
    user: AuthUser,
    Path((card_id, target_conv_id)): Path<(Uuid, Uuid)>,
) -> Response {
    // Verify card ownership
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    // Verify user is a member of the target conversation
    let is_member = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM conversation_user_members WHERE conversation_id = $1 AND user_id = $2",
    )
    .bind(target_conv_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if is_member == 0 {
        let is_owner = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM conversations WHERE id = $1 AND user_id = $2",
        )
        .bind(target_conv_id)
        .bind(&user.id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

        if is_owner == 0 {
            return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not a member" }))).into_response();
        }
    }

    // Fetch card with column name
    let card = sqlx::query_as::<_, (String, Option<String>, Option<String>, String)>(
        r#"SELECT c.title, c.description, c.priority, col.name
           FROM kanban_cards c
           JOIN kanban_columns col ON col.id = c.column_id
           WHERE c.id = $1"#,
    )
    .bind(card_id)
    .fetch_optional(&state.db)
    .await;

    let (title, description, priority, column_name) = match card {
        Ok(Some(c)) => c,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({ "error": "Card not found" }))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    let preview = description.as_deref().map(|d| {
        if d.len() > 120 {
            format!("{}...", &d[..d.char_indices().nth(120).map(|(i, _)| i).unwrap_or(d.len())])
        } else {
            d.to_string()
        }
    });

    let metadata = json!({
        "type": "kanban_card",
        "cardId": card_id,
        "title": title,
        "preview": preview,
        "priority": priority,
        "columnName": column_name,
    });

    // Build full message content for agent consumption
    let desc_str = description.as_deref().map(|d| format!("\n\n{}", d)).unwrap_or_default();
    let priority_str = priority.as_deref().map(|p| format!("\nPriority: {}", p)).unwrap_or_default();
    let msg_content = format!("用戶分享了一個任務：{}{}{}\nColumn: {}", title, priority_str, desc_str, column_name);

    let msg_id = Uuid::new_v4();
    let result = sqlx::query(
        r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_user_id, metadata, created_at, updated_at)
           VALUES ($1, $2, 0, 'user', $3, 'completed', $4, $5, NOW(), NOW())"#,
    )
    .bind(msg_id)
    .bind(target_conv_id)
    .bind(&msg_content)
    .bind(&user.id)
    .bind(metadata.clone())
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            // Get conversation member IDs for broadcast
            let members: Vec<(String,)> = sqlx::query_as(
                "SELECT user_id FROM conversation_user_members WHERE conversation_id = $1",
            )
            .bind(target_conv_id)
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();

            let member_ids: Vec<String> = if members.is_empty() {
                sqlx::query_as::<_, (String,)>(
                    "SELECT user_id FROM conversations WHERE id = $1",
                )
                .bind(target_conv_id)
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten()
                .map(|(id,)| vec![id])
                .unwrap_or_default()
            } else {
                members.into_iter().map(|(id,)| id).collect()
            };

            state.ws.broadcast_to_members(
                &member_ids,
                &json!({
                    "type": "new_message",
                    "conversationId": target_conv_id.to_string(),
                    "message": {
                        "id": msg_id.to_string(),
                        "conversationId": target_conv_id.to_string(),
                        "seq": 0,
                        "role": "user",
                        "content": &msg_content,
                        "status": "completed",
                        "senderUserId": &user.id,
                        "metadata": metadata,
                        "createdAt": Utc::now().to_rfc3339(),
                        "updatedAt": Utc::now().to_rfc3339(),
                    },
                }),
                &state.redis,
            );

            // Trigger agent dispatch
            let conv_id_str = target_conv_id.to_string();
            let state_clone = state.clone();
            let user_id = user.id.clone();
            let msg_content_clone = msg_content.clone();
            tokio::spawn(async move {
                trigger_agent_response(
                    &user_id,
                    &conv_id_str,
                    &msg_content_clone,
                    true,
                    None,
                    None,
                    &[],
                    None,
                    &state_clone.ws,
                    &state_clone.db,
                    &state_clone.redis,
                    &state_clone.config,
                )
                .await;
            });

            Json(json!({
                "messageId": msg_id,
                "cardId": card_id,
                "conversationId": target_conv_id,
                "title": title,
            }))
            .into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

// ── Public sharing ───────────────────────────────────────────

/// POST /api/kanban/cards/:id/public-share — create a public share link
async fn create_card_public_share(
    State(state): State<AppState>,
    user: AuthUser,
    Path(card_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    let token = Uuid::new_v4().to_string().replace("-", "");

    let result = sqlx::query(
        "UPDATE kanban_cards SET share_token = $1, is_public = true WHERE id = $2",
    )
    .bind(&token)
    .bind(card_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({
            "shareToken": token,
            "shareUrl": format!("/shared/cards/{}", token),
        }))
        .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// DELETE /api/kanban/cards/:id/public-share — revoke public sharing
async fn revoke_card_public_share(
    State(state): State<AppState>,
    user: AuthUser,
    Path(card_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    let result = sqlx::query(
        "UPDATE kanban_cards SET share_token = NULL, is_public = false WHERE id = $1",
    )
    .bind(card_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({ "ok": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// GET /api/public/cards/:shareToken — view a publicly shared card (no auth)
async fn get_public_card(
    State(state): State<AppState>,
    Path(share_token): Path<String>,
) -> Response {
    #[derive(sqlx::FromRow)]
    struct PublicCardRow {
        title: String,
        description: Option<String>,
        priority: Option<String>,
        created_at: Option<chrono::DateTime<chrono::Utc>>,
        updated_at: Option<chrono::DateTime<chrono::Utc>>,
        column_name: String,
    }

    let row = sqlx::query_as::<_, PublicCardRow>(
        r#"SELECT c.title, c.description, c.priority,
                  c.created_at, c.updated_at,
                  col.name AS column_name
           FROM kanban_cards c
           JOIN kanban_columns col ON col.id = c.column_id
           WHERE c.share_token = $1 AND c.is_public = true"#,
    )
    .bind(&share_token)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(c)) => Json(json!({
            "title": c.title,
            "description": c.description,
            "priority": c.priority,
            "columnName": c.column_name,
            "createdAt": c.created_at.map(|t| t.to_rfc3339()),
            "updatedAt": c.updated_at.map(|t| t.to_rfc3339()),
        }))
        .into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Card not found or not publicly shared" })),
        )
            .into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}
