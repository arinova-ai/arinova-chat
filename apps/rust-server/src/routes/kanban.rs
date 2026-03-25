use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, patch, post, put},
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
        .route("/api/kanban/columns/{id}/cards", get(list_column_cards))
        .route("/api/kanban/boards/{id}/columns/reorder", post(reorder_columns))
        .route(
            "/api/kanban/boards/{id}/archived-cards",
            get(list_archived_cards),
        )
        .route("/api/kanban/cards", post(create_card))
        .route("/api/kanban/cards/{id}", get(get_card).patch(update_card).delete(delete_card))
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
        .route(
            "/api/kanban/boards/{id}/labels",
            get(list_board_labels).post(create_label),
        )
        .route(
            "/api/kanban/labels/{id}",
            patch(update_label).delete(delete_label),
        )
        .route(
            "/api/kanban/cards/{id}/labels",
            post(add_label_to_card),
        )
        .route(
            "/api/kanban/cards/{cardId}/labels/{labelId}",
            delete(remove_label_from_card),
        )
        // Agent API
        .route("/api/agent/kanban/boards", get(agent_list_boards).post(agent_create_board))
        .route("/api/agent/kanban/boards/{id}", patch(agent_update_board))
        .route("/api/agent/kanban/boards/{id}/archive", post(agent_archive_board))
        .route("/api/agent/kanban/boards/{id}/columns", get(agent_list_columns).post(agent_create_column))
        .route("/api/agent/kanban/columns/{id}", patch(agent_update_column).delete(agent_delete_column))
        .route("/api/agent/kanban/boards/{id}/columns/reorder", post(agent_reorder_columns))
        .route("/api/agent/kanban/cards", get(agent_list_cards).post(agent_create_card))
        .route("/api/agent/kanban/cards/{id}", patch(agent_update_card).delete(agent_delete_card))
        .route("/api/agent/kanban/cards/{id}/complete", post(agent_complete_card))
        .route(
            "/api/agent/kanban/boards/{id}/archived-cards",
            get(agent_list_archived_cards),
        )
        .route(
            "/api/agent/kanban/cards/{cardId}/commits",
            get(agent_list_card_commits).post(agent_add_card_commit),
        )
        .route(
            "/api/agent/kanban/cards/{id}/notes",
            get(agent_list_card_notes).post(agent_link_note_to_card),
        )
        .route(
            "/api/agent/kanban/cards/{card_id}/notes/{note_id}",
            delete(agent_unlink_note_from_card),
        )
        .route(
            "/api/agent/kanban/boards/{id}/labels",
            get(agent_list_board_labels).post(agent_create_label),
        )
        .route(
            "/api/agent/kanban/labels/{id}",
            patch(agent_update_label).delete(agent_delete_label),
        )
        .route(
            "/api/agent/kanban/cards/{id}/labels",
            post(agent_add_label_to_card),
        )
        .route(
            "/api/agent/kanban/cards/{cardId}/labels/{labelId}",
            delete(agent_remove_label_from_card),
        )
        // Board members (sharing)
        .route(
            "/api/kanban/boards/{id}/members",
            get(list_board_members).post(add_board_member),
        )
        .route(
            "/api/kanban/boards/{boardId}/members/{userId}",
            patch(update_board_member).delete(remove_board_member),
        )
        // Agent permissions
        .route(
            "/api/kanban/boards/{id}/agent-permissions",
            get(get_board_agent_permissions).put(set_board_agent_permissions),
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
    archived: bool,
    owner_id: Option<String>,
    owner_username: Option<String>,
    auto_archive_days: Option<i32>,
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

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct LabelRow {
    id: Uuid,
    board_id: Uuid,
    name: String,
    color: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct CardLabelRow {
    card_id: Uuid,
    label_id: Uuid,
    label_name: String,
    label_color: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateLabelBody {
    name: String,
    color: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateLabelBody {
    name: Option<String>,
    color: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddCardLabelBody {
    label_id: Uuid,
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
    #[serde(default)]
    auto_archive_days: Option<i32>,
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
/// Verify user is board owner OR an edit member. Used for write operations.
async fn verify_board_owner(
    db: &sqlx::PgPool,
    board_id: Uuid,
    owner_id: &str,
) -> Result<(), Response> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM kanban_boards WHERE id = $1 AND owner_id = $2
            UNION ALL
            SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2 AND permission = 'edit'
        )"#,
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

/// Check that a card belongs to the given user (through board ownership or edit membership).
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
            WHERE c.id = $1 AND (b.owner_id = $2 OR EXISTS(SELECT 1 FROM board_members bm WHERE bm.board_id = b.id AND bm.user_id = $2 AND bm.permission = 'edit'))
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

/// Check that a column belongs to the given user (through board ownership or edit membership).
async fn verify_column_owner(
    db: &sqlx::PgPool,
    column_id: Uuid,
    owner_id: &str,
) -> Result<(), Response> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM kanban_columns col
            JOIN kanban_boards b ON b.id = col.board_id
            WHERE col.id = $1 AND (b.owner_id = $2 OR EXISTS(SELECT 1 FROM board_members bm WHERE bm.board_id = b.id AND bm.user_id = $2 AND bm.permission = 'edit'))
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

/// Check that user is owner OR a board member (any permission).
async fn verify_board_access(
    db: &sqlx::PgPool,
    board_id: Uuid,
    user_id: &str,
) -> Result<(), Response> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM kanban_boards WHERE id = $1 AND owner_id = $2
            UNION ALL
            SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2
        )"#,
    )
    .bind(board_id)
    .bind(user_id)
    .fetch_one(db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response()
    })?;
    if !exists {
        return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "Board not found" }))).into_response());
    }
    Ok(())
}

/// Check that user is owner OR a board member with 'edit' permission.
async fn verify_board_edit_access(
    db: &sqlx::PgPool,
    board_id: Uuid,
    user_id: &str,
) -> Result<(), Response> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM kanban_boards WHERE id = $1 AND owner_id = $2
            UNION ALL
            SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2 AND permission = 'edit'
        )"#,
    )
    .bind(board_id)
    .bind(user_id)
    .fetch_one(db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response()
    })?;
    if !exists {
        return Err((StatusCode::FORBIDDEN, Json(json!({ "error": "No edit access" }))).into_response());
    }
    Ok(())
}

/// Check that a card is accessible by user (through board ownership or membership).
async fn verify_card_access(
    db: &sqlx::PgPool,
    card_id: Uuid,
    user_id: &str,
) -> Result<(), Response> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM kanban_cards c
            JOIN kanban_columns col ON col.id = c.column_id
            JOIN kanban_boards b ON b.id = col.board_id
            WHERE c.id = $1 AND (b.owner_id = $2 OR EXISTS(SELECT 1 FROM board_members bm WHERE bm.board_id = b.id AND bm.user_id = $2))
        )"#,
    )
    .bind(card_id)
    .bind(user_id)
    .fetch_one(db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response()
    })?;
    if !exists {
        return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "Card not found" }))).into_response());
    }
    Ok(())
}

/// Check that a card is editable by user (owner or edit member).
async fn verify_card_edit_access(
    db: &sqlx::PgPool,
    card_id: Uuid,
    user_id: &str,
) -> Result<(), Response> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM kanban_cards c
            JOIN kanban_columns col ON col.id = c.column_id
            JOIN kanban_boards b ON b.id = col.board_id
            WHERE c.id = $1 AND (b.owner_id = $2 OR EXISTS(SELECT 1 FROM board_members bm WHERE bm.board_id = b.id AND bm.user_id = $2 AND bm.permission = 'edit'))
        )"#,
    )
    .bind(card_id)
    .bind(user_id)
    .fetch_one(db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response()
    })?;
    if !exists {
        return Err((StatusCode::FORBIDDEN, Json(json!({ "error": "No edit access" }))).into_response());
    }
    Ok(())
}

/// Lazy-archive: mark cards in Done columns as archived if updated_at > 3 days ago.
async fn lazy_archive_done_cards(db: &sqlx::PgPool, board_id: Uuid) {
    let days = sqlx::query_scalar::<_, i32>(
        "SELECT COALESCE(auto_archive_days, 3) FROM kanban_boards WHERE id = $1",
    )
    .bind(board_id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
    .unwrap_or(3);

    if days <= 0 { return; }

    let _ = sqlx::query(
        r#"UPDATE kanban_cards SET archived = TRUE, archived_at = NOW()
           WHERE archived = FALSE
             AND column_id IN (
               SELECT id FROM kanban_columns WHERE board_id = $1 AND name = 'Done'
             )
             AND updated_at < NOW() - make_interval(days => $2)"#,
    )
    .bind(board_id)
    .bind(days)
    .execute(db)
    .await;
}

/// Lazy-archive across all boards owned by a user.
async fn lazy_archive_done_cards_by_owner(db: &sqlx::PgPool, owner_id: &str) {
    // Archive done cards per board's auto_archive_days setting
    let _ = sqlx::query(
        r#"UPDATE kanban_cards SET archived = TRUE, archived_at = NOW()
           WHERE archived = FALSE
             AND column_id IN (
               SELECT kc.id FROM kanban_columns kc
               JOIN kanban_boards kb ON kb.id = kc.board_id
               WHERE kb.owner_id = $1 AND kc.name = 'Done'
                 AND COALESCE(kb.auto_archive_days, 3) > 0
             )
             AND updated_at < NOW() - make_interval(days => COALESCE(
               (SELECT kb2.auto_archive_days FROM kanban_boards kb2
                JOIN kanban_columns kc2 ON kc2.board_id = kb2.id
                WHERE kc2.id = kanban_cards.column_id LIMIT 1), 3))"#,
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
            r#"SELECT kb.id, kb.name, kb.created_at, kb.archived, kb.owner_id, u.username AS owner_username, kb.auto_archive_days
               FROM kanban_boards kb
               JOIN "user" u ON u.id = kb.owner_id
               WHERE kb.owner_id = $1
               UNION
               SELECT b.id, b.name, b.created_at, b.archived, b.owner_id, u.username AS owner_username, b.auto_archive_days
               FROM kanban_boards b
               JOIN board_members bm ON bm.board_id = b.id
               JOIN "user" u ON u.id = b.owner_id
               WHERE bm.user_id = $1
               ORDER BY created_at"#,
        )
        .bind(&user.id)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as::<_, BoardRow>(
            r#"SELECT kb.id, kb.name, kb.created_at, kb.archived, kb.owner_id, u.username AS owner_username, kb.auto_archive_days
               FROM kanban_boards kb
               JOIN "user" u ON u.id = kb.owner_id
               WHERE kb.owner_id = $1 AND kb.archived = false
               UNION
               SELECT b.id, b.name, b.created_at, b.archived, b.owner_id, u.username AS owner_username, b.auto_archive_days
               FROM kanban_boards b
               JOIN board_members bm ON bm.board_id = b.id
               JOIN "user" u ON u.id = b.owner_id
               WHERE bm.user_id = $1 AND b.archived = false
               ORDER BY created_at"#,
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
    if let Err(e) = verify_board_access(&state.db, board_id, &user.id).await {
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
           ORDER BY c.updated_at DESC NULLS LAST"#,
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
           JOIN notes n ON n.id = cn.note_id
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

    let labels = sqlx::query_as::<_, LabelRow>(
        "SELECT id, board_id, name, color FROM kanban_labels WHERE board_id = $1 ORDER BY name",
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await;

    let card_labels = sqlx::query_as::<_, CardLabelRow>(
        r#"SELECT cl.card_id, cl.label_id, l.name AS label_name, l.color AS label_color
           FROM kanban_card_labels cl
           JOIN kanban_labels l ON l.id = cl.label_id
           JOIN kanban_cards c ON c.id = cl.card_id
           JOIN kanban_columns col ON col.id = c.column_id
           WHERE col.board_id = $1
           ORDER BY l.name"#,
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await;

    match (columns, cards, card_agents, card_notes, card_commits, labels, card_labels) {
        (Ok(cols), Ok(crds), Ok(agents), Ok(notes), Ok(commits), Ok(lbls), Ok(cl)) => Json(json!({
            "id": board_id,
            "columns": cols,
            "cards": crds,
            "cardAgents": agents,
            "cardNotes": notes,
            "cardCommits": commits,
            "labels": lbls,
            "cardLabels": cl,
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
    // Check plan limit
    if !super::user_settings::can_create_board(&state.db, &user.id).await.unwrap_or(false) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "plan_limit", "message": "Upgrade your plan to create more boards"})),
        )
            .into_response();
    }

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
        r#"SELECT kb.id, kb.name, kb.created_at, kb.archived, kb.owner_id, u.username AS owner_username
           FROM kanban_boards kb JOIN "user" u ON u.id = kb.owner_id WHERE kb.id = $1"#,
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

    let result = sqlx::query("UPDATE kanban_boards SET name = $1, auto_archive_days = COALESCE($3, auto_archive_days) WHERE id = $2")
        .bind(&body.name)
        .bind(board_id)
        .bind(body.auto_archive_days)
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
    if let Err(e) = verify_board_access(&state.db, board_id, &user.id).await {
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
        Ok(c) => {
            let members = get_board_member_ids(&state.db, board_id).await;
            state.ws.broadcast_to_members(&members, &json!({
                "type": "kanban_update",
                "boardId": board_id,
                "action": "column_created",
                "data": &c,
            }), &state.redis);
            (StatusCode::CREATED, Json(json!(c))).into_response()
        }
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
        Ok(_) => {
            if let Some(bid) = board_id_from_column(&state.db, column_id).await {
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(&members, &json!({
                    "type": "kanban_update",
                    "boardId": bid,
                    "action": "column_updated",
                    "data": { "columnId": column_id },
                }), &state.redis);
            }
            Json(json!({ "ok": true })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// DELETE /api/kanban/columns/:id
async fn delete_column(
    State(state): State<AppState>,
    user: AuthUser,
    Path(column_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_column_owner(&state.db, column_id, &user.id).await {
        return e;
    }

    // Reject if column has non-archived cards
    let card_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM kanban_cards WHERE column_id = $1 AND archived = false",
    )
    .bind(column_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if card_count > 0 {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Cannot delete column with cards. Move or archive cards first." }))).into_response();
    }

    // Get board_id before deleting the column
    let bid = board_id_from_column(&state.db, column_id).await;

    let result = sqlx::query("DELETE FROM kanban_columns WHERE id = $1")
        .bind(column_id).execute(&state.db).await;

    match result {
        Ok(_) => {
            if let Some(bid) = bid {
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(&members, &json!({
                    "type": "kanban_update",
                    "boardId": bid,
                    "action": "column_deleted",
                    "data": { "columnId": column_id },
                }), &state.redis);
            }
            Json(json!({ "ok": true })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// GET /api/kanban/columns/:id/cards?limit=20&offset=0
async fn list_column_cards(
    State(state): State<AppState>,
    user: AuthUser,
    Path(column_id): Path<Uuid>,
    Query(q): Query<PaginationQuery>,
) -> Response {
    // Verify user has access to the board this column belongs to
    let board_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT board_id FROM kanban_columns WHERE id = $1",
    )
    .bind(column_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    let board_id = match board_id {
        Some(id) => id,
        None => return (StatusCode::NOT_FOUND, Json(json!({"error": "Column not found"}))).into_response(),
    };

    if let Err(e) = verify_board_access(&state.db, board_id, &user.id).await {
        return e;
    }

    let limit = q.limit.unwrap_or(20).min(100).max(1);
    let page = q.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;

    let total = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM kanban_cards WHERE column_id = $1 AND archived = FALSE",
    )
    .bind(column_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let cards = sqlx::query_as::<_, CardRow>(
        r#"SELECT id, column_id, title,
                  CASE WHEN length(description) > 100 THEN substring(description, 1, 100) || '...' ELSE description END AS description,
                  priority, due_date, sort_order, created_by, created_at, updated_at,
                  share_token, COALESCE(is_public, false) AS is_public
           FROM kanban_cards
           WHERE column_id = $1 AND archived = FALSE
           ORDER BY updated_at DESC NULLS LAST
           LIMIT $2 OFFSET $3"#,
    )
    .bind(column_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await;

    match cards {
        Ok(rows) => Json(json!({
            "cards": rows,
            "total": total,
            "limit": limit,
            "offset": offset,
            "hasMore": (offset + limit) < total,
        })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
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

    // Push existing cards down, new card goes to top
    sqlx::query("UPDATE kanban_cards SET sort_order = sort_order + 1 WHERE column_id = $1")
        .bind(body.column_id)
        .execute(&state.db)
        .await
        .ok();
    let max_order = -1;

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
        Ok(card) => {
            if let Some(bid) = board_id_from_card(&state.db, card.id).await {
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(&members, &json!({
                    "type": "kanban_update",
                    "boardId": bid,
                    "action": "card_created",
                    "data": &card,
                }), &state.redis);
            }
            (StatusCode::CREATED, Json(json!(card))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// GET /api/kanban/cards/:id — get a single card with notes, commits, labels
async fn get_card(
    State(state): State<AppState>,
    user: AuthUser,
    Path(card_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_card_access(&state.db, card_id, &user.id).await {
        return e;
    }

    let card = sqlx::query_as::<_, CardRow>(
        r#"SELECT c.id, c.column_id, c.title, c.description, c.priority,
                  c.due_date, c.sort_order, c.created_by, c.created_at, c.updated_at,
                  c.share_token, COALESCE(c.is_public, false) AS is_public
           FROM kanban_cards c
           WHERE c.id = $1"#,
    )
    .bind(card_id)
    .fetch_optional(&state.db)
    .await;

    let card = match card {
        Ok(Some(c)) => c,
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(json!({ "error": "Card not found" })))
                .into_response()
        }
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
                .into_response()
        }
    };

    let notes = sqlx::query_as::<_, CardNoteRow>(
        r#"SELECT cn.card_id, n.id AS note_id, n.title AS note_title
           FROM kanban_card_notes cn
           JOIN notes n ON n.id = cn.note_id
           WHERE cn.card_id = $1
           ORDER BY cn.created_at"#,
    )
    .bind(card_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let commits = sqlx::query_as::<_, CardCommitRow>(
        r#"SELECT cc.card_id, cc.commit_hash, cc.message, cc.created_at
           FROM kanban_card_commits cc
           WHERE cc.card_id = $1
           ORDER BY cc.created_at DESC"#,
    )
    .bind(card_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let labels = sqlx::query_as::<_, CardLabelRow>(
        r#"SELECT cl.card_id, cl.label_id, l.name AS label_name, l.color AS label_color
           FROM kanban_card_labels cl
           JOIN kanban_labels l ON l.id = cl.label_id
           WHERE cl.card_id = $1
           ORDER BY l.name"#,
    )
    .bind(card_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let agents = sqlx::query_as::<_, CardAgentRow>(
        "SELECT card_id, agent_id FROM kanban_card_agents WHERE card_id = $1",
    )
    .bind(card_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    Json(json!({
        "card": card,
        "cardNotes": notes,
        "cardCommits": commits,
        "cardLabels": labels,
        "cardAgents": agents,
    }))
    .into_response()
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
        Ok(_) => {
            if let Some(bid) = board_id_from_card(&state.db, card_id).await {
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(&members, &json!({
                    "type": "kanban_update",
                    "boardId": bid,
                    "action": "card_updated",
                    "data": { "cardId": card_id },
                }), &state.redis);
            }
            Json(json!({ "ok": true })).into_response()
        }
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

    // Get board_id before deleting the card
    let bid = board_id_from_card(&state.db, card_id).await;

    let result = sqlx::query("DELETE FROM kanban_cards WHERE id = $1")
        .bind(card_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => {
            if let Some(bid) = bid {
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(&members, &json!({
                    "type": "kanban_update",
                    "boardId": bid,
                    "action": "card_deleted",
                    "data": { "cardId": card_id },
                }), &state.redis);
            }
            Json(json!({ "ok": true })).into_response()
        }
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

// ── Board Members API ────────────────────────────────────────

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddBoardMemberBody {
    username: String,
    #[serde(default = "default_view")]
    permission: String,
}
fn default_view() -> String { "view".to_string() }

/// GET /api/kanban/boards/:id/members
async fn list_board_members(
    State(state): State<AppState>,
    user: AuthUser,
    Path(board_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_board_access(&state.db, board_id, &user.id).await {
        return e;
    }

    let members = sqlx::query_as::<_, (String, String, String, chrono::DateTime<chrono::Utc>)>(
        r#"SELECT bm.user_id, u.username, bm.permission, bm.created_at
           FROM board_members bm
           JOIN "user" u ON u.id = bm.user_id
           WHERE bm.board_id = $1
           ORDER BY bm.created_at"#,
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await;

    match members {
        Ok(rows) => {
            let items: Vec<_> = rows.iter().map(|(uid, username, perm, created)| json!({
                "userId": uid,
                "username": username,
                "permission": perm,
                "createdAt": created.to_rfc3339(),
            })).collect();

            // Also include the owner
            let owner = sqlx::query_as::<_, (String, String)>(
                r#"SELECT b.owner_id, u.username FROM kanban_boards b JOIN "user" u ON u.id = b.owner_id WHERE b.id = $1"#,
            )
            .bind(board_id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();

            Json(json!({
                "owner": owner.map(|(uid, uname)| json!({"userId": uid, "username": uname})),
                "members": items,
            })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// POST /api/kanban/boards/:id/members — owner or admin can invite
async fn add_board_member(
    State(state): State<AppState>,
    user: AuthUser,
    Path(board_id): Path<Uuid>,
    Json(body): Json<AddBoardMemberBody>,
) -> Response {
    // Owner or admin can invite members
    let is_owner = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM kanban_boards WHERE id = $1 AND owner_id = $2)",
    )
    .bind(board_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    let is_admin = if !is_owner {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM board_members WHERE board_id = $1 AND user_id = $2 AND permission = 'admin')",
        )
        .bind(board_id)
        .bind(&user.id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false)
    } else {
        false
    };

    if !is_owner && !is_admin {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Only the board owner or admin can invite members" }))).into_response();
    }

    if !["view", "edit", "admin"].contains(&body.permission.as_str()) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Permission must be 'view', 'edit', or 'admin'" }))).into_response();
    }

    // Admin cannot grant admin permission (only owner can)
    if body.permission == "admin" && !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Only the board owner can grant admin permission" }))).into_response();
    }

    // Look up user by username
    let target_user = sqlx::query_scalar::<_, String>(
        r#"SELECT id FROM "user" WHERE username = $1"#,
    )
    .bind(&body.username)
    .fetch_optional(&state.db)
    .await;

    let target_user_id = match target_user {
        Ok(Some(id)) => id,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({ "error": "User not found" }))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    };

    if target_user_id == user.id {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Cannot add yourself as a member" }))).into_response();
    }

    let result = sqlx::query(
        "INSERT INTO board_members (board_id, user_id, permission, invited_by) VALUES ($1, $2, $3, $4) ON CONFLICT (board_id, user_id) DO UPDATE SET permission = $3",
    )
    .bind(board_id)
    .bind(&target_user_id)
    .bind(&body.permission)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::CREATED, Json(json!({
            "userId": target_user_id,
            "username": body.username,
            "permission": body.permission,
        }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

#[derive(Deserialize)]
struct UpdateBoardMemberBody {
    permission: String,
}

/// PATCH /api/kanban/boards/:boardId/members/:userId
async fn update_board_member(
    State(state): State<AppState>,
    user: AuthUser,
    Path((board_id, target_user_id)): Path<(Uuid, String)>,
    Json(body): Json<UpdateBoardMemberBody>,
) -> Response {
    let is_owner = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM kanban_boards WHERE id = $1 AND owner_id = $2)",
    )
    .bind(board_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Only the board owner can change permissions" }))).into_response();
    }

    if !["view", "edit", "admin"].contains(&body.permission.as_str()) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Permission must be 'view', 'edit', or 'admin'" }))).into_response();
    }

    let result = sqlx::query(
        "UPDATE board_members SET permission = $1 WHERE board_id = $2 AND user_id = $3",
    )
    .bind(&body.permission)
    .bind(board_id)
    .bind(&target_user_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Json(json!({ "ok": true })).into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Member not found" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// DELETE /api/kanban/boards/:boardId/members/:userId
async fn remove_board_member(
    State(state): State<AppState>,
    user: AuthUser,
    Path((board_id, target_user_id)): Path<(Uuid, String)>,
) -> Response {
    // Owner can remove anyone; members can remove themselves
    let is_owner = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM kanban_boards WHERE id = $1 AND owner_id = $2)",
    )
    .bind(board_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !is_owner && user.id != target_user_id {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Only the board owner can remove members" }))).into_response();
    }

    let result = sqlx::query(
        "DELETE FROM board_members WHERE board_id = $1 AND user_id = $2",
    )
    .bind(board_id)
    .bind(&target_user_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Member not found" }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
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

pub(crate) async fn get_board_member_ids(db: &sqlx::PgPool, board_id: Uuid) -> Vec<String> {
    // Get owner + all board_members
    sqlx::query_scalar::<_, String>(
        r#"SELECT owner_id FROM kanban_boards WHERE id = $1
           UNION
           SELECT user_id FROM board_members WHERE board_id = $1"#,
    )
    .bind(board_id)
    .fetch_all(db)
    .await
    .unwrap_or_default()
}

pub(crate) async fn board_id_from_card(db: &sqlx::PgPool, card_id: Uuid) -> Option<Uuid> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT kc2.board_id FROM kanban_cards kc JOIN kanban_columns kc2 ON kc.column_id = kc2.id WHERE kc.id = $1",
    )
    .bind(card_id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
}

pub(crate) async fn board_id_from_column(db: &sqlx::PgPool, column_id: Uuid) -> Option<Uuid> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT board_id FROM kanban_columns WHERE id = $1",
    )
    .bind(column_id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
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
    let perm_filter = r#"AND EXISTS (SELECT 1 FROM board_agent_permissions WHERE board_id = kb.id AND agent_id = $2)"#;
    let boards = if include_archived {
        sqlx::query_as::<_, BoardRow>(
            &format!("SELECT kb.id, kb.name, kb.created_at, kb.archived, kb.owner_id, u.username AS owner_username FROM kanban_boards kb JOIN \"user\" u ON u.id = kb.owner_id WHERE kb.owner_id = $1 {} ORDER BY kb.created_at", perm_filter),
        )
        .bind(&owner_id)
        .bind(agent.id)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as::<_, BoardRow>(
            &format!("SELECT kb.id, kb.name, kb.created_at, kb.archived, kb.owner_id, u.username AS owner_username FROM kanban_boards kb JOIN \"user\" u ON u.id = kb.owner_id WHERE kb.owner_id = $1 AND kb.archived = false {} ORDER BY kb.created_at", perm_filter),
        )
        .bind(&owner_id)
        .bind(agent.id)
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

    // Auto-grant agent permission to new board
    let _ = sqlx::query(
        "INSERT INTO board_agent_permissions (board_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(board_id)
    .bind(agent.id)
    .execute(&state.db)
    .await;

    let board = sqlx::query_as::<_, BoardRow>(
        r#"SELECT kb.id, kb.name, kb.created_at, kb.archived, kb.owner_id, u.username AS owner_username
           FROM kanban_boards kb JOIN "user" u ON u.id = kb.owner_id WHERE kb.id = $1"#,
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

    // Check board-level agent permissions — no row = denied (default closed)
    let granted = match sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM board_agent_permissions WHERE board_id = $1 AND agent_id = $2",
    )
    .bind(board_id)
    .bind(agent.id)
    .fetch_one(&state.db)
    .await
    {
        Ok(c) => c,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };
    if granted == 0 {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Agent does not have access to this board"}))).into_response();
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
        Ok(c) => {
            let members = get_board_member_ids(&state.db, board_id).await;
            state.ws.broadcast_to_members(&members, &json!({
                "type": "kanban_update",
                "boardId": board_id,
                "action": "column_created",
                "data": &c,
            }), &state.redis);
            (StatusCode::CREATED, Json(json!(c))).into_response()
        }
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
        Ok(_) => {
            if let Some(bid) = board_id_from_column(&state.db, column_id).await {
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(&members, &json!({
                    "type": "kanban_update",
                    "boardId": bid,
                    "action": "column_updated",
                    "data": { "columnId": column_id },
                }), &state.redis);
            }
            Json(json!({ "ok": true })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// DELETE /api/agent/kanban/columns/:id
async fn agent_delete_column(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(column_id): Path<Uuid>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_column_owner(&state.db, column_id, &owner_id).await {
        return e;
    }

    let card_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM kanban_cards WHERE column_id = $1 AND archived = false",
    )
    .bind(column_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if card_count > 0 {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Cannot delete column with cards. Move or archive cards first." }))).into_response();
    }

    // Get board_id before deleting the column
    let bid = board_id_from_column(&state.db, column_id).await;

    let result = sqlx::query("DELETE FROM kanban_columns WHERE id = $1")
        .bind(column_id).execute(&state.db).await;

    match result {
        Ok(_) => {
            if let Some(bid) = bid {
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(&members, &json!({
                    "type": "kanban_update",
                    "boardId": bid,
                    "action": "column_deleted",
                    "data": { "columnId": column_id },
                }), &state.redis);
            }
            Json(json!({ "ok": true })).into_response()
        }
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

#[derive(Deserialize)]
struct AgentListCardsQuery {
    search: Option<String>,
}

/// GET /api/agent/kanban/cards — list owner's kanban cards (optional ?search= filter)
async fn agent_list_cards(State(state): State<AppState>, agent: AuthAgent, Query(query): Query<AgentListCardsQuery>) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };

    lazy_archive_done_cards_by_owner(&state.db, &owner_id).await;

    #[derive(Debug, sqlx::FromRow)]
    struct CardWithLabelRow {
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
        label_id: Option<Uuid>,
        label_name: Option<String>,
        label_color: Option<String>,
    }

    let search_cond = if let Some(ref s) = query.search {
        let s = s.trim();
        if !s.is_empty() {
            let escaped = s.replace('%', "\\%").replace('_', "\\_").replace('\'', "''");
            format!(" AND (c.title ILIKE '%{}%' OR c.description ILIKE '%{}%')", escaped, escaped)
        } else { String::new() }
    } else { String::new() };

    let sql = format!(
        r#"SELECT c.id, c.column_id, col.name AS column_name, c.title, c.description, c.priority,
                  c.due_date, c.sort_order, c.created_by, c.created_at, c.updated_at,
                  l.id AS label_id, l.name AS label_name, l.color AS label_color
           FROM kanban_cards c
           JOIN kanban_columns col ON col.id = c.column_id
           JOIN kanban_boards b ON b.id = col.board_id
           LEFT JOIN kanban_card_labels cl ON cl.card_id = c.id
           LEFT JOIN kanban_labels l ON l.id = cl.label_id
           WHERE b.owner_id = $1 AND c.archived = FALSE
             AND EXISTS (SELECT 1 FROM board_agent_permissions WHERE board_id = b.id AND agent_id = $2)
             {}
           ORDER BY c.updated_at DESC NULLS LAST, c.id"#,
        search_cond
    );

    let rows = sqlx::query_as::<_, CardWithLabelRow>(&sql)
    .bind(&owner_id)
    .bind(agent.id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            // Group labels per card, preserving insertion order
            let mut cards: Vec<serde_json::Value> = Vec::new();
            let mut id_to_idx: std::collections::HashMap<Uuid, usize> =
                std::collections::HashMap::new();
            for r in &rows {
                let idx = if let Some(&i) = id_to_idx.get(&r.id) {
                    i
                } else {
                    let i = cards.len();
                    cards.push(json!({
                        "id": r.id,
                        "columnId": r.column_id,
                        "columnName": r.column_name,
                        "title": r.title,
                        "description": r.description,
                        "priority": r.priority,
                        "dueDate": r.due_date.map(|t| t.to_rfc3339()),
                        "sortOrder": r.sort_order,
                        "createdBy": r.created_by,
                        "createdAt": r.created_at.map(|t| t.to_rfc3339()),
                        "updatedAt": r.updated_at.map(|t| t.to_rfc3339()),
                        "labels": [],
                    }));
                    id_to_idx.insert(r.id, i);
                    i
                };
                if let Some(lid) = r.label_id {
                    if let Some(arr) = cards[idx].get_mut("labels").and_then(|v| v.as_array_mut()) {
                        arr.push(json!({
                            "id": lid,
                            "name": r.label_name,
                            "color": r.label_color,
                        }));
                    }
                }
            }
            Json(json!(cards)).into_response()
        }
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
        // Check agent has permission for this board
        let has_perm = sqlx::query_scalar::<_, bool>(
            r#"SELECT EXISTS(SELECT 1 FROM board_agent_permissions WHERE board_id = $1 AND agent_id = $2)"#,
        )
        .bind(bid)
        .bind(agent.id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);
        if !has_perm {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Agent does not have permission for this board" })),
            )
                .into_response();
        }
        bid
    } else {
        // Find first board agent has permission for, or default board with auto-grant
        let permitted_board = sqlx::query_scalar::<_, Uuid>(
            r#"SELECT bap.board_id FROM board_agent_permissions bap
               JOIN kanban_boards kb ON kb.id = bap.board_id
               WHERE bap.agent_id = $1 AND kb.owner_id = $2 AND kb.archived = false
               ORDER BY kb.created_at LIMIT 1"#,
        )
        .bind(agent.id)
        .bind(&owner_id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        match permitted_board {
            Some(id) => id,
            None => {
                // No permitted board — find user's first existing board (don't auto-create)
                let existing_board = sqlx::query_scalar::<_, Uuid>(
                    "SELECT id FROM kanban_boards WHERE owner_id = $1 AND archived = false ORDER BY created_at LIMIT 1",
                )
                .bind(&owner_id)
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten();

                let default_id = match existing_board {
                    Some(id) => id,
                    None => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "No board available. User must create a board first." }))).into_response(),
                };
                // Auto-grant agent permission
                let _ = sqlx::query(
                    "INSERT INTO board_agent_permissions (board_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                )
                .bind(default_id)
                .bind(agent.id)
                .execute(&state.db)
                .await;
                default_id
            }
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

    // Push existing cards down, new card goes to top
    sqlx::query("UPDATE kanban_cards SET sort_order = sort_order + 1 WHERE column_id = $1")
        .bind(column_id)
        .execute(&state.db)
        .await
        .ok();
    let max_order = -1;

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

            if let Some(bid) = board_id_from_card(&state.db, card.id).await {
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(&members, &json!({
                    "type": "kanban_update",
                    "boardId": bid,
                    "action": "card_created",
                    "data": &card,
                }), &state.redis);
            }

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
        Ok(_) => {
            if let Some(bid) = board_id_from_card(&state.db, card_id).await {
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(&members, &json!({
                    "type": "kanban_update",
                    "boardId": bid,
                    "action": "card_updated",
                    "data": { "cardId": card_id },
                }), &state.redis);
            }
            Json(json!({ "ok": true })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// DELETE /api/agent/kanban/cards/:id — delete a card (agent)
async fn agent_delete_card(
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

    // Get board_id before deleting the card
    let bid = board_id_from_card(&state.db, card_id).await;

    let result = sqlx::query("DELETE FROM kanban_cards WHERE id = $1")
        .bind(card_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => {
            if let Some(bid) = bid {
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(&members, &json!({
                    "type": "kanban_update",
                    "boardId": bid,
                    "action": "card_deleted",
                    "data": { "cardId": card_id },
                }), &state.redis);
            }
            Json(json!({ "ok": true })).into_response()
        }
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
    if let Err(e) = verify_board_access(&state.db, board_id, &user.id).await {
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
        "SELECT EXISTS(SELECT 1 FROM notes WHERE id = $1)",
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
           FROM notes n
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

// ── Label endpoints (User API) ──────────────────────────────

/// Helper: verify that a label belongs to a board owned by the user.
async fn verify_label_owner(db: &sqlx::PgPool, label_id: Uuid, owner_id: &str) -> Result<(), Response> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM kanban_labels l
            JOIN kanban_boards b ON b.id = l.board_id
            WHERE l.id = $1 AND b.owner_id = $2
        )"#,
    )
    .bind(label_id)
    .bind(owner_id)
    .fetch_one(db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response()
    })?;

    if !exists {
        return Err((StatusCode::NOT_FOUND, Json(json!({ "error": "Label not found" }))).into_response());
    }
    Ok(())
}

/// POST /api/kanban/boards/:id/labels — create a label on a board
async fn create_label(
    State(state): State<AppState>,
    user: AuthUser,
    Path(board_id): Path<Uuid>,
    Json(body): Json<CreateLabelBody>,
) -> Response {
    if let Err(e) = verify_board_owner(&state.db, board_id, &user.id).await {
        return e;
    }

    let color = body.color.unwrap_or_else(|| "#6366f1".to_string());
    let label = sqlx::query_as::<_, LabelRow>(
        "INSERT INTO kanban_labels (board_id, name, color) VALUES ($1, $2, $3) RETURNING id, board_id, name, color",
    )
    .bind(board_id)
    .bind(&body.name)
    .bind(&color)
    .fetch_one(&state.db)
    .await;

    match label {
        Ok(l) => (StatusCode::CREATED, Json(json!(l))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// GET /api/kanban/boards/:id/labels — list all labels for a board
async fn list_board_labels(
    State(state): State<AppState>,
    user: AuthUser,
    Path(board_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_board_owner(&state.db, board_id, &user.id).await {
        return e;
    }

    let labels = sqlx::query_as::<_, LabelRow>(
        "SELECT id, board_id, name, color FROM kanban_labels WHERE board_id = $1 ORDER BY name",
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await;

    match labels {
        Ok(rows) => Json(json!(rows)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// PATCH /api/kanban/labels/:id — update a label (name/color)
async fn update_label(
    State(state): State<AppState>,
    user: AuthUser,
    Path(label_id): Path<Uuid>,
    Json(body): Json<UpdateLabelBody>,
) -> Response {
    if let Err(e) = verify_label_owner(&state.db, label_id, &user.id).await {
        return e;
    }

    if let Some(name) = &body.name {
        if let Err(e) = sqlx::query("UPDATE kanban_labels SET name = $1 WHERE id = $2")
            .bind(name)
            .bind(label_id)
            .execute(&state.db)
            .await
        {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
        }
    }
    if let Some(color) = &body.color {
        if let Err(e) = sqlx::query("UPDATE kanban_labels SET color = $1 WHERE id = $2")
            .bind(color)
            .bind(label_id)
            .execute(&state.db)
            .await
        {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
        }
    }

    let label = sqlx::query_as::<_, LabelRow>(
        "SELECT id, board_id, name, color FROM kanban_labels WHERE id = $1",
    )
    .bind(label_id)
    .fetch_one(&state.db)
    .await;

    match label {
        Ok(l) => Json(json!(l)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// DELETE /api/kanban/labels/:id — delete a label
async fn delete_label(
    State(state): State<AppState>,
    user: AuthUser,
    Path(label_id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_label_owner(&state.db, label_id, &user.id).await {
        return e;
    }

    let result = sqlx::query("DELETE FROM kanban_labels WHERE id = $1")
        .bind(label_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// POST /api/kanban/cards/:id/labels — add a label to a card
async fn add_label_to_card(
    State(state): State<AppState>,
    user: AuthUser,
    Path(card_id): Path<Uuid>,
    Json(body): Json<AddCardLabelBody>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    // Verify label belongs to the same board as the card
    let same_board = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM kanban_labels l
            JOIN kanban_cards c ON c.id = $1
            JOIN kanban_columns col ON col.id = c.column_id
            WHERE l.id = $2 AND l.board_id = col.board_id
        )"#,
    )
    .bind(card_id)
    .bind(body.label_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !same_board {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Label does not belong to the same board" }))).into_response();
    }

    let result = sqlx::query(
        "INSERT INTO kanban_card_labels (card_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(card_id)
    .bind(body.label_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({ "linked": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// DELETE /api/kanban/cards/:card_id/labels/:label_id — remove a label from a card
async fn remove_label_from_card(
    State(state): State<AppState>,
    user: AuthUser,
    Path((card_id, label_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if let Err(e) = verify_card_owner(&state.db, card_id, &user.id).await {
        return e;
    }

    let result = sqlx::query(
        "DELETE FROM kanban_card_labels WHERE card_id = $1 AND label_id = $2",
    )
    .bind(card_id)
    .bind(label_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
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
               FROM notes
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
               FROM notes
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

// ── Agent Note Link Endpoints ────────────────────────────────

/// POST /api/agent/kanban/cards/:id/notes — link a note to a card
async fn agent_link_note_to_card(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(card_id): Path<Uuid>,
    Json(body): Json<LinkNoteBody>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_card_owner(&state.db, card_id, &owner_id).await {
        return e;
    }

    let note_exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM notes WHERE id = $1)",
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

/// DELETE /api/agent/kanban/cards/:card_id/notes/:note_id — unlink a note from a card
async fn agent_unlink_note_from_card(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path((card_id, note_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_card_owner(&state.db, card_id, &owner_id).await {
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

/// GET /api/agent/kanban/cards/:id/notes — list notes linked to a card
async fn agent_list_card_notes(
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

    let notes = sqlx::query_as::<_, LinkedNoteRow>(
        r#"SELECT n.id, n.title, n.tags, n.created_at
           FROM notes n
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

// ── Label endpoints (Agent API) ─────────────────────────────

/// POST /api/agent/kanban/boards/:id/labels — create a label on a board (agent)
async fn agent_create_label(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(board_id): Path<Uuid>,
    Json(body): Json<CreateLabelBody>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_board_owner(&state.db, board_id, &owner_id).await {
        return e;
    }

    let color = body.color.unwrap_or_else(|| "#6366f1".to_string());
    let label = sqlx::query_as::<_, LabelRow>(
        "INSERT INTO kanban_labels (board_id, name, color) VALUES ($1, $2, $3) RETURNING id, board_id, name, color",
    )
    .bind(board_id)
    .bind(&body.name)
    .bind(&color)
    .fetch_one(&state.db)
    .await;

    match label {
        Ok(l) => (StatusCode::CREATED, Json(json!(l))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// GET /api/agent/kanban/boards/:id/labels — list all labels for a board (agent)
async fn agent_list_board_labels(
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

    let labels = sqlx::query_as::<_, LabelRow>(
        "SELECT id, board_id, name, color FROM kanban_labels WHERE board_id = $1 ORDER BY name",
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await;

    match labels {
        Ok(rows) => Json(json!(rows)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// PATCH /api/agent/kanban/labels/:id — update a label (agent)
async fn agent_update_label(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(label_id): Path<Uuid>,
    Json(body): Json<UpdateLabelBody>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_label_owner(&state.db, label_id, &owner_id).await {
        return e;
    }

    if let Some(name) = &body.name {
        if let Err(e) = sqlx::query("UPDATE kanban_labels SET name = $1 WHERE id = $2")
            .bind(name)
            .bind(label_id)
            .execute(&state.db)
            .await
        {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
        }
    }
    if let Some(color) = &body.color {
        if let Err(e) = sqlx::query("UPDATE kanban_labels SET color = $1 WHERE id = $2")
            .bind(color)
            .bind(label_id)
            .execute(&state.db)
            .await
        {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response();
        }
    }

    let label = sqlx::query_as::<_, LabelRow>(
        "SELECT id, board_id, name, color FROM kanban_labels WHERE id = $1",
    )
    .bind(label_id)
    .fetch_one(&state.db)
    .await;

    match label {
        Ok(l) => Json(json!(l)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// DELETE /api/agent/kanban/labels/:id — delete a label (agent)
async fn agent_delete_label(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(label_id): Path<Uuid>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_label_owner(&state.db, label_id, &owner_id).await {
        return e;
    }

    let result = sqlx::query("DELETE FROM kanban_labels WHERE id = $1")
        .bind(label_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// POST /api/agent/kanban/cards/:id/labels — add a label to a card (agent)
async fn agent_add_label_to_card(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(card_id): Path<Uuid>,
    Json(body): Json<AddCardLabelBody>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_card_owner(&state.db, card_id, &owner_id).await {
        return e;
    }

    // Verify label belongs to the same board as the card
    let same_board = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM kanban_labels l
            JOIN kanban_cards c ON c.id = $1
            JOIN kanban_columns col ON col.id = c.column_id
            WHERE l.id = $2 AND l.board_id = col.board_id
        )"#,
    )
    .bind(card_id)
    .bind(body.label_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !same_board {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Label does not belong to the same board" }))).into_response();
    }

    let result = sqlx::query(
        "INSERT INTO kanban_card_labels (card_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(card_id)
    .bind(body.label_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({ "linked": true })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

/// DELETE /api/agent/kanban/cards/:card_id/labels/:label_id — remove a label from a card (agent)
async fn agent_remove_label_from_card(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path((card_id, label_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let owner_id = match agent_owner_id(&state.db, agent.id).await {
        Ok(id) => id,
        Err(e) => return e,
    };
    if let Err(e) = verify_card_owner(&state.db, card_id, &owner_id).await {
        return e;
    }

    let result = sqlx::query(
        "DELETE FROM kanban_card_labels WHERE card_id = $1 AND label_id = $2",
    )
    .bind(card_id)
    .bind(label_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
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

// ===== Board Agent Permissions =====

/// GET /api/kanban/boards/:id/agent-permissions
async fn get_board_agent_permissions(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let owner = sqlx::query_scalar::<_, String>("SELECT owner_id FROM kanban_boards WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await;
    match owner {
        Ok(Some(oid)) if oid == user.id => {}
        Ok(Some(_)) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Not your board"}))).into_response(),
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Board not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }

    let rows = sqlx::query_as::<_, (Uuid,)>(
        "SELECT agent_id FROM board_agent_permissions WHERE board_id = $1",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(ids) => {
            let agent_ids: Vec<String> = ids.iter().map(|(aid,)| aid.to_string()).collect();
            Json(json!({ "agentIds": agent_ids })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetBoardAgentPermissionsBody {
    agent_ids: Vec<Uuid>,
}

/// PUT /api/kanban/boards/:id/agent-permissions
async fn set_board_agent_permissions(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<SetBoardAgentPermissionsBody>,
) -> Response {
    let owner = sqlx::query_scalar::<_, String>("SELECT owner_id FROM kanban_boards WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await;
    match owner {
        Ok(Some(oid)) if oid == user.id => {}
        Ok(Some(_)) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Not your board"}))).into_response(),
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Board not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }

    // Validate agent_ids belong to the user (via conversations)
    if !body.agent_ids.is_empty() {
        let valid_ids = match sqlx::query_scalar::<_, Uuid>(
            "SELECT DISTINCT agent_id FROM conversations WHERE user_id = $1 AND agent_id = ANY($2)",
        )
        .bind(&user.id)
        .bind(&body.agent_ids)
        .fetch_all(&state.db)
        .await
        {
            Ok(ids) => ids,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
        };
        if valid_ids.len() != body.agent_ids.len() {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "One or more agent IDs are invalid"}))).into_response();
        }
    }

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    if let Err(e) = sqlx::query("DELETE FROM board_agent_permissions WHERE board_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await
    {
        let _ = tx.rollback().await;
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response();
    }

    for aid in &body.agent_ids {
        if let Err(e) = sqlx::query(
            "INSERT INTO board_agent_permissions (board_id, agent_id, granted_by) VALUES ($1, $2, $3)",
        )
        .bind(id)
        .bind(aid)
        .bind(&user.id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response();
        }
    }

    if let Err(e) = tx.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response();
    }

    let agent_ids: Vec<String> = body.agent_ids.iter().map(|a| a.to_string()).collect();
    Json(json!({ "agentIds": agent_ids })).into_response()
}
