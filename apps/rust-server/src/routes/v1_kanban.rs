use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, patch, post},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::caller_identity::CallerIdentity;
use crate::AppState;

// Re-use helper functions from the existing kanban module.
use super::kanban::{
    board_id_from_card, board_id_from_column, get_board_member_ids, invalidate_board_cache,
};

pub fn router() -> Router<AppState> {
    Router::new()
        // Boards
        .route("/api/v1/kanban/boards", get(list_boards).post(create_board))
        .route("/api/v1/kanban/boards/{id}", patch(update_board).delete(hard_delete_board))
        .route("/api/v1/kanban/boards/{id}/archive", post(archive_board))
        // Columns
        .route(
            "/api/v1/kanban/boards/{id}/columns",
            get(list_columns).post(create_column),
        )
        .route(
            "/api/v1/kanban/columns/{id}",
            patch(update_column).delete(delete_column),
        )
        .route(
            "/api/v1/kanban/boards/{id}/columns/reorder",
            post(reorder_columns),
        )
        // Cards
        .route("/api/v1/kanban/cards", get(list_cards).post(create_card))
        .route(
            "/api/v1/kanban/cards/{id}",
            patch(update_card).delete(delete_card),
        )
        .route("/api/v1/kanban/cards/{id}/complete", post(complete_card))
        .route(
            "/api/v1/kanban/boards/{id}/archived-cards",
            get(list_archived_cards),
        )
        // Card commits
        .route(
            "/api/v1/kanban/cards/{cardId}/commits",
            get(list_card_commits).post(add_card_commit),
        )
        // Card notes
        .route(
            "/api/v1/kanban/cards/{id}/notes",
            get(list_card_notes).post(link_note_to_card),
        )
        .route(
            "/api/v1/kanban/cards/{card_id}/notes/{note_id}",
            delete(unlink_note_from_card),
        )
        // Labels
        .route(
            "/api/v1/kanban/boards/{id}/labels",
            get(list_board_labels).post(create_label),
        )
        .route(
            "/api/v1/kanban/labels/{id}",
            patch(update_label).delete(delete_label),
        )
        .route("/api/v1/kanban/cards/{id}/labels", post(add_label_to_card))
        .route(
            "/api/v1/kanban/cards/{cardId}/labels/{labelId}",
            delete(remove_label_from_card),
        )
}

// ── Types (mirrors of kanban.rs structs — kept private to this module) ───

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct BoardRow {
    id: Uuid,
    name: String,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
    archived: bool,
    owner_id: Option<String>,
    owner_username: Option<String>,
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
struct CardCommitRow {
    card_id: Uuid,
    commit_hash: String,
    message: Option<String>,
    created_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct LinkedNoteRow {
    id: Uuid,
    title: String,
    tags: Vec<String>,
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

// ── Request / query structs ──────────────────────────────────────

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ListBoardsQuery {
    #[serde(default)]
    include_archived: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListCardsQuery {
    search: Option<String>,
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
    #[allow(dead_code)]
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateCardBody {
    title: String,
    description: Option<String>,
    priority: Option<String>,
    column_name: Option<String>,
    column_id: Option<Uuid>,
    board_id: Option<Uuid>,
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
struct PaginationQuery {
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddCommitBody {
    commit_hash: String,
    message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LinkNoteBody {
    note_id: Uuid,
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

// ── Ownership helpers ────────────────────────────────────────────

/// Verify the board belongs to the given owner.
async fn verify_board_owner(db: &sqlx::PgPool, board_id: Uuid, owner_id: &str) -> Result<(), Response> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM kanban_boards WHERE id = $1 AND owner_id = $2)",
    )
    .bind(board_id)
    .bind(owner_id)
    .fetch_one(db)
    .await
    .unwrap_or(false);

    if !exists {
        return Err(
            (StatusCode::NOT_FOUND, Json(json!({ "error": "Board not found" }))).into_response(),
        );
    }
    Ok(())
}

/// Verify the card belongs to a board owned by the given owner.
async fn verify_card_owner(db: &sqlx::PgPool, card_id: Uuid, owner_id: &str) -> Result<(), Response> {
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
    .unwrap_or(false);

    if !exists {
        return Err(
            (StatusCode::NOT_FOUND, Json(json!({ "error": "Card not found" }))).into_response(),
        );
    }
    Ok(())
}

/// Verify the column belongs to a board owned by the given owner.
async fn verify_column_owner(db: &sqlx::PgPool, column_id: Uuid, owner_id: &str) -> Result<(), Response> {
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
    .unwrap_or(false);

    if !exists {
        return Err(
            (StatusCode::NOT_FOUND, Json(json!({ "error": "Column not found" }))).into_response(),
        );
    }
    Ok(())
}

/// Verify the label belongs to a board owned by the given owner.
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
    .unwrap_or(false);

    if !exists {
        return Err(
            (StatusCode::NOT_FOUND, Json(json!({ "error": "Label not found" }))).into_response(),
        );
    }
    Ok(())
}

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

    if let Some(id) = existing {
        return Ok(id);
    }

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
        let _ = sqlx::query(
            "INSERT INTO kanban_columns (board_id, name, sort_order) VALUES ($1, $2, $3)",
        )
        .bind(board_id)
        .bind(name)
        .bind(order)
        .execute(db)
        .await;
    }

    Ok(board_id)
}

/// Lazy-archive Done cards older than auto_archive_days for a specific board.
async fn lazy_archive_done_cards(db: &sqlx::PgPool, board_id: Uuid) {
    let _ = sqlx::query(
        r#"UPDATE kanban_cards SET archived = TRUE, archived_at = NOW()
           WHERE column_id IN (
               SELECT id FROM kanban_columns WHERE board_id = $1 AND name = 'Done'
           )
           AND archived = FALSE
           AND updated_at < NOW() - INTERVAL '7 days'"#,
    )
    .bind(board_id)
    .execute(db)
    .await;
}

/// Lazy-archive Done cards for ALL boards belonging to an owner.
async fn lazy_archive_done_cards_by_owner(db: &sqlx::PgPool, owner_id: &str) {
    let _ = sqlx::query(
        r#"UPDATE kanban_cards SET archived = TRUE, archived_at = NOW()
           WHERE column_id IN (
               SELECT kc.id FROM kanban_columns kc
               JOIN kanban_boards kb ON kb.id = kc.board_id
               WHERE kb.owner_id = $1 AND kc.name = 'Done'
           )
           AND archived = FALSE
           AND updated_at < NOW() - INTERVAL '7 days'"#,
    )
    .bind(owner_id)
    .execute(db)
    .await;
}

// ── Helper: get owner_id string from CallerIdentity ──────────

fn owner_id_str(caller: &CallerIdentity) -> String {
    caller.owner_id().to_string()
}

// ── Board agent permission filter fragment ────────────────────
// Returns an empty string for user callers (they own the boards, no permission filter needed)
// and a SQL fragment for agent callers.

fn agent_perm_filter(caller: &CallerIdentity) -> &'static str {
    if caller.is_agent() {
        " AND EXISTS (SELECT 1 FROM board_agent_permissions WHERE board_id = kb.id AND agent_id = $2)"
    } else {
        ""
    }
}

// ── Boards ───────────────────────────────────────────────────────

/// GET /api/v1/kanban/boards
async fn list_boards(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Query(query): Query<ListBoardsQuery>,
) -> Response {
    let owner_id = owner_id_str(&caller);
    let _ = ensure_default_board(&state.db, &owner_id).await;

    let include_archived = query.include_archived.unwrap_or(false);
    let perm_filter = agent_perm_filter(&caller);

    let archive_clause = if include_archived { "" } else { " AND kb.archived = false" };

    let sql = format!(
        "SELECT kb.id, kb.name, kb.created_at, kb.archived, kb.owner_id, u.username AS owner_username \
         FROM kanban_boards kb JOIN \"user\" u ON u.id = kb.owner_id \
         WHERE kb.owner_id = $1{}{} ORDER BY kb.created_at",
        archive_clause, perm_filter
    );

    let boards = if caller.is_agent() {
        sqlx::query_as::<_, BoardRow>(&sql)
            .bind(&owner_id)
            .bind(caller.agent_id().unwrap())
            .fetch_all(&state.db)
            .await
    } else {
        sqlx::query_as::<_, BoardRow>(&sql)
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

/// POST /api/v1/kanban/boards
async fn create_board(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Json(body): Json<CreateBoardBody>,
) -> Response {
    let owner_id = owner_id_str(&caller);

    let board_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO kanban_boards (owner_id, name) VALUES ($1, $2) RETURNING id",
    )
    .bind(&owner_id)
    .bind(&body.name)
    .fetch_one(&state.db)
    .await;

    let board_id = match board_id {
        Ok(id) => id,
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
                .into_response()
        }
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

    // Auto-grant agent permission to new board (if caller is an agent)
    if let Some(agent_id) = caller.agent_id() {
        let _ = sqlx::query(
            "INSERT INTO board_agent_permissions (board_id, agent_id, granted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        )
        .bind(board_id)
        .bind(agent_id)
        .bind(caller.owner_id().to_string())
        .execute(&state.db)
        .await;
    }

    invalidate_board_cache(&state.redis, board_id).await;

    let board = sqlx::query_as::<_, BoardRow>(
        r#"SELECT kb.id, kb.name, kb.created_at, kb.archived, kb.owner_id, u.username AS owner_username
           FROM kanban_boards kb JOIN "user" u ON u.id = kb.owner_id WHERE kb.id = $1"#,
    )
    .bind(board_id)
    .fetch_one(&state.db)
    .await;

    match board {
        Ok(b) => (StatusCode::CREATED, Json(json!(b))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// PATCH /api/v1/kanban/boards/{id}
async fn update_board(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(board_id): Path<Uuid>,
    Json(body): Json<UpdateBoardBody>,
) -> Response {
    let owner_id = owner_id_str(&caller);
    if let Err(e) = verify_board_owner(&state.db, board_id, &owner_id).await {
        return e;
    }

    let result = sqlx::query("UPDATE kanban_boards SET name = $1 WHERE id = $2")
        .bind(&body.name)
        .bind(board_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => {
            invalidate_board_cache(&state.redis, board_id).await;
            Json(json!({ "ok": true })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// POST /api/v1/kanban/boards/{id}/archive
async fn archive_board(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(board_id): Path<Uuid>,
) -> Response {
    let owner_id = owner_id_str(&caller);
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
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Cannot archive the last board" })))
                .into_response();
        }
    }

    let new_archived = !current_archived;

    if let Err(e) = sqlx::query("UPDATE kanban_boards SET archived = $1 WHERE id = $2")
        .bind(new_archived)
        .bind(board_id)
        .execute(&state.db)
        .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response();
    }

    if new_archived {
        let _ = sqlx::query(
            "UPDATE conversation_user_settings SET kanban_board_id = NULL WHERE kanban_board_id = $1",
        )
        .bind(board_id)
        .execute(&state.db)
        .await;
    }

    invalidate_board_cache(&state.redis, board_id).await;

    Json(json!({ "ok": true, "archived": new_archived })).into_response()
}

/// DELETE /api/v1/kanban/boards/{id} — permanently delete a board and all its data
async fn hard_delete_board(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(board_id): Path<Uuid>,
) -> Response {
    let owner_id = owner_id_str(&caller);
    if let Err(e) = verify_board_owner(&state.db, board_id, &owner_id).await {
        return e;
    }

    // Clear any conversation preferences pointing to this board
    let _ = sqlx::query(
        "UPDATE conversation_user_settings SET kanban_board_id = NULL WHERE kanban_board_id = $1",
    )
    .bind(board_id)
    .execute(&state.db)
    .await;

    // Invalidate cache before delete since board won't exist after
    invalidate_board_cache(&state.redis, board_id).await;

    // CASCADE handles columns, cards, labels, card_agents, card_labels, card_commits, card_notes
    if let Err(e) = sqlx::query("DELETE FROM kanban_boards WHERE id = $1")
        .bind(board_id)
        .execute(&state.db)
        .await
    {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response();
    }

    StatusCode::NO_CONTENT.into_response()
}

// ── Columns ──────────────────────────────────────────────────────

/// GET /api/v1/kanban/boards/{id}/columns
async fn list_columns(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(board_id): Path<Uuid>,
) -> Response {
    let owner_id = owner_id_str(&caller);
    if let Err(e) = verify_board_owner(&state.db, board_id, &owner_id).await {
        return e;
    }

    // For agent callers, check board-level agent permissions
    if let Some(agent_id) = caller.agent_id() {
        let granted = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM board_agent_permissions WHERE board_id = $1 AND agent_id = $2",
        )
        .bind(board_id)
        .bind(agent_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

        if granted == 0 {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Agent does not have access to this board" })),
            )
                .into_response();
        }
    }

    let cols = sqlx::query_as::<_, ColumnRow>(
        "SELECT id, board_id, name, sort_order FROM kanban_columns WHERE board_id = $1 ORDER BY sort_order",
    )
    .bind(board_id)
    .fetch_all(&state.db)
    .await;

    match cols {
        Ok(rows) => Json(json!(rows)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// POST /api/v1/kanban/boards/{id}/columns
async fn create_column(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(board_id): Path<Uuid>,
    Json(body): Json<CreateColumnBody>,
) -> Response {
    let owner_id = owner_id_str(&caller);
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
            invalidate_board_cache(&state.redis, board_id).await;
            let members = get_board_member_ids(&state.db, board_id).await;
            state.ws.broadcast_to_members(
                &members,
                &json!({
                    "type": "kanban_update",
                    "boardId": board_id,
                    "action": "column_created",
                    "data": &c,
                }),
                &state.redis,
            );
            (StatusCode::CREATED, Json(json!(c))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// PATCH /api/v1/kanban/columns/{id}
async fn update_column(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(column_id): Path<Uuid>,
    Json(body): Json<UpdateColumnBody>,
) -> Response {
    let owner_id = owner_id_str(&caller);
    if let Err(e) = verify_column_owner(&state.db, column_id, &owner_id).await {
        return e;
    }

    if body.name.is_none() && body.sort_order.is_none() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Nothing to update" })))
            .into_response();
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
                invalidate_board_cache(&state.redis, bid).await;
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(
                    &members,
                    &json!({
                        "type": "kanban_update",
                        "boardId": bid,
                        "action": "column_updated",
                        "data": { "columnId": column_id },
                    }),
                    &state.redis,
                );
            }
            Json(json!({ "ok": true })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// DELETE /api/v1/kanban/columns/{id}
async fn delete_column(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(column_id): Path<Uuid>,
) -> Response {
    let owner_id = owner_id_str(&caller);
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
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Cannot delete column with cards. Move or archive cards first." })),
        )
            .into_response();
    }

    let bid = board_id_from_column(&state.db, column_id).await;

    let result = sqlx::query("DELETE FROM kanban_columns WHERE id = $1")
        .bind(column_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => {
            if let Some(bid) = bid {
                invalidate_board_cache(&state.redis, bid).await;
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(
                    &members,
                    &json!({
                        "type": "kanban_update",
                        "boardId": bid,
                        "action": "column_deleted",
                        "data": { "columnId": column_id },
                    }),
                    &state.redis,
                );
            }
            Json(json!({ "ok": true })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// POST /api/v1/kanban/boards/{id}/columns/reorder
async fn reorder_columns(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(board_id): Path<Uuid>,
    Json(body): Json<ReorderColumnsBody>,
) -> Response {
    let owner_id = owner_id_str(&caller);
    if let Err(e) = verify_board_owner(&state.db, board_id, &owner_id).await {
        return e;
    }

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
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "columnIds must contain exactly all columns of this board with no duplicates" })),
        )
            .into_response();
    }

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
                .into_response()
        }
    };
    for (i, col_id) in body.column_ids.iter().enumerate() {
        if let Err(e) =
            sqlx::query("UPDATE kanban_columns SET sort_order = $1 WHERE id = $2 AND board_id = $3")
                .bind(i as i32)
                .bind(col_id)
                .bind(board_id)
                .execute(&mut *tx)
                .await
        {
            let _ = tx.rollback().await;
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
                .into_response();
        }
    }
    if let Err(e) = tx.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response();
    }

    invalidate_board_cache(&state.redis, board_id).await;

    Json(json!({ "ok": true })).into_response()
}

// ── Cards ────────────────────────────────────────────────────────

/// GET /api/v1/kanban/cards
async fn list_cards(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Query(query): Query<ListCardsQuery>,
) -> Response {
    let owner_id = owner_id_str(&caller);

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
            format!(
                " AND (c.title ILIKE '%{}%' OR c.description ILIKE '%{}%')",
                escaped, escaped
            )
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let perm_filter = if caller.is_agent() {
        " AND EXISTS (SELECT 1 FROM board_agent_permissions WHERE board_id = b.id AND agent_id = $2)"
    } else {
        ""
    };

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
             {}{}
           ORDER BY c.updated_at DESC NULLS LAST, c.id"#,
        perm_filter, search_cond
    );

    let rows = if caller.is_agent() {
        sqlx::query_as::<_, CardWithLabelRow>(&sql)
            .bind(&owner_id)
            .bind(caller.agent_id().unwrap())
            .fetch_all(&state.db)
            .await
    } else {
        sqlx::query_as::<_, CardWithLabelRow>(&sql)
            .bind(&owner_id)
            .fetch_all(&state.db)
            .await
    };

    match rows {
        Ok(rows) => {
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

/// POST /api/v1/kanban/cards
async fn create_card(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Json(body): Json<CreateCardBody>,
) -> Response {
    let owner_id = owner_id_str(&caller);

    // If columnId is provided without boardId, resolve board from the column
    let board_id = if body.board_id.is_none() && body.column_id.is_some() {
        let col_id = body.column_id.unwrap();
        match sqlx::query_scalar::<_, Uuid>(
            "SELECT board_id FROM kanban_columns WHERE id = $1",
        )
        .bind(col_id)
        .fetch_optional(&state.db)
        .await
        {
            Ok(Some(bid)) => {
                if let Err(e) = verify_board_owner(&state.db, bid, &owner_id).await {
                    return e;
                }
                if let Some(agent_id) = caller.agent_id() {
                    let has_perm = sqlx::query_scalar::<_, bool>(
                        "SELECT EXISTS(SELECT 1 FROM board_agent_permissions WHERE board_id = $1 AND agent_id = $2)",
                    )
                    .bind(bid)
                    .bind(agent_id)
                    .fetch_one(&state.db)
                    .await
                    .unwrap_or(false);
                    if !has_perm {
                        return (StatusCode::FORBIDDEN, Json(json!({"error": "Agent does not have permission for this board"}))).into_response();
                    }
                }
                bid
            }
            _ => return (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid columnId"}))).into_response(),
        }
    } else if let Some(bid) = body.board_id {
        if let Err(e) = verify_board_owner(&state.db, bid, &owner_id).await {
            return e;
        }
        // For agents, check board-level permission
        if let Some(agent_id) = caller.agent_id() {
            let has_perm = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM board_agent_permissions WHERE board_id = $1 AND agent_id = $2)",
            )
            .bind(bid)
            .bind(agent_id)
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
        }
        bid
    } else if let Some(agent_id) = caller.agent_id() {
        // Agent without board_id — find first permitted board
        let permitted_board = sqlx::query_scalar::<_, Uuid>(
            r#"SELECT bap.board_id FROM board_agent_permissions bap
               JOIN kanban_boards kb ON kb.id = bap.board_id
               WHERE bap.agent_id = $1 AND kb.owner_id = $2 AND kb.archived = false
               ORDER BY kb.created_at LIMIT 1"#,
        )
        .bind(agent_id)
        .bind(&owner_id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        match permitted_board {
            Some(id) => id,
            None => {
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
                    None => {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({ "error": "No board available. User must create a board first." })),
                        )
                            .into_response()
                    }
                };
                // Auto-grant agent permission
                let _ = sqlx::query(
                    "INSERT INTO board_agent_permissions (board_id, agent_id, granted_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                )
                .bind(default_id)
                .bind(agent_id)
                .bind(owner_id.to_string())
                .execute(&state.db)
                .await;
                default_id
            }
        }
    } else {
        // User without board_id — find first non-archived board
        match sqlx::query_scalar::<_, Uuid>(
            "SELECT id FROM kanban_boards WHERE owner_id = $1 AND archived = false ORDER BY created_at LIMIT 1",
        )
        .bind(&owner_id)
        .fetch_optional(&state.db)
        .await
        {
            Ok(Some(id)) => id,
            _ => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "No board available. Create a board first." })),
                )
                    .into_response()
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
        if valid {
            Some(cid)
        } else {
            None
        }
    } else {
        None
    };

    let column_id = match column_id {
        Some(id) => id,
        None => {
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

    // created_by: agent_id for agents, owner_id for users
    let created_by = if let Some(agent_id) = caller.agent_id() {
        agent_id.to_string()
    } else {
        owner_id.clone()
    };

    let result = sqlx::query_as::<_, CardRow>(
        r#"INSERT INTO kanban_cards (column_id, title, description, priority, sort_order, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, column_id, title, description, priority, due_date, sort_order, created_by, created_at, updated_at, share_token, COALESCE(is_public, false) AS is_public"#,
    )
    .bind(column_id)
    .bind(&body.title)
    .bind(&body.description)
    .bind(body.priority.as_deref().unwrap_or("medium"))
    .bind(0)
    .bind(&created_by)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(card) => {
            // Auto-assign the agent to the card (if caller is an agent)
            if let Some(agent_id) = caller.agent_id() {
                let _ = sqlx::query(
                    "INSERT INTO kanban_card_agents (card_id, agent_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                )
                .bind(card.id)
                .bind(agent_id.to_string())
                .execute(&state.db)
                .await;
            }

            invalidate_board_cache(&state.redis, board_id).await;

            if let Some(bid) = board_id_from_card(&state.db, card.id).await {
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(
                    &members,
                    &json!({
                        "type": "kanban_update",
                        "boardId": bid,
                        "action": "card_created",
                        "data": &card,
                    }),
                    &state.redis,
                );
            }

            (StatusCode::CREATED, Json(json!(card))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// PATCH /api/v1/kanban/cards/{id}
async fn update_card(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(card_id): Path<Uuid>,
    Json(body): Json<UpdateCardBody>,
) -> Response {
    if body.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "No fields to update" })))
            .into_response();
    }

    let owner_id = owner_id_str(&caller);
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
                invalidate_board_cache(&state.redis, bid).await;
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(
                    &members,
                    &json!({
                        "type": "kanban_update",
                        "boardId": bid,
                        "action": "card_updated",
                        "data": { "cardId": card_id },
                    }),
                    &state.redis,
                );
            }
            Json(json!({ "ok": true })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// DELETE /api/v1/kanban/cards/{id}
async fn delete_card(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(card_id): Path<Uuid>,
) -> Response {
    let owner_id = owner_id_str(&caller);
    if let Err(e) = verify_card_owner(&state.db, card_id, &owner_id).await {
        return e;
    }

    let bid = board_id_from_card(&state.db, card_id).await;

    let result = sqlx::query("DELETE FROM kanban_cards WHERE id = $1")
        .bind(card_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => {
            if let Some(bid) = bid {
                invalidate_board_cache(&state.redis, bid).await;
                let members = get_board_member_ids(&state.db, bid).await;
                state.ws.broadcast_to_members(
                    &members,
                    &json!({
                        "type": "kanban_update",
                        "boardId": bid,
                        "action": "card_deleted",
                        "data": { "cardId": card_id },
                    }),
                    &state.redis,
                );
            }
            Json(json!({ "ok": true })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// POST /api/v1/kanban/cards/{id}/complete
async fn complete_card(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(card_id): Path<Uuid>,
) -> Response {
    let owner_id = owner_id_str(&caller);
    if let Err(e) = verify_card_owner(&state.db, card_id, &owner_id).await {
        return e;
    }

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
            if let Some(bid) = board_id_from_card(&state.db, card_id).await {
                invalidate_board_cache(&state.redis, bid).await;
            }
            Json(json!({ "ok": true })).into_response()
        }
        _ => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Done column not found" })),
        )
            .into_response(),
    }
}

/// GET /api/v1/kanban/boards/{id}/archived-cards
async fn list_archived_cards(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(board_id): Path<Uuid>,
    Query(params): Query<PaginationQuery>,
) -> Response {
    let owner_id = owner_id_str(&caller);
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

// ── Card Commits ─────────────────────────────────────────────────

/// GET /api/v1/kanban/cards/{cardId}/commits
async fn list_card_commits(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(card_id): Path<Uuid>,
) -> Response {
    let owner_id = owner_id_str(&caller);
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
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// POST /api/v1/kanban/cards/{cardId}/commits
async fn add_card_commit(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(card_id): Path<Uuid>,
    Json(body): Json<AddCommitBody>,
) -> Response {
    let owner_id = owner_id_str(&caller);
    if let Err(e) = verify_card_owner(&state.db, card_id, &owner_id).await {
        return e;
    }

    let hash = body.commit_hash.trim();
    if hash.is_empty() || hash.len() > 40 {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Invalid commit hash" })))
            .into_response();
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
        Ok(_) => {
            if let Some(bid) = board_id_from_card(&state.db, card_id).await {
                invalidate_board_cache(&state.redis, bid).await;
            }
            StatusCode::CREATED.into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

// ── Card Notes ───────────────────────────────────────────────────

/// GET /api/v1/kanban/cards/{id}/notes
async fn list_card_notes(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(card_id): Path<Uuid>,
) -> Response {
    let owner_id = owner_id_str(&caller);
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

/// POST /api/v1/kanban/cards/{id}/notes
async fn link_note_to_card(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(card_id): Path<Uuid>,
    Json(body): Json<LinkNoteBody>,
) -> Response {
    let owner_id = owner_id_str(&caller);
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
        Ok(_) => {
            if let Some(bid) = board_id_from_card(&state.db, card_id).await {
                invalidate_board_cache(&state.redis, bid).await;
            }
            Json(json!({ "linked": true })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// DELETE /api/v1/kanban/cards/{card_id}/notes/{note_id}
async fn unlink_note_from_card(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path((card_id, note_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let owner_id = owner_id_str(&caller);
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
        Ok(_) => {
            if let Some(bid) = board_id_from_card(&state.db, card_id).await {
                invalidate_board_cache(&state.redis, bid).await;
            }
            StatusCode::NO_CONTENT.into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

// ── Labels ───────────────────────────────────────────────────────

/// GET /api/v1/kanban/boards/{id}/labels
async fn list_board_labels(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(board_id): Path<Uuid>,
) -> Response {
    let owner_id = owner_id_str(&caller);
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
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// POST /api/v1/kanban/boards/{id}/labels
async fn create_label(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(board_id): Path<Uuid>,
    Json(body): Json<CreateLabelBody>,
) -> Response {
    let owner_id = owner_id_str(&caller);
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
        Ok(l) => {
            invalidate_board_cache(&state.redis, board_id).await;
            (StatusCode::CREATED, Json(json!(l))).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// PATCH /api/v1/kanban/labels/{id}
async fn update_label(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(label_id): Path<Uuid>,
    Json(body): Json<UpdateLabelBody>,
) -> Response {
    let owner_id = owner_id_str(&caller);
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
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
                .into_response();
        }
    }
    if let Some(color) = &body.color {
        if let Err(e) = sqlx::query("UPDATE kanban_labels SET color = $1 WHERE id = $2")
            .bind(color)
            .bind(label_id)
            .execute(&state.db)
            .await
        {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
                .into_response();
        }
    }

    if let Ok(Some(bid)) = sqlx::query_scalar::<_, Uuid>(
        "SELECT board_id FROM kanban_labels WHERE id = $1"
    ).bind(label_id).fetch_optional(&state.db).await {
        invalidate_board_cache(&state.redis, bid).await;
    }

    let label = sqlx::query_as::<_, LabelRow>(
        "SELECT id, board_id, name, color FROM kanban_labels WHERE id = $1",
    )
    .bind(label_id)
    .fetch_one(&state.db)
    .await;

    match label {
        Ok(l) => Json(json!(l)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// DELETE /api/v1/kanban/labels/{id}
async fn delete_label(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(label_id): Path<Uuid>,
) -> Response {
    let owner_id = owner_id_str(&caller);
    if let Err(e) = verify_label_owner(&state.db, label_id, &owner_id).await {
        return e;
    }

    let label_board_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT board_id FROM kanban_labels WHERE id = $1"
    ).bind(label_id).fetch_optional(&state.db).await.ok().flatten();

    let result = sqlx::query("DELETE FROM kanban_labels WHERE id = $1")
        .bind(label_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => {
            if let Some(bid) = label_board_id {
                invalidate_board_cache(&state.redis, bid).await;
            }
            StatusCode::NO_CONTENT.into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// POST /api/v1/kanban/cards/{id}/labels
async fn add_label_to_card(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path(card_id): Path<Uuid>,
    Json(body): Json<AddCardLabelBody>,
) -> Response {
    let owner_id = owner_id_str(&caller);
    if let Err(e) = verify_card_owner(&state.db, card_id, &owner_id).await {
        return e;
    }

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
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Label does not belong to the same board" })),
        )
            .into_response();
    }

    let result = sqlx::query(
        "INSERT INTO kanban_card_labels (card_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(card_id)
    .bind(body.label_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            if let Some(bid) = board_id_from_card(&state.db, card_id).await {
                invalidate_board_cache(&state.redis, bid).await;
            }
            Json(json!({ "linked": true })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// DELETE /api/v1/kanban/cards/{cardId}/labels/{labelId}
async fn remove_label_from_card(
    State(state): State<AppState>,
    caller: CallerIdentity,
    Path((card_id, label_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let owner_id = owner_id_str(&caller);
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
        Ok(_) => {
            if let Some(bid) = board_id_from_card(&state.db, card_id).await {
                invalidate_board_cache(&state.redis, bid).await;
            }
            StatusCode::NO_CONTENT.into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}
