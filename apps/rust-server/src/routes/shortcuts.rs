use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, put},
    Router,
};
use serde_json::{json, Value};

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/user/shortcuts", get(get_shortcuts).put(put_shortcuts))
}

async fn get_shortcuts(
    State(state): State<AppState>,
    user: AuthUser,
) -> Response {
    let row: Option<(Value,)> = sqlx::query_as(
        r#"SELECT COALESCE(quick_shortcuts, '[]'::jsonb) FROM "user" WHERE id = $1"#,
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    let shortcuts = row.map(|(v,)| v).unwrap_or_else(|| json!([]));
    Json(json!({ "shortcuts": shortcuts })).into_response()
}

async fn put_shortcuts(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Response {
    let shortcuts = match body.get("shortcuts") {
        Some(v) if v.is_array() => v.clone(),
        _ => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "shortcuts must be an array" }))).into_response(),
    };

    let result = sqlx::query(
        r#"UPDATE "user" SET quick_shortcuts = $1, updated_at = NOW() WHERE id = $2"#,
    )
    .bind(&shortcuts)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({ "shortcuts": shortcuts })).into_response(),
        Err(e) => {
            tracing::error!("Failed to update shortcuts: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Failed to save shortcuts" }))).into_response()
        }
    }
}
