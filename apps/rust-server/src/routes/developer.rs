use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, post, put, delete},
    Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Developer console
        .route("/api/developer/apps", get(list_dev_apps).post(create_dev_app))
        .route(
            "/api/developer/apps/{id}",
            get(get_dev_app).put(update_dev_app).delete(delete_dev_app),
        )
        .route(
            "/api/developer/apps/{id}/credentials",
            get(get_dev_app_credentials),
        )
        .route("/api/developer/apps/{id}/stats", get(get_dev_app_stats))
        .route(
            "/api/developer/apps/{id}/regenerate-secret",
            post(regenerate_secret),
        )
        .route(
            "/api/developer/apps/{id}/{action}",
            post(dev_app_action),
        )
        // App directory (public browse)
        .route("/api/apps", get(list_apps))
        .route("/api/apps/{id}", get(get_app))
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct AppRow {
    id: Uuid,
    client_id: String,
    name: String,
    description: Option<String>,
    icon_url: Option<String>,
    redirect_uri: String,
    external_url: Option<String>,
    category: String,
    status: String,
    is_public: bool,
    created_at: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateAppBody {
    name: String,
    description: Option<String>,
    category: Option<String>,
    external_url: Option<String>,
    icon_url: Option<String>,
    is_public: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateAppBody {
    name: Option<String>,
    description: Option<String>,
    category: Option<String>,
    external_url: Option<String>,
    icon_url: Option<String>,
    is_public: Option<bool>,
}

fn generate_client_id(name: &str) -> String {
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let suffix: [u8; 4] = rand::random();
    format!("{}-{}", if slug.is_empty() { "app".to_string() } else { slug }, hex::encode(suffix))
}

fn generate_client_secret() -> String {
    let random_bytes: [u8; 24] = rand::random();
    format!("ari_secret_{}", hex::encode(random_bytes))
}

fn app_json(r: &AppRow) -> Value {
    json!({
        "id": r.id,
        "name": r.name,
        "description": r.description,
        "category": r.category,
        "externalUrl": r.external_url.as_deref().unwrap_or(&r.redirect_uri),
        "iconUrl": r.icon_url,
        "status": r.status,
        "isPublic": r.is_public,
    })
}

// ---------------------------------------------------------------------------
// Verify ownership helper
// ---------------------------------------------------------------------------

async fn verify_app_owner(
    db: &sqlx::PgPool,
    app_id: Uuid,
    user_id: &str,
) -> Result<(), Response> {
    let owner = sqlx::query_scalar::<_, Option<String>>(
        "SELECT created_by FROM oauth_apps WHERE id = $1",
    )
    .bind(app_id)
    .fetch_optional(db)
    .await
    .map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response()
    })?;

    match owner {
        Some(Some(ref o)) if o == user_id => Ok(()),
        Some(Some(_)) => Err((StatusCode::FORBIDDEN, Json(json!({"error": "Not the app owner"}))).into_response()),
        _ => Err((StatusCode::NOT_FOUND, Json(json!({"error": "App not found"}))).into_response()),
    }
}

// ---------------------------------------------------------------------------
// POST /api/developer/apps
// ---------------------------------------------------------------------------

async fn create_dev_app(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateAppBody>,
) -> Response {
    let name = body.name.trim().to_string();
    if name.is_empty() || name.len() > 100 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Name must be 1-100 chars"}))).into_response();
    }

    let client_id = generate_client_id(&name);
    let category = body.category.as_deref().unwrap_or("other");
    let redirect_uri = body.external_url.as_deref().unwrap_or("https://example.com/callback");

    // All new apps are public (PKCE) by default — no client_secret needed
    let is_public = body.is_public.unwrap_or(true);
    let client_secret = if is_public { String::new() } else { generate_client_secret() };

    let result = sqlx::query_as::<_, AppRow>(
        r#"INSERT INTO oauth_apps (client_id, client_secret, name, redirect_uri, description, icon_url, created_by, category, external_url, status, is_public)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft', $10)
           RETURNING id, client_id, name, description, icon_url, redirect_uri, external_url, category, status, is_public, created_at"#,
    )
    .bind(&client_id)
    .bind(&client_secret)
    .bind(&name)
    .bind(redirect_uri)
    .bind(body.description.as_deref())
    .bind(body.icon_url.as_deref())
    .bind(&user.id)
    .bind(category)
    .bind(body.external_url.as_deref())
    .bind(is_public)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(app) => {
            let mut resp = app_json(&app);
            resp["clientId"] = json!(client_id);
            if !is_public && !client_secret.is_empty() {
                resp["clientSecret"] = json!(client_secret);
            }
            (StatusCode::CREATED, Json(resp)).into_response()
        }
        Err(e) => {
            tracing::error!("create_dev_app: {e}");
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to create app"}))).into_response()
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/developer/apps
// ---------------------------------------------------------------------------

async fn list_dev_apps(
    State(state): State<AppState>,
    user: AuthUser,
) -> Response {
    let rows = sqlx::query_as::<_, AppRow>(
        r#"SELECT id, client_id, name, description, icon_url, redirect_uri, external_url, category, status, is_public, created_at
           FROM oauth_apps WHERE created_by = $1 ORDER BY created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let apps: Vec<Value> = rows.iter().map(app_json).collect();
    Json(json!({ "apps": apps })).into_response()
}

// ---------------------------------------------------------------------------
// GET /api/developer/apps/:id
// ---------------------------------------------------------------------------

async fn get_dev_app(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_app_owner(&state.db, id, &user.id).await {
        return e;
    }

    let row = sqlx::query_as::<_, AppRow>(
        r#"SELECT id, client_id, name, description, icon_url, redirect_uri, external_url, category, status, is_public, created_at
           FROM oauth_apps WHERE id = $1"#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(app)) => Json(app_json(&app)).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({"error": "App not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ---------------------------------------------------------------------------
// PUT /api/developer/apps/:id
// ---------------------------------------------------------------------------

async fn update_dev_app(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateAppBody>,
) -> Response {
    if let Err(e) = verify_app_owner(&state.db, id, &user.id).await {
        return e;
    }

    let result = sqlx::query(
        r#"UPDATE oauth_apps SET
              name = COALESCE($2, name),
              description = COALESCE($3, description),
              category = COALESCE($4, category),
              external_url = COALESCE($5, external_url),
              redirect_uri = COALESCE($5, redirect_uri),
              icon_url = COALESCE($6, icon_url),
              is_public = COALESCE($7, is_public),
              updated_at = NOW()
           WHERE id = $1"#,
    )
    .bind(id)
    .bind(body.name.as_deref())
    .bind(body.description.as_deref())
    .bind(body.category.as_deref())
    .bind(body.external_url.as_deref())
    .bind(body.icon_url.as_deref())
    .bind(body.is_public)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({"id": id, "updated": true})).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ---------------------------------------------------------------------------
// DELETE /api/developer/apps/:id
// ---------------------------------------------------------------------------

async fn delete_dev_app(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_app_owner(&state.db, id, &user.id).await {
        return e;
    }

    // Delete associated tokens and codes first
    let _ = sqlx::query("DELETE FROM oauth_tokens WHERE app_id = $1").bind(id).execute(&state.db).await;
    let _ = sqlx::query("DELETE FROM oauth_codes WHERE app_id = $1").bind(id).execute(&state.db).await;
    let _ = sqlx::query("DELETE FROM oauth_apps WHERE id = $1").bind(id).execute(&state.db).await;

    StatusCode::NO_CONTENT.into_response()
}

// ---------------------------------------------------------------------------
// GET /api/developer/apps/:id/credentials
// ---------------------------------------------------------------------------

async fn get_dev_app_credentials(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_app_owner(&state.db, id, &user.id).await {
        return e;
    }

    let row = sqlx::query_as::<_, (String, String)>(
        "SELECT client_id, redirect_uri FROM oauth_apps WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some((client_id, redirect_uri))) => Json(json!({
            "clientId": client_id,
            "redirectUris": [redirect_uri],
        }))
        .into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({"error": "App not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ---------------------------------------------------------------------------
// GET /api/developer/apps/:id/stats
// ---------------------------------------------------------------------------

async fn get_dev_app_stats(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_app_owner(&state.db, id, &user.id).await {
        return e;
    }

    let token_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM oauth_tokens WHERE app_id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let unique_users = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(DISTINCT user_id) FROM oauth_tokens WHERE app_id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    Json(json!({
        "apiCalls": token_count,
        "uniqueUsers": unique_users,
        "transactions": 0,
        "totalTransactionAmount": 0,
    }))
    .into_response()
}

// ---------------------------------------------------------------------------
// POST /api/developer/apps/:id/regenerate-secret
// ---------------------------------------------------------------------------

async fn regenerate_secret(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    if let Err(e) = verify_app_owner(&state.db, id, &user.id).await {
        return e;
    }

    let new_secret = generate_client_secret();
    let result = sqlx::query(
        "UPDATE oauth_apps SET client_secret = $2, updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .bind(&new_secret)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            // Revoke all existing tokens for this app (secret changed, old sessions invalid)
            let _ = sqlx::query("DELETE FROM oauth_tokens WHERE app_id = $1")
                .bind(id)
                .execute(&state.db)
                .await;
            Json(json!({ "clientSecret": new_secret })).into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}

// ---------------------------------------------------------------------------
// POST /api/developer/apps/:id/:action (publish/unpublish)
// ---------------------------------------------------------------------------

async fn dev_app_action(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, action)): Path<(Uuid, String)>,
) -> Response {
    if let Err(e) = verify_app_owner(&state.db, id, &user.id).await {
        return e;
    }

    let new_status = match action.as_str() {
        "publish" => "published",
        "unpublish" => "draft",
        "withdraw" => "draft",
        _ => {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": format!("Unknown action: {}", action)}))).into_response();
        }
    };

    let _ = sqlx::query("UPDATE oauth_apps SET status = $2, updated_at = NOW() WHERE id = $1")
        .bind(id)
        .bind(new_status)
        .execute(&state.db)
        .await;

    Json(json!({"id": id, "status": new_status})).into_response()
}

// ---------------------------------------------------------------------------
// App Directory — public browse
// ---------------------------------------------------------------------------

async fn list_apps(
    State(state): State<AppState>,
    _user: AuthUser,
) -> Response {
    let rows = sqlx::query_as::<_, AppRow>(
        r#"SELECT id, client_id, name, description, icon_url, redirect_uri, external_url, category, status, is_public, created_at
           FROM oauth_apps WHERE status = 'published' ORDER BY created_at DESC"#,
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let apps: Vec<Value> = rows.iter().map(app_json).collect();
    Json(json!({ "apps": apps, "total": apps.len() })).into_response()
}

async fn get_app(
    State(state): State<AppState>,
    _user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let row = sqlx::query_as::<_, AppRow>(
        r#"SELECT id, client_id, name, description, icon_url, redirect_uri, external_url, category, status, is_public, created_at
           FROM oauth_apps WHERE id = $1 AND status = 'published'"#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(app)) => {
            let mut resp = app_json(&app);
            resp["clientId"] = json!(app.client_id);
            Json(resp).into_response()
        }
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({"error": "App not found"}))).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    }
}
