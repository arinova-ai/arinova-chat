use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, patch, put},
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
        .route(
            "/api/notebooks/{id}/capsule-links",
            get(get_capsule_links).put(set_capsule_links),
        )
        .route(
            "/api/notebooks/{id}/agent-permissions",
            get(get_agent_permissions).put(set_agent_permissions),
        )
        .route(
            "/api/notebooks/{id}/members",
            get(list_notebook_members).post(add_notebook_member),
        )
        .route(
            "/api/notebooks/{notebookId}/members/{userId}",
            patch(update_notebook_member).delete(remove_notebook_member),
        )
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
    archived: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    note_count: Option<i64>,
    owner_username: Option<String>,
    permission: Option<String>,
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
    archived: Option<bool>,
}

// ===== Helpers =====

/// Ensure the user has a default notebook; create one if missing.
/// Also backfill any notes without notebook_id into the default notebook.
pub(crate) async fn ensure_default_notebook(db: &sqlx::PgPool, user_id: &str) -> Result<(), sqlx::Error> {
    // Upsert: insert if no default exists (partial unique index prevents duplicates)
    sqlx::query(
        "INSERT INTO notebooks (owner_id, name, is_default, sort_order) VALUES ($1, 'My Notebook', true, 0) ON CONFLICT DO NOTHING",
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
        "UPDATE notes SET notebook_id = $1 WHERE owner_id = $2 AND notebook_id IS NULL",
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
        "archived": row.archived,
        "noteCount": row.note_count.unwrap_or(0),
        "createdAt": row.created_at.to_rfc3339(),
        "updatedAt": row.updated_at.to_rfc3339(),
        "ownerUsername": row.owner_username,
        "permission": row.permission.as_deref().unwrap_or("owner"),
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
        SELECT n.id, n.owner_id, n.name, n.is_default, n.sort_order, n.include_in_capsule, COALESCE(n.archived, false) AS archived, n.created_at, n.updated_at,
               (SELECT COUNT(*) FROM notes cn WHERE cn.notebook_id = n.id) AS note_count,
               u.username AS owner_username,
               'owner'::text AS permission
        FROM notebooks n
        JOIN "user" u ON u.id = n.owner_id
        WHERE n.owner_id = $1
        UNION ALL
        SELECT n.id, n.owner_id, n.name, n.is_default, n.sort_order, n.include_in_capsule, COALESCE(n.archived, false) AS archived, n.created_at, n.updated_at,
               (SELECT COUNT(*) FROM notes cn WHERE cn.notebook_id = n.id) AS note_count,
               u.username AS owner_username,
               nm.permission
        FROM notebooks n
        JOIN notebook_members nm ON nm.notebook_id = n.id
        JOIN "user" u ON u.id = n.owner_id
        WHERE nm.user_id = $1
        ORDER BY sort_order, created_at
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
    // Check plan limit
    if !super::user_settings::can_create_notebook(&state.db, &user.id).await.unwrap_or(false) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "plan_limit", "message": "Upgrade your plan to create more notebooks"})),
        )
            .into_response();
    }

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
        RETURNING id, owner_id, name, is_default, sort_order, include_in_capsule, COALESCE(archived, false) AS archived, created_at, updated_at, 0::bigint AS note_count, NULL::text AS owner_username, 'owner'::text AS permission
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
    if body.name.is_none() && body.sort_order.is_none() && body.include_in_capsule.is_none() && body.archived.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Nothing to update"})),
        )
            .into_response();
    }

    // Verify ownership
    let owner: Option<(String, bool)> =
        sqlx::query_as("SELECT owner_id, is_default FROM notebooks WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);

    match &owner {
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Notebook not found"})),
            )
                .into_response()
        }
        Some((oid, _)) if *oid != user.id => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Not authorized"})),
            )
                .into_response()
        }
        _ => {}
    }

    // Prevent archiving the last non-archived notebook
    if body.archived == Some(true) {
        let active_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM notebooks WHERE owner_id = $1 AND COALESCE(archived, false) = false",
        )
        .bind(&user.id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

        if active_count <= 1 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Cannot archive the last notebook"})),
            )
                .into_response();
        }
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
    if body.archived.is_some() {
        sets.push(format!("archived = ${idx}"));
        idx += 1;
    }

    let sql = format!(
        "UPDATE notebooks SET {} WHERE id = ${} RETURNING id, owner_id, name, is_default, sort_order, include_in_capsule, COALESCE(archived, false) AS archived, created_at, updated_at, 0::bigint AS note_count, NULL::text AS owner_username, 'owner'::text AS permission",
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
    if let Some(archived) = body.archived {
        q = q.bind(archived);
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

/// DELETE /api/notebooks/:id — delete notebook (must be archived first, cannot delete default)
async fn delete_notebook(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let row: Option<(String, bool, bool)> =
        sqlx::query_as("SELECT owner_id, is_default, COALESCE(archived, false) FROM notebooks WHERE id = $1")
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
        Some((oid, _, _)) if oid != user.id => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Not authorized"})),
            )
                .into_response()
        }
        Some((_, true, _)) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Cannot delete default notebook"})),
            )
                .into_response()
        }
        Some((_, _, false)) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Notebook must be archived before deleting"})),
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
            "UPDATE notes SET notebook_id = $1 WHERE notebook_id = $2",
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
#[derive(Deserialize)]
struct ListNotebookNotesQuery {
    #[serde(default)]
    archived: Option<bool>,
}

async fn list_notebook_notes(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Query(query): Query<ListNotebookNotesQuery>,
) -> Response {
    // Verify ownership or membership
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
            // Not owner — check if shared member
            let is_member = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM notebook_members WHERE notebook_id = $1 AND user_id = $2)",
            )
            .bind(id)
            .bind(&user.id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(false);

            if !is_member {
                return (
                    StatusCode::FORBIDDEN,
                    Json(json!({"error": "Not authorized"})),
                )
                    .into_response();
            }
        }
        _ => {}
    }

    #[derive(FromRow)]
    struct NoteListRow {
        id: Uuid,
        title: String,
        tags: Vec<String>,
        is_pinned: bool,
        #[allow(dead_code)]
        archived_at: Option<DateTime<Utc>>,
        created_at: DateTime<Utc>,
        updated_at: DateTime<Utc>,
    }

    let show_archived = query.archived.unwrap_or(false);
    let rows = sqlx::query_as::<_, NoteListRow>(
        if show_archived {
            r#"
            SELECT id, title, tags,
                   COALESCE(is_pinned, false) AS is_pinned,
                   archived_at, created_at, updated_at
            FROM notes
            WHERE notebook_id = $1 AND archived_at IS NOT NULL
            ORDER BY archived_at DESC
            "#
        } else {
            r#"
            SELECT id, title, tags,
                   COALESCE(is_pinned, false) AS is_pinned,
                   archived_at, created_at, updated_at
            FROM notes
            WHERE notebook_id = $1 AND archived_at IS NULL
            ORDER BY is_pinned DESC, updated_at DESC
            "#
        },
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

// ===== Capsule Links =====

/// GET /api/notebooks/:id/capsule-links — list capsule IDs linked to this notebook
async fn get_capsule_links(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    // Verify ownership
    let owner = sqlx::query_scalar::<_, String>("SELECT owner_id FROM notebooks WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await;
    match owner {
        Ok(Some(oid)) if oid == user.id => {}
        Ok(Some(_)) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Not your notebook"}))).into_response(),
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Notebook not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }

    let rows = sqlx::query_as::<_, (Uuid,)>(
        "SELECT capsule_id FROM notebook_capsule_links WHERE notebook_id = $1",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(ids) => {
            let capsule_ids: Vec<String> = ids.iter().map(|(cid,)| cid.to_string()).collect();
            Json(json!({ "capsuleIds": capsule_ids })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetCapsuleLinksBody {
    capsule_ids: Vec<Uuid>,
}

/// PUT /api/notebooks/:id/capsule-links — replace all capsule links for this notebook
async fn set_capsule_links(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<SetCapsuleLinksBody>,
) -> Response {
    // Verify ownership
    let owner = sqlx::query_scalar::<_, String>("SELECT owner_id FROM notebooks WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await;
    match owner {
        Ok(Some(oid)) if oid == user.id => {}
        Ok(Some(_)) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Not your notebook"}))).into_response(),
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Notebook not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }

    // Verify all capsule_ids belong to this user
    if !body.capsule_ids.is_empty() {
        let owned_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM memory_capsules WHERE id = ANY($1) AND owner_id = $2",
        )
        .bind(&body.capsule_ids)
        .bind(&user.id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

        if owned_count != body.capsule_ids.len() as i64 {
            return (StatusCode::FORBIDDEN, Json(json!({"error": "Some capsules do not belong to you"}))).into_response();
        }
    }

    // Replace links in a transaction
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    if let Err(e) = sqlx::query("DELETE FROM notebook_capsule_links WHERE notebook_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await
    {
        let _ = tx.rollback().await;
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response();
    }

    for cid in &body.capsule_ids {
        if let Err(e) = sqlx::query(
            "INSERT INTO notebook_capsule_links (notebook_id, capsule_id) VALUES ($1, $2)",
        )
        .bind(id)
        .bind(cid)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response();
        }
    }

    // Also update legacy include_in_capsule flag for backward compat
    let include = !body.capsule_ids.is_empty();
    let _ = sqlx::query("UPDATE notebooks SET include_in_capsule = $1 WHERE id = $2")
        .bind(include)
        .bind(id)
        .execute(&mut *tx)
        .await;

    if let Err(e) = tx.commit().await {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response();
    }

    let capsule_ids: Vec<String> = body.capsule_ids.iter().map(|c| c.to_string()).collect();
    Json(json!({ "capsuleIds": capsule_ids })).into_response()
}

// ===== Agent Permissions =====

/// GET /api/notebooks/:id/agent-permissions — list agent IDs with access to this notebook
async fn get_agent_permissions(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let owner = sqlx::query_scalar::<_, String>("SELECT owner_id FROM notebooks WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await;
    match owner {
        Ok(Some(oid)) if oid == user.id => {}
        Ok(Some(_)) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Not your notebook"}))).into_response(),
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Notebook not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }

    let rows = sqlx::query_as::<_, (Uuid,)>(
        "SELECT agent_id FROM notebook_agent_permissions WHERE notebook_id = $1",
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
struct SetAgentPermissionsBody {
    agent_ids: Vec<Uuid>,
}

/// PUT /api/notebooks/:id/agent-permissions — replace all agent permissions for this notebook
async fn set_agent_permissions(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<SetAgentPermissionsBody>,
) -> Response {
    let owner = sqlx::query_scalar::<_, String>("SELECT owner_id FROM notebooks WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await;
    match owner {
        Ok(Some(oid)) if oid == user.id => {}
        Ok(Some(_)) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Not your notebook"}))).into_response(),
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Notebook not found"}))).into_response(),
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

    // Replace permissions in a transaction
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    if let Err(e) = sqlx::query("DELETE FROM notebook_agent_permissions WHERE notebook_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await
    {
        let _ = tx.rollback().await;
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response();
    }

    for aid in &body.agent_ids {
        if let Err(e) = sqlx::query(
            "INSERT INTO notebook_agent_permissions (notebook_id, agent_id, granted_by) VALUES ($1, $2, $3)",
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

// ===== Notebook Members (Sharing) =====

#[derive(Deserialize)]
struct AddNotebookMemberBody {
    username: String,
    #[serde(default = "default_view_perm")]
    permission: String,
}
fn default_view_perm() -> String { "view".to_string() }

#[derive(Deserialize)]
struct UpdateNotebookMemberBody {
    permission: String,
}

/// GET /api/notebooks/:id/members
async fn list_notebook_members(
    State(state): State<AppState>,
    user: AuthUser,
    Path(notebook_id): Path<Uuid>,
) -> Response {
    // Verify access (owner or member)
    let has_access = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM notebooks WHERE id = $1 AND owner_id = $2
            UNION ALL
            SELECT 1 FROM notebook_members WHERE notebook_id = $1 AND user_id = $2
        )"#,
    )
    .bind(notebook_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !has_access {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Access denied"}))).into_response();
    }

    let members = sqlx::query_as::<_, (String, Option<String>, String, DateTime<Utc>)>(
        r#"SELECT nm.user_id, u.username, nm.permission, nm.created_at
           FROM notebook_members nm
           JOIN "user" u ON u.id = nm.user_id
           WHERE nm.notebook_id = $1
           ORDER BY nm.created_at"#,
    )
    .bind(notebook_id)
    .fetch_all(&state.db)
    .await;

    let owner = sqlx::query_as::<_, (String, Option<String>)>(
        r#"SELECT n.owner_id, u.username FROM notebooks n JOIN "user" u ON u.id = n.owner_id WHERE n.id = $1"#,
    )
    .bind(notebook_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    match members {
        Ok(rows) => {
            let items: Vec<_> = rows.iter().map(|(uid, uname, perm, created)| json!({
                "userId": uid,
                "username": uname,
                "permission": perm,
                "createdAt": created.to_rfc3339(),
            })).collect();
            Json(json!({
                "owner": owner.map(|(uid, uname)| json!({"userId": uid, "username": uname})),
                "members": items,
            })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// POST /api/notebooks/:id/members — owner or admin can invite
async fn add_notebook_member(
    State(state): State<AppState>,
    user: AuthUser,
    Path(notebook_id): Path<Uuid>,
    Json(body): Json<AddNotebookMemberBody>,
) -> Response {
    let is_owner = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM notebooks WHERE id = $1 AND owner_id = $2)",
    )
    .bind(notebook_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    let is_admin = if !is_owner {
        sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM notebook_members WHERE notebook_id = $1 AND user_id = $2 AND permission = 'admin')",
        )
        .bind(notebook_id)
        .bind(&user.id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false)
    } else { false };

    if !is_owner && !is_admin {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Only owner or admin can invite"}))).into_response();
    }

    if !["view", "edit", "admin"].contains(&body.permission.as_str()) {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid permission"}))).into_response();
    }

    if body.permission == "admin" && !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Only owner can grant admin"}))).into_response();
    }

    let target_id = sqlx::query_scalar::<_, String>(
        r#"SELECT id FROM "user" WHERE username = $1"#,
    )
    .bind(&body.username)
    .fetch_optional(&state.db)
    .await;

    let target_id = match target_id {
        Ok(Some(id)) => id,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "User not found"}))).into_response(),
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };

    if target_id == user.id {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Cannot add yourself"}))).into_response();
    }

    let result = sqlx::query(
        "INSERT INTO notebook_members (notebook_id, user_id, permission, invited_by) VALUES ($1, $2, $3, $4) ON CONFLICT (notebook_id, user_id) DO UPDATE SET permission = $3",
    )
    .bind(notebook_id)
    .bind(&target_id)
    .bind(&body.permission)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::CREATED, Json(json!({
            "userId": target_id,
            "username": body.username,
            "permission": body.permission,
        }))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// PATCH /api/notebooks/:notebookId/members/:userId
async fn update_notebook_member(
    State(state): State<AppState>,
    user: AuthUser,
    Path((notebook_id, target_user_id)): Path<(Uuid, String)>,
    Json(body): Json<UpdateNotebookMemberBody>,
) -> Response {
    let is_owner = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM notebooks WHERE id = $1 AND owner_id = $2)",
    )
    .bind(notebook_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Only owner can change permissions"}))).into_response();
    }

    if !["view", "edit", "admin"].contains(&body.permission.as_str()) {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid permission"}))).into_response();
    }

    let result = sqlx::query(
        "UPDATE notebook_members SET permission = $1 WHERE notebook_id = $2 AND user_id = $3",
    )
    .bind(&body.permission)
    .bind(notebook_id)
    .bind(&target_user_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Json(json!({"ok": true})).into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Member not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// DELETE /api/notebooks/:notebookId/members/:userId
async fn remove_notebook_member(
    State(state): State<AppState>,
    user: AuthUser,
    Path((notebook_id, target_user_id)): Path<(Uuid, String)>,
) -> Response {
    let is_owner = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM notebooks WHERE id = $1 AND owner_id = $2)",
    )
    .bind(notebook_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !is_owner && user.id != target_user_id {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Only owner can remove members"}))).into_response();
    }

    let result = sqlx::query(
        "DELETE FROM notebook_members WHERE notebook_id = $1 AND user_id = $2",
    )
    .bind(notebook_id)
    .bind(&target_user_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Member not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}
