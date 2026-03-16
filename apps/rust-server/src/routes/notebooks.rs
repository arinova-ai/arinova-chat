use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, patch},
    Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/notebooks", get(list_notebooks).post(create_notebook))
        .route(
            "/api/notebooks/{id}",
            patch(update_notebook).delete(delete_notebook),
        )
        .route("/api/notebooks/{id}/notes", get(list_notebook_notes))
}

// ===== Types =====

#[derive(Debug, FromRow)]
struct NotebookRow {
    id: Uuid,
    owner_id: String,
    name: String,
    is_default: bool,
    sort_order: i32,
    include_in_capsule: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    note_count: Option<i64>,
}

#[derive(Deserialize)]
struct CreateNotebookBody {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateNotebookBody {
    name: Option<String>,
    sort_order: Option<i32>,
    include_in_capsule: Option<bool>,
}

// ===== Helpers =====

/// Ensure the user has a default notebook; create one if missing.
/// Also backfill any notes without notebook_id into the default notebook.
pub(crate) async fn ensure_default_notebook(db: &sqlx::PgPool, user_id: &str) -> Result<(), sqlx::Error> {
    // Upsert: insert if no default exists (partial unique index prevents duplicates)
    sqlx::query(
        "INSERT INTO notebooks (owner_id, name, is_default, sort_order) VALUES ($1, 'My Notes', true, 0) ON CONFLICT DO NOTHING",
    )
    .bind(user_id)
    .execute(db)
    .await?;

    // Fetch the default notebook id (may have been created just now or already existed)
    let default_id: (Uuid,) = sqlx::query_as(
        "SELECT id FROM notebooks WHERE owner_id = $1 AND is_default = true LIMIT 1",
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;

    // Backfill existing notes owned by this user into the default notebook
    sqlx::query(
        "UPDATE conversation_notes SET notebook_id = $1 WHERE owner_id = $2 AND notebook_id IS NULL",
    )
    .bind(default_id.0)
    .bind(user_id)
    .execute(db)
    .await?;

    Ok(())
}

/// Get (or create) the default notebook ID for a user.
pub(crate) async fn get_default_notebook_id(db: &sqlx::PgPool, user_id: &str) -> Result<Uuid, sqlx::Error> {
    ensure_default_notebook(db, user_id).await?;
    let (id,): (Uuid,) = sqlx::query_as(
        "SELECT id FROM notebooks WHERE owner_id = $1 AND is_default = true LIMIT 1",
    )
    .bind(user_id)
    .fetch_one(db)
    .await?;
    Ok(id)
}

fn notebook_to_json(row: &NotebookRow) -> serde_json::Value {
    json!({
        "id": row.id.to_string(),
        "ownerId": &row.owner_id,
        "name": &row.name,
        "isDefault": row.is_default,
        "sortOrder": row.sort_order,
        "includeInCapsule": row.include_in_capsule,
        "noteCount": row.note_count.unwrap_or(0),
        "createdAt": row.created_at.to_rfc3339(),
        "updatedAt": row.updated_at.to_rfc3339(),
    })
}

// ===== Handlers =====

/// GET /api/notebooks — list user's notebooks (auto-creates default if needed)
async fn list_notebooks(
    State(state): State<AppState>,
    user: AuthUser,
) -> Response {
    if let Err(e) = ensure_default_notebook(&state.db, &user.id).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response();
    }

    let rows = sqlx::query_as::<_, NotebookRow>(
        r#"
        SELECT n.id, n.owner_id, n.name, n.is_default, n.sort_order, n.include_in_capsule, n.created_at, n.updated_at,
               (SELECT COUNT(*) FROM conversation_notes cn WHERE cn.notebook_id = n.id) AS note_count
        FROM notebooks n
        WHERE n.owner_id = $1
        ORDER BY n.sort_order, n.created_at
        "#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(notebooks) => {
            let items: Vec<_> = notebooks.iter().map(notebook_to_json).collect();
            Json(json!({ "notebooks": items })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// POST /api/notebooks — create a new notebook
async fn create_notebook(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateNotebookBody>,
) -> Response {
    let name = body.name.trim();
    if name.is_empty() || name.len() > 255 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Name is required (max 255 characters)"})),
        )
            .into_response();
    }

    // Get the next sort_order
    let max_order: Option<(i32,)> = sqlx::query_as(
        "SELECT COALESCE(MAX(sort_order), -1) FROM notebooks WHERE owner_id = $1",
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    let next_order = max_order.map(|r| r.0 + 1).unwrap_or(0);

    let row = sqlx::query_as::<_, NotebookRow>(
        r#"
        INSERT INTO notebooks (owner_id, name, sort_order)
        VALUES ($1, $2, $3)
        RETURNING id, owner_id, name, is_default, sort_order, include_in_capsule, created_at, updated_at, 0::bigint AS note_count
        "#,
    )
    .bind(&user.id)
    .bind(name)
    .bind(next_order)
    .fetch_one(&state.db)
    .await;

    match row {
        Ok(nb) => (StatusCode::CREATED, Json(notebook_to_json(&nb))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// PATCH /api/notebooks/:id — update name or sort_order
async fn update_notebook(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateNotebookBody>,
) -> Response {
    if body.name.is_none() && body.sort_order.is_none() && body.include_in_capsule.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Nothing to update"})),
        )
            .into_response();
    }

    // Verify ownership
    let owner: Option<(String,)> =
        sqlx::query_as("SELECT owner_id FROM notebooks WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);

    match owner {
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Notebook not found"})),
            )
                .into_response()
        }
        Some((oid,)) if oid != user.id => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Not authorized"})),
            )
                .into_response()
        }
        _ => {}
    }

    if let Some(ref name) = body.name {
        let name = name.trim();
        if name.is_empty() || name.len() > 255 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Name is required (max 255 characters)"})),
            )
                .into_response();
        }
    }

    // Build dynamic SET
    let mut sets = vec!["updated_at = NOW()".to_string()];
    let mut idx = 1u32;

    if body.name.is_some() {
        sets.push(format!("name = ${idx}"));
        idx += 1;
    }
    if body.sort_order.is_some() {
        sets.push(format!("sort_order = ${idx}"));
        idx += 1;
    }
    if body.include_in_capsule.is_some() {
        sets.push(format!("include_in_capsule = ${idx}"));
        idx += 1;
    }

    let sql = format!(
        "UPDATE notebooks SET {} WHERE id = ${} RETURNING id, owner_id, name, is_default, sort_order, include_in_capsule, created_at, updated_at, 0::bigint AS note_count",
        sets.join(", "),
        idx
    );

    let mut q = sqlx::query_as::<_, NotebookRow>(&sql);
    if let Some(ref name) = body.name {
        q = q.bind(name.trim());
    }
    if let Some(sort_order) = body.sort_order {
        q = q.bind(sort_order);
    }
    if let Some(include_in_capsule) = body.include_in_capsule {
        q = q.bind(include_in_capsule);
    }
    q = q.bind(id);

    match q.fetch_one(&state.db).await {
        Ok(nb) => Json(notebook_to_json(&nb)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// DELETE /api/notebooks/:id — delete notebook (cannot delete default)
async fn delete_notebook(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let row: Option<(String, bool)> =
        sqlx::query_as("SELECT owner_id, is_default FROM notebooks WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);

    match row {
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Notebook not found"})),
            )
                .into_response()
        }
        Some((oid, _)) if oid != user.id => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Not authorized"})),
            )
                .into_response()
        }
        Some((_, true)) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Cannot delete default notebook"})),
            )
                .into_response()
        }
        _ => {}
    }

    // Move notes in this notebook to the default notebook
    let default_id: Option<(Uuid,)> = sqlx::query_as(
        "SELECT id FROM notebooks WHERE owner_id = $1 AND is_default = true LIMIT 1",
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    if let Some((default_id,)) = default_id {
        let _ = sqlx::query(
            "UPDATE conversation_notes SET notebook_id = $1 WHERE notebook_id = $2",
        )
        .bind(default_id)
        .bind(id)
        .execute(&state.db)
        .await;
    }

    match sqlx::query("DELETE FROM notebooks WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await
    {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/notebooks/:id/notes — list notes in a notebook
async fn list_notebook_notes(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    // Verify ownership
    let owner: Option<(String,)> =
        sqlx::query_as("SELECT owner_id FROM notebooks WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);

    match owner {
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Notebook not found"})),
            )
                .into_response()
        }
        Some((oid,)) if oid != user.id => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Not authorized"})),
            )
                .into_response()
        }
        _ => {}
    }

    #[derive(FromRow)]
    struct NoteListRow {
        id: Uuid,
        conversation_id: Uuid,
        title: String,
        tags: Vec<String>,
        is_pinned: bool,
        #[allow(dead_code)]
        archived_at: Option<DateTime<Utc>>,
        created_at: DateTime<Utc>,
        updated_at: DateTime<Utc>,
    }

    let rows = sqlx::query_as::<_, NoteListRow>(
        r#"
        SELECT id, conversation_id, title, tags,
               COALESCE(is_pinned, false) AS is_pinned,
               archived_at, created_at, updated_at
        FROM conversation_notes
        WHERE notebook_id = $1 AND archived_at IS NULL
        ORDER BY is_pinned DESC, updated_at DESC
        "#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(notes) => {
            let items: Vec<_> = notes
                .iter()
                .map(|n| {
                    json!({
                        "id": n.id.to_string(),
                        "conversationId": n.conversation_id.to_string(),
                        "title": &n.title,
                        "tags": &n.tags,
                        "isPinned": n.is_pinned,
                        "createdAt": n.created_at.to_rfc3339(),
                        "updatedAt": n.updated_at.to_rfc3339(),
                    })
                })
                .collect();
            Json(json!({ "notes": items })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
