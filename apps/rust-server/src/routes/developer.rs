use axum::{
    extract::Path,
    http::StatusCode,
    response::Json,
    routing::{get, post, patch, delete},
    Router,
};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

/// Stub routes for the developer console and app directory (planned features).
pub fn router() -> Router<AppState> {
    Router::new()
        // Developer console
        .route("/api/developer/apps", get(list_dev_apps).post(create_dev_app))
        .route("/api/developer/apps/{id}", patch(update_dev_app).delete(delete_dev_app))
        .route("/api/developer/apps/{id}/credentials", get(get_dev_app_credentials))
        .route("/api/developer/apps/{id}/stats", get(get_dev_app_stats))
        .route("/api/developer/apps/{id}/regenerate-secret", post(regenerate_secret))
        .route("/api/developer/apps/{id}/{action}", post(dev_app_action))
        // App directory
        .route("/api/apps", get(list_apps))
        .route("/api/apps/{id}", get(get_app))
}

async fn list_dev_apps(_user: AuthUser) -> Json<Value> {
    Json(json!({ "apps": [] }))
}

async fn create_dev_app(_user: AuthUser) -> (StatusCode, Json<Value>) {
    (StatusCode::NOT_IMPLEMENTED, Json(json!({ "error": "Developer apps not yet implemented" })))
}

async fn update_dev_app(_user: AuthUser, Path(_id): Path<Uuid>) -> (StatusCode, Json<Value>) {
    (StatusCode::NOT_IMPLEMENTED, Json(json!({ "error": "Developer apps not yet implemented" })))
}

async fn delete_dev_app(_user: AuthUser, Path(_id): Path<Uuid>) -> (StatusCode, Json<Value>) {
    (StatusCode::NOT_IMPLEMENTED, Json(json!({ "error": "Developer apps not yet implemented" })))
}

async fn get_dev_app_credentials(_user: AuthUser, Path(_id): Path<Uuid>) -> (StatusCode, Json<Value>) {
    (StatusCode::NOT_IMPLEMENTED, Json(json!({ "error": "Developer apps not yet implemented" })))
}

async fn get_dev_app_stats(_user: AuthUser, Path(_id): Path<Uuid>) -> (StatusCode, Json<Value>) {
    (StatusCode::NOT_IMPLEMENTED, Json(json!({ "error": "Developer apps not yet implemented" })))
}

async fn regenerate_secret(_user: AuthUser, Path(_id): Path<Uuid>) -> (StatusCode, Json<Value>) {
    (StatusCode::NOT_IMPLEMENTED, Json(json!({ "error": "Developer apps not yet implemented" })))
}

async fn dev_app_action(_user: AuthUser, Path((_id, _action)): Path<(Uuid, String)>) -> (StatusCode, Json<Value>) {
    (StatusCode::NOT_IMPLEMENTED, Json(json!({ "error": "Developer apps not yet implemented" })))
}

async fn list_apps(_user: AuthUser) -> Json<Value> {
    Json(json!({ "apps": [], "total": 0 }))
}

async fn get_app(_user: AuthUser, Path(_id): Path<Uuid>) -> (StatusCode, Json<Value>) {
    (StatusCode::NOT_FOUND, Json(json!({ "error": "App not found" })))
}
