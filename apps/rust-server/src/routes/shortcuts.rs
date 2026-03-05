use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
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
    let row = sqlx::query_as::<_, (Value,)>(
        r#"SELECT COALESCE(quick_shortcuts, '[]'::jsonb) FROM "user" WHERE id = $1"#,
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some((v,))) => Json(json!({ "shortcuts": v })).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({ "error": "User not found" }))).into_response(),
        Err(e) => {
            tracing::error!("Failed to fetch shortcuts: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Failed to fetch shortcuts" }))).into_response()
        }
    }
}

async fn put_shortcuts(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<Value>,
) -> Response {
    let shortcuts = match body.get("shortcuts") {
        Some(v) if v.is_array() => {
            let arr = v.as_array().unwrap();
            // Validate each shortcut has required fields
            for item in arr {
                if !item.is_object() {
                    return (StatusCode::BAD_REQUEST, Json(json!({ "error": "each shortcut must be an object" }))).into_response();
                }
                let obj = item.as_object().unwrap();
                if !obj.contains_key("type") || !obj.contains_key("label") || !obj.contains_key("icon") {
                    return (StatusCode::BAD_REQUEST, Json(json!({ "error": "each shortcut must have type, label, and icon" }))).into_response();
                }
            }
            // Limit max shortcuts
            if arr.len() > 20 {
                return (StatusCode::BAD_REQUEST, Json(json!({ "error": "maximum 20 shortcuts allowed" }))).into_response();
            }
            v.clone()
        }
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
        Ok(r) if r.rows_affected() == 0 => {
            (StatusCode::NOT_FOUND, Json(json!({ "error": "User not found" }))).into_response()
        }
        Ok(_) => Json(json!({ "shortcuts": shortcuts })).into_response(),
        Err(e) => {
            tracing::error!("Failed to update shortcuts: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Failed to save shortcuts" }))).into_response()
        }
    }
}
