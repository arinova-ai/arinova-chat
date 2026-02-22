use axum::{
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::post,
    Router,
};
use serde_json::json;

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/sandbox/execute", post(execute_sandbox))
}

async fn execute_sandbox() -> Response {
    (
        StatusCode::NOT_IMPLEMENTED,
        Json(json!({
            "error": "Sandbox execution is not implemented",
            "status": 501,
        })),
    )
        .into_response()
}
