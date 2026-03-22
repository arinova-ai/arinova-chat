use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/spaces", get(list_spaces).post(create_space))
        .route("/api/spaces/{id}", get(get_space).delete(delete_space).put(update_space))
        .route("/api/spaces/{id}/sessions", get(list_sessions).post(create_session))
        .route("/api/spaces/{id}/sessions/{session_id}/join", post(join_session))
        .route("/api/spaces/{id}/sessions/{session_id}/leave", post(leave_session))
        .route("/api/spaces/{id}/cover", post(upload_space_cover))
}

// ── Types ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ListQuery {
    search: Option<String>,
    category: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateSpaceBody {
    name: String,
    description: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
    definition: Option<serde_json::Value>,
    is_public: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JoinBody {
    agent_id: Option<Uuid>,
    role: Option<String>,
    control_mode: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct SpaceRow {
    id: Uuid,
    owner_id: String,
    name: String,
    description: String,
    category: String,
    tags: serde_json::Value,
    definition: serde_json::Value,
    is_public: bool,
    created_at: chrono::NaiveDateTime,
    updated_at: chrono::NaiveDateTime,
    cover_image_url: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct OwnerRow {
    id: String,
    name: Option<String>,
    image: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct SessionRow {
    id: Uuid,
    playground_id: Uuid,
    status: String,
    state: serde_json::Value,
    current_phase: Option<String>,
    prize_pool: i32,
    started_at: Option<chrono::NaiveDateTime>,
    finished_at: Option<chrono::NaiveDateTime>,
    created_at: chrono::NaiveDateTime,
    participant_count: Option<i64>,
}

// ── Handlers ────────────────────────────────────────────────

async fn list_spaces(
    State(state): State<AppState>,
    _user: AuthUser,
    Query(q): Query<ListQuery>,
) -> Response {
    let page = q.page.unwrap_or(1).max(1);
    let limit = q.limit.unwrap_or(20).clamp(1, 50);
    let offset = (page - 1) * limit;

    let (search_pattern, category) = (
        q.search.as_deref().map(|s| format!("%{s}%")),
        q.category.clone(),
    );

    let rows = sqlx::query_as::<_, SpaceRow>(
        r#"SELECT id, owner_id, name, description, category::text, tags, definition, is_public, created_at, updated_at, cover_image_url
           FROM playgrounds
           WHERE is_public = true
             AND ($1::text IS NULL OR name ILIKE $1)
             AND ($2::text IS NULL OR category::text = $2)
           ORDER BY created_at DESC
           LIMIT $3 OFFSET $4"#,
    )
    .bind(&search_pattern)
    .bind(&category)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await;

    let total: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM playgrounds
           WHERE is_public = true
             AND ($1::text IS NULL OR name ILIKE $1)
             AND ($2::text IS NULL OR category::text = $2)"#,
    )
    .bind(&search_pattern)
    .bind(&category)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    match rows {
        Ok(spaces) => Json(json!({
            "spaces": spaces,
            "total": total,
            "page": page,
            "totalPages": (total as f64 / limit as f64).ceil() as i64,
        }))
        .into_response(),
        Err(e) => {
            tracing::error!("list_spaces: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to load spaces"}))).into_response()
        }
    }
}

async fn get_space(
    State(state): State<AppState>,
    _user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let space = sqlx::query_as::<_, SpaceRow>(
        r#"SELECT id, owner_id, name, description, category::text, tags, definition, is_public, created_at, updated_at, cover_image_url
           FROM playgrounds WHERE id = $1"#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let space = match space {
        Ok(Some(s)) => s,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Space not found"}))).into_response(),
        Err(e) => {
            tracing::error!("get_space: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response();
        }
    };

    let owner = sqlx::query_as::<_, OwnerRow>(
        r#"SELECT id, name, image FROM "user" WHERE id = $1"#,
    )
    .bind(&space.owner_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    let sessions = sqlx::query_as::<_, SessionRow>(
        r#"SELECT s.id, s.playground_id, s.status::text, s.state, s.current_phase,
                  s.prize_pool, s.started_at, s.finished_at, s.created_at,
                  COUNT(pp.id) FILTER (WHERE pp.is_connected = true) AS participant_count
           FROM playground_sessions s
           LEFT JOIN playground_participants pp ON pp.session_id = s.id
           WHERE s.playground_id = $1
           GROUP BY s.id
           ORDER BY s.created_at DESC"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    Json(json!({
        "id": space.id,
        "ownerId": space.owner_id,
        "name": space.name,
        "description": space.description,
        "category": space.category,
        "tags": space.tags,
        "definition": space.definition,
        "isPublic": space.is_public,
        "createdAt": space.created_at,
        "updatedAt": space.updated_at,
        "owner": owner,
        "sessions": sessions,
    }))
    .into_response()
}

async fn create_space(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateSpaceBody>,
) -> Response {
    // Validate iframeUrl must be https:// if present
    if let Some(ref def) = body.definition {
        if let Some(url) = def.get("iframeUrl").and_then(|v| v.as_str()) {
            if !url.starts_with("https://") {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "iframeUrl must use https://"})),
                )
                    .into_response();
            }
            if url::Url::parse(url).is_err() {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "iframeUrl is not a valid URL"})),
                )
                    .into_response();
            }
        }
    }

    let result = sqlx::query_as::<_, SpaceRow>(
        r#"INSERT INTO playgrounds (owner_id, name, description, category, tags, definition, is_public)
           VALUES ($1, $2, $3, COALESCE($4, 'other')::playground_category, COALESCE($5, '[]'::jsonb), COALESCE($6, '{}'::jsonb), COALESCE($7, true))
           RETURNING id, owner_id, name, description, category::text, tags, definition, is_public, created_at, updated_at"#,
    )
    .bind(&user.id)
    .bind(&body.name)
    .bind(body.description.as_deref().unwrap_or(""))
    .bind(&body.category)
    .bind(serde_json::to_value(&body.tags.unwrap_or_default()).ok())
    .bind(&body.definition)
    .bind(body.is_public)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(space) => (StatusCode::CREATED, Json(json!(space))).into_response(),
        Err(e) => {
            tracing::error!("create_space: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to create space"}))).into_response()
        }
    }
}

async fn delete_space(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let space = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM playgrounds WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match space {
        Ok(Some(owner_id)) if owner_id == user.id => {}
        Ok(Some(_)) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))).into_response(),
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Space not found"}))).into_response(),
        Err(e) => {
            tracing::error!("delete_space: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response();
        }
    }

    let _ = sqlx::query("DELETE FROM playgrounds WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await;

    StatusCode::NO_CONTENT.into_response()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSpaceBody {
    name: Option<String>,
    description: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
    definition: Option<serde_json::Value>,
    is_public: Option<bool>,
    cover_image_url: Option<String>,
}

async fn update_space(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateSpaceBody>,
) -> Response {
    let space = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM playgrounds WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match space {
        Ok(Some(owner_id)) if owner_id == user.id => {}
        Ok(Some(_)) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Forbidden"}))).into_response(),
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Space not found"}))).into_response(),
        Err(e) => {
            tracing::error!("update_space: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response();
        }
    }

    // Build dynamic SET clause
    let mut sets: Vec<String> = vec![];
    let mut idx = 1u32;
    let mut binds: Vec<String> = vec![];

    if let Some(ref name) = body.name {
        idx += 1;
        sets.push(format!("name = ${idx}"));
        binds.push(name.clone());
    }
    if let Some(ref desc) = body.description {
        idx += 1;
        sets.push(format!("description = ${idx}"));
        binds.push(desc.clone());
    }
    if let Some(ref cat) = body.category {
        idx += 1;
        sets.push(format!("category = ${idx}::playground_category"));
        binds.push(cat.clone());
    }
    if let Some(ref cover) = body.cover_image_url {
        idx += 1;
        sets.push(format!("cover_image_url = ${idx}"));
        binds.push(cover.clone());
    }

    sets.push("updated_at = NOW()".to_string());

    if sets.len() <= 1 && body.tags.is_none() && body.definition.is_none() && body.is_public.is_none() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "No fields to update"}))).into_response();
    }

    // For simplicity, update text fields first, then handle JSON/bool separately
    let sql = format!(
        "UPDATE playgrounds SET {} WHERE id = $1",
        sets.join(", ")
    );

    let mut query = sqlx::query(&sql).bind(id);
    for b in &binds {
        query = query.bind(b);
    }

    if let Err(e) = query.execute(&state.db).await {
        tracing::error!("update_space: {e}");
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Update failed"}))).into_response();
    }

    // Handle JSON fields separately for type safety
    if let Some(ref tags) = body.tags {
        let tags_json = serde_json::to_value(tags).unwrap_or_default();
        let _ = sqlx::query("UPDATE playgrounds SET tags = $2 WHERE id = $1")
            .bind(id)
            .bind(tags_json)
            .execute(&state.db)
            .await;
    }
    if let Some(ref definition) = body.definition {
        let _ = sqlx::query("UPDATE playgrounds SET definition = $2 WHERE id = $1")
            .bind(id)
            .bind(definition)
            .execute(&state.db)
            .await;
    }
    if let Some(is_public) = body.is_public {
        let _ = sqlx::query("UPDATE playgrounds SET is_public = $2 WHERE id = $1")
            .bind(id)
            .bind(is_public)
            .execute(&state.db)
            .await;
    }

    (StatusCode::OK, Json(json!({"id": id, "updated": true}))).into_response()
}

async fn list_sessions(
    State(state): State<AppState>,
    _user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let sessions = sqlx::query_as::<_, SessionRow>(
        r#"SELECT s.id, s.playground_id, s.status::text, s.state, s.current_phase,
                  s.prize_pool, s.started_at, s.finished_at, s.created_at,
                  COUNT(pp.id) FILTER (WHERE pp.is_connected = true) AS participant_count
           FROM playground_sessions s
           LEFT JOIN playground_participants pp ON pp.session_id = s.id
           WHERE s.playground_id = $1
           GROUP BY s.id
           ORDER BY s.created_at DESC"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match sessions {
        Ok(s) => Json(json!(s)).into_response(),
        Err(e) => {
            tracing::error!("list_sessions: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response()
        }
    }
}

async fn create_session(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    // Verify space exists
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM playgrounds WHERE id = $1)")
        .bind(id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);

    if !exists {
        return (StatusCode::NOT_FOUND, Json(json!({"error": "Space not found"}))).into_response();
    }

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("create_session begin: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response();
        }
    };

    let session_id: Uuid = match sqlx::query_scalar(
        r#"INSERT INTO playground_sessions (playground_id, status, state)
           VALUES ($1, 'waiting', '{}')
           RETURNING id"#,
    )
    .bind(id)
    .fetch_one(&mut *tx)
    .await
    {
        Ok(sid) => sid,
        Err(e) => {
            tracing::error!("create_session insert: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response();
        }
    };

    // Auto-join the creator
    let _ = sqlx::query(
        r#"INSERT INTO playground_participants (session_id, user_id, "controlMode")
           VALUES ($1, $2, 'human')"#,
    )
    .bind(session_id)
    .bind(&user.id)
    .execute(&mut *tx)
    .await;

    if let Err(e) = tx.commit().await {
        tracing::error!("create_session commit: {e}");
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response();
    }

    (StatusCode::CREATED, Json(json!({
        "id": session_id,
        "playgroundId": id,
        "status": "waiting",
        "participantCount": 1,
    })))
    .into_response()
}

async fn join_session(
    State(state): State<AppState>,
    user: AuthUser,
    Path((_, session_id)): Path<(Uuid, Uuid)>,
    body: Option<Json<JoinBody>>,
) -> Response {
    let body = body.map(|b| b.0);

    // Check if already a participant
    let existing = sqlx::query_as::<_, (Uuid, bool)>(
        r#"SELECT id, is_connected FROM playground_participants
           WHERE session_id = $1 AND user_id = $2"#,
    )
    .bind(session_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match existing {
        Ok(Some((pid, _))) => {
            // Reconnect
            let _ = sqlx::query(
                "UPDATE playground_participants SET is_connected = true WHERE id = $1",
            )
            .bind(pid)
            .execute(&state.db)
            .await;
            return Json(json!({"id": pid, "isConnected": true})).into_response();
        }
        Ok(None) => {}
        Err(e) => {
            tracing::error!("join_session check: {e}");
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response();
        }
    }

    let result = sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO playground_participants (session_id, user_id, agent_id, role, "controlMode")
           VALUES ($1, $2, $3, $4, COALESCE($5, 'human'))
           RETURNING id"#,
    )
    .bind(session_id)
    .bind(&user.id)
    .bind(body.as_ref().and_then(|b| b.agent_id))
    .bind(body.as_ref().and_then(|b| b.role.as_deref()))
    .bind(body.as_ref().and_then(|b| b.control_mode.as_deref()))
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(pid) => (StatusCode::CREATED, Json(json!({"id": pid, "isConnected": true}))).into_response(),
        Err(e) => {
            tracing::error!("join_session insert: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response()
        }
    }
}

async fn leave_session(
    State(state): State<AppState>,
    user: AuthUser,
    Path((_, session_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let result = sqlx::query(
        r#"UPDATE playground_participants SET is_connected = false
           WHERE session_id = $1 AND user_id = $2"#,
    )
    .bind(session_id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Not in this session"}))).into_response(),
        Err(e) => {
            tracing::error!("leave_session: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "db error"}))).into_response()
        }
    }
}

/// POST /api/spaces/:id/cover — upload cover image (owner only)
async fn upload_space_cover(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    mut multipart: Multipart,
) -> Response {
    let owner = sqlx::query_scalar::<_, String>("SELECT owner_id FROM playgrounds WHERE id = $1")
        .bind(id).fetch_optional(&state.db).await.ok().flatten();
    match owner.as_deref() {
        Some(oid) if oid == user.id => {}
        Some(_) => return (StatusCode::FORBIDDEN, Json(json!({"error": "Only owner can upload cover"}))).into_response(),
        None => return (StatusCode::NOT_FOUND, Json(json!({"error": "Space not found"}))).into_response(),
    }

    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name() != Some("file") { continue; }
        let data = match field.bytes().await {
            Ok(d) => d,
            Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({"error": "Failed to read file"}))).into_response(),
        };
        if data.len() > 5 * 1024 * 1024 {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "Image must be under 5MB"}))).into_response();
        }
        let (ext, content_type) = if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
            ("png", "image/png")
        } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
            ("jpg", "image/jpeg")
        } else if data.starts_with(&[0x47, 0x49, 0x46]) {
            ("gif", "image/gif")
        } else if data.len() >= 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WEBP" {
            ("webp", "image/webp")
        } else {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "Only PNG, JPEG, GIF, and WebP are allowed"}))).into_response();
        };

        let stored = format!("space_cover_{}_{}.{}", id, chrono::Utc::now().timestamp_millis(), ext);
        let r2_key = format!("spaces/{}", stored);
        let url = if let Some(s3) = &state.s3 {
            match crate::services::r2::upload_to_r2(s3, &state.config.r2_bucket, &r2_key, data.to_vec(), content_type, &state.config.r2_public_url).await {
                Ok(url) => url,
                Err(_) => {
                    let dir = std::path::Path::new(&state.config.upload_dir).join("spaces");
                    let _ = tokio::fs::create_dir_all(&dir).await;
                    let _ = tokio::fs::write(dir.join(&stored), &data).await;
                    format!("/uploads/spaces/{}", stored)
                }
            }
        } else {
            let dir = std::path::Path::new(&state.config.upload_dir).join("spaces");
            let _ = tokio::fs::create_dir_all(&dir).await;
            let _ = tokio::fs::write(dir.join(&stored), &data).await;
            format!("/uploads/spaces/{}", stored)
        };

        let _ = sqlx::query("UPDATE playgrounds SET cover_image_url = $1, updated_at = NOW() WHERE id = $2")
            .bind(&url).bind(id).execute(&state.db).await;

        return Json(json!({"url": url})).into_response();
    }
    (StatusCode::BAD_REQUEST, Json(json!({"error": "No file field"}))).into_response()
}
