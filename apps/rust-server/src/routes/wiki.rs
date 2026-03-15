use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, patch, post},
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
        .route(
            "/api/conversations/{id}/wiki",
            get(list_wiki_pages).post(create_wiki_page),
        )
        .route(
            "/api/conversations/{id}/wiki/{pageId}",
            get(get_wiki_page).patch(update_wiki_page).delete(delete_wiki_page),
        )
        // Community wiki routes
        .route(
            "/api/communities/{id}/wiki",
            get(list_community_wiki_pages).post(create_community_wiki_page),
        )
        .route(
            "/api/communities/{id}/wiki/{pageId}",
            get(get_community_wiki_page)
                .patch(update_community_wiki_page)
                .delete(delete_community_wiki_page),
        )
}

// ===== Types =====

#[derive(Debug, FromRow)]
struct WikiPageRow {
    id: Uuid,
    conversation_id: Uuid,
    title: String,
    content: String,
    tags: Vec<String>,
    is_pinned: bool,
    owner_id: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

fn wiki_page_to_json(row: &WikiPageRow) -> serde_json::Value {
    json!({
        "id": row.id.to_string(),
        "conversationId": row.conversation_id.to_string(),
        "title": &row.title,
        "content": &row.content,
        "tags": &row.tags,
        "isPinned": row.is_pinned,
        "ownerId": &row.owner_id,
        "createdAt": row.created_at.to_rfc3339(),
        "updatedAt": row.updated_at.to_rfc3339(),
    })
}

/// Check if user is a member of the conversation
async fn is_member(db: &sqlx::PgPool, conv_id: Uuid, user_id: &str) -> bool {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2)",
    )
    .bind(conv_id)
    .bind(user_id)
    .fetch_one(db)
    .await
    .unwrap_or(false)
}

// ===== Handlers =====

/// GET /api/conversations/:id/wiki
async fn list_wiki_pages(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conv_id): Path<Uuid>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    let rows = sqlx::query_as::<_, WikiPageRow>(
        r#"SELECT id, conversation_id, title, content, tags, is_pinned, owner_id, created_at, updated_at
           FROM wiki_pages
           WHERE conversation_id = $1
           ORDER BY is_pinned DESC, updated_at DESC"#,
    )
    .bind(conv_id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(pages) => {
            let items: Vec<_> = pages.iter().map(wiki_page_to_json).collect();
            Json(json!({ "pages": items })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// GET /api/conversations/:id/wiki/:pageId
async fn get_wiki_page(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, page_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    let row = sqlx::query_as::<_, WikiPageRow>(
        r#"SELECT id, conversation_id, title, content, tags, is_pinned, owner_id, created_at, updated_at
           FROM wiki_pages
           WHERE id = $1 AND conversation_id = $2"#,
    )
    .bind(page_id)
    .bind(conv_id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(page)) => Json(wiki_page_to_json(&page)).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({"error": "Wiki page not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWikiPageBody {
    title: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    tags: Vec<String>,
}

/// POST /api/conversations/:id/wiki
async fn create_wiki_page(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conv_id): Path<Uuid>,
    Json(body): Json<CreateWikiPageBody>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    let row = sqlx::query_as::<_, WikiPageRow>(
        r#"INSERT INTO wiki_pages (conversation_id, title, content, tags, owner_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, conversation_id, title, content, tags, is_pinned, owner_id, created_at, updated_at"#,
    )
    .bind(conv_id)
    .bind(&body.title)
    .bind(&body.content)
    .bind(&body.tags)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    match row {
        Ok(page) => (StatusCode::CREATED, Json(wiki_page_to_json(&page))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateWikiPageBody {
    title: Option<String>,
    content: Option<String>,
    tags: Option<Vec<String>>,
    is_pinned: Option<bool>,
}

/// PATCH /api/conversations/:id/wiki/:pageId
async fn update_wiki_page(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, page_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateWikiPageBody>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    // Dynamic SET clause
    let mut set_clauses = vec!["updated_at = NOW()".to_string()];
    let mut idx = 3u32; // $1 = page_id, $2 = conv_id

    if body.title.is_some() {
        set_clauses.push(format!("title = ${idx}"));
        idx += 1;
    }
    if body.content.is_some() {
        set_clauses.push(format!("content = ${idx}"));
        idx += 1;
    }
    if body.tags.is_some() {
        set_clauses.push(format!("tags = ${idx}"));
        idx += 1;
    }
    if body.is_pinned.is_some() {
        set_clauses.push(format!("is_pinned = ${idx}"));
        idx += 1;
    }
    let _ = idx;

    if set_clauses.len() == 1 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "No fields to update"}))).into_response();
    }

    let sql = format!(
        "UPDATE wiki_pages SET {} WHERE id = $1 AND conversation_id = $2 RETURNING id, conversation_id, title, content, tags, is_pinned, owner_id, created_at, updated_at",
        set_clauses.join(", ")
    );

    let mut q = sqlx::query_as::<_, WikiPageRow>(&sql);
    q = q.bind(page_id).bind(conv_id);
    if let Some(ref t) = body.title { q = q.bind(t); }
    if let Some(ref c) = body.content { q = q.bind(c); }
    if let Some(ref tags) = body.tags { q = q.bind(tags); }
    if let Some(pinned) = body.is_pinned { q = q.bind(pinned); }

    match q.fetch_optional(&state.db).await {
        Ok(Some(page)) => Json(wiki_page_to_json(&page)).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({"error": "Wiki page not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// DELETE /api/conversations/:id/wiki/:pageId
async fn delete_wiki_page(
    State(state): State<AppState>,
    user: AuthUser,
    Path((conv_id, page_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if !is_member(&state.db, conv_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    let result = sqlx::query("DELETE FROM wiki_pages WHERE id = $1 AND conversation_id = $2")
        .bind(page_id)
        .bind(conv_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Wiki page not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ===== Community Wiki =====

#[derive(Debug, FromRow)]
struct CommunityWikiPageRow {
    id: Uuid,
    community_id: Option<Uuid>,
    title: String,
    content: String,
    tags: Vec<String>,
    is_pinned: bool,
    owner_id: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

fn community_wiki_page_to_json(row: &CommunityWikiPageRow) -> serde_json::Value {
    json!({
        "id": row.id.to_string(),
        "communityId": row.community_id.map(|id| id.to_string()),
        "title": &row.title,
        "content": &row.content,
        "tags": &row.tags,
        "isPinned": row.is_pinned,
        "ownerId": &row.owner_id,
        "createdAt": row.created_at.to_rfc3339(),
        "updatedAt": row.updated_at.to_rfc3339(),
    })
}

async fn is_community_member(db: &sqlx::PgPool, community_id: Uuid, user_id: &str) -> bool {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $2)",
    )
    .bind(community_id)
    .bind(user_id)
    .fetch_one(db)
    .await
    .unwrap_or(false)
}

/// GET /api/communities/:id/wiki
async fn list_community_wiki_pages(
    State(state): State<AppState>,
    user: AuthUser,
    Path(community_id): Path<Uuid>,
) -> Response {
    if !is_community_member(&state.db, community_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    let rows = sqlx::query_as::<_, CommunityWikiPageRow>(
        r#"SELECT id, community_id, title, content, tags, is_pinned, owner_id, created_at, updated_at
           FROM wiki_pages
           WHERE community_id = $1
           ORDER BY is_pinned DESC, updated_at DESC"#,
    )
    .bind(community_id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(pages) => {
            let items: Vec<_> = pages.iter().map(community_wiki_page_to_json).collect();
            Json(json!({ "pages": items })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// GET /api/communities/:id/wiki/:pageId
async fn get_community_wiki_page(
    State(state): State<AppState>,
    user: AuthUser,
    Path((community_id, page_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if !is_community_member(&state.db, community_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    let row = sqlx::query_as::<_, CommunityWikiPageRow>(
        r#"SELECT id, community_id, title, content, tags, is_pinned, owner_id, created_at, updated_at
           FROM wiki_pages
           WHERE id = $1 AND community_id = $2"#,
    )
    .bind(page_id)
    .bind(community_id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(page)) => Json(community_wiki_page_to_json(&page)).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({"error": "Wiki page not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// POST /api/communities/:id/wiki
async fn create_community_wiki_page(
    State(state): State<AppState>,
    user: AuthUser,
    Path(community_id): Path<Uuid>,
    Json(body): Json<CreateWikiPageBody>,
) -> Response {
    if !is_community_member(&state.db, community_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    let row = sqlx::query_as::<_, CommunityWikiPageRow>(
        r#"INSERT INTO wiki_pages (community_id, title, content, tags, owner_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, community_id, title, content, tags, is_pinned, owner_id, created_at, updated_at"#,
    )
    .bind(community_id)
    .bind(&body.title)
    .bind(&body.content)
    .bind(&body.tags)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    match row {
        Ok(page) => (StatusCode::CREATED, Json(community_wiki_page_to_json(&page))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// PATCH /api/communities/:id/wiki/:pageId
async fn update_community_wiki_page(
    State(state): State<AppState>,
    user: AuthUser,
    Path((community_id, page_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateWikiPageBody>,
) -> Response {
    if !is_community_member(&state.db, community_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    let mut set_clauses = vec!["updated_at = NOW()".to_string()];
    let mut idx = 3u32;

    if body.title.is_some() { set_clauses.push(format!("title = ${idx}")); idx += 1; }
    if body.content.is_some() { set_clauses.push(format!("content = ${idx}")); idx += 1; }
    if body.tags.is_some() { set_clauses.push(format!("tags = ${idx}")); idx += 1; }
    if body.is_pinned.is_some() { set_clauses.push(format!("is_pinned = ${idx}")); idx += 1; }
    let _ = idx;

    if set_clauses.len() == 1 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "No fields to update"}))).into_response();
    }

    let sql = format!(
        "UPDATE wiki_pages SET {} WHERE id = $1 AND community_id = $2 RETURNING id, community_id, title, content, tags, is_pinned, owner_id, created_at, updated_at",
        set_clauses.join(", ")
    );

    let mut q = sqlx::query_as::<_, CommunityWikiPageRow>(&sql);
    q = q.bind(page_id).bind(community_id);
    if let Some(ref t) = body.title { q = q.bind(t); }
    if let Some(ref c) = body.content { q = q.bind(c); }
    if let Some(ref tags) = body.tags { q = q.bind(tags); }
    if let Some(pinned) = body.is_pinned { q = q.bind(pinned); }

    match q.fetch_optional(&state.db).await {
        Ok(Some(page)) => Json(community_wiki_page_to_json(&page)).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({"error": "Wiki page not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

/// DELETE /api/communities/:id/wiki/:pageId
async fn delete_community_wiki_page(
    State(state): State<AppState>,
    user: AuthUser,
    Path((community_id, page_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if !is_community_member(&state.db, community_id, &user.id).await {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    let result = sqlx::query("DELETE FROM wiki_pages WHERE id = $1 AND community_id = $2")
        .bind(page_id)
        .bind(community_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => StatusCode::NO_CONTENT.into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Wiki page not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}
