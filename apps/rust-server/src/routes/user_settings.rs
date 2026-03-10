use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/user/settings", get(get_settings).put(update_settings))
}

/// GET /api/user/settings — get current user's settings
async fn get_settings(State(state): State<AppState>, user: AuthUser) -> Response {
    let row = sqlx::query_as::<_, (Option<String>,)>(
        "SELECT gemini_api_key FROM user_settings WHERE user_id = $1",
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some((key,))) => Json(json!({
            "geminiApiKey": key.as_ref().map(|k| mask_key(k)),
            "hasGeminiKey": key.is_some(),
        })).into_response(),
        Ok(None) => Json(json!({
            "geminiApiKey": null,
            "hasGeminiKey": false,
        })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSettingsBody {
    gemini_api_key: Option<String>,
}

/// PUT /api/user/settings — update current user's settings
async fn update_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<UpdateSettingsBody>,
) -> Response {
    let key = body.gemini_api_key.as_deref().map(|k| k.trim()).filter(|k| !k.is_empty());

    let result = sqlx::query(
        r#"INSERT INTO user_settings (user_id, gemini_api_key, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO UPDATE SET gemini_api_key = $2, updated_at = NOW()"#,
    )
    .bind(&user.id)
    .bind(key)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({
            "hasGeminiKey": key.is_some(),
        })).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() }))).into_response(),
    }
}

fn mask_key(key: &str) -> String {
    if key.len() <= 8 {
        "••••••••".to_string()
    } else {
        format!("{}••••{}", &key[..4], &key[key.len()-4..])
    }
}
