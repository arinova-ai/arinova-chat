use axum::{http::StatusCode, response::Json, routing::get, Router};
use serde_json::{json, Value};

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/health", get(health_check))
}

async fn health_check() -> (StatusCode, Json<Value>) {
    (
        StatusCode::OK,
        Json(json!({
            "status": "ok",
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    )
}
