use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/conversations/{conversationId}/settings",
            get(get_settings).patch(update_settings),
        )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConversationSettings {
    chat_bg_url: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSettingsBody {
    chat_bg_url: Option<String>,
}

async fn get_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conversation_id): Path<Uuid>,
) -> Response {
    let row = sqlx::query_as::<_, (Option<String>,)>(
        "SELECT chat_bg_url FROM conversation_user_settings WHERE user_id = $1 AND conversation_id = $2",
    )
    .bind(&user.id)
    .bind(conversation_id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some((chat_bg_url,))) => {
            (StatusCode::OK, Json(json!(ConversationSettings { chat_bg_url }))).into_response()
        }
        Ok(None) => {
            (StatusCode::OK, Json(json!(ConversationSettings { chat_bg_url: None }))).into_response()
        }
        Err(e) => {
            tracing::error!("get_conversation_settings: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"}))).into_response()
        }
    }
}

async fn update_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conversation_id): Path<Uuid>,
    Json(body): Json<UpdateSettingsBody>,
) -> Response {
    let result = sqlx::query(
        r#"INSERT INTO conversation_user_settings (user_id, conversation_id, chat_bg_url, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (user_id, conversation_id) DO UPDATE SET chat_bg_url = $3, updated_at = NOW()"#,
    )
    .bind(&user.id)
    .bind(conversation_id)
    .bind(&body.chat_bg_url)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({"chatBgUrl": body.chat_bg_url}))).into_response(),
        Err(e) => {
            tracing::error!("update_conversation_settings: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"}))).into_response()
        }
    }
}
