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
    pinned_buttons: Option<Vec<String>>,
}

/// Use a wrapper so we can distinguish "field absent" from "field = null".
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct UpdateSettingsBody {
    /// Explicit null clears the bg; absent = don't touch.
    #[serde(deserialize_with = "deserialize_optional_field", default)]
    chat_bg_url: Option<Option<String>>,
    #[serde(deserialize_with = "deserialize_optional_field", default)]
    pinned_buttons: Option<Option<Vec<String>>>,
}

/// Deserialise a field that may be absent, null, or present.
fn deserialize_optional_field<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Ok(Some(Option::deserialize(deserializer)?))
}

async fn get_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conversation_id): Path<Uuid>,
) -> Response {
    let row = sqlx::query_as::<_, (Option<String>, Option<Vec<String>>)>(
        "SELECT chat_bg_url, pinned_buttons FROM conversation_user_settings WHERE user_id = $1 AND conversation_id = $2",
    )
    .bind(&user.id)
    .bind(conversation_id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some((chat_bg_url, pinned_buttons))) => {
            (StatusCode::OK, Json(json!(ConversationSettings { chat_bg_url, pinned_buttons }))).into_response()
        }
        Ok(None) => {
            (StatusCode::OK, Json(json!(ConversationSettings { chat_bg_url: None, pinned_buttons: None }))).into_response()
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
    let bg_val = body.chat_bg_url;
    let pins_val = body.pinned_buttons;

    // Fetch current values, merge with provided fields, then upsert
    let current = sqlx::query_as::<_, (Option<String>, Option<Vec<String>>)>(
        "SELECT chat_bg_url, pinned_buttons FROM conversation_user_settings WHERE user_id = $1 AND conversation_id = $2",
    )
    .bind(&user.id)
    .bind(conversation_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    let (cur_bg, cur_pins) = current.unwrap_or((None, None));

    let final_bg = if let Some(v) = bg_val { v } else { cur_bg };
    let final_pins = if let Some(v) = pins_val { v } else { cur_pins };

    let result = sqlx::query(
        r#"INSERT INTO conversation_user_settings (user_id, conversation_id, chat_bg_url, pinned_buttons, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (user_id, conversation_id) DO UPDATE SET
             chat_bg_url = $3,
             pinned_buttons = $4,
             updated_at = NOW()"#,
    )
    .bind(&user.id)
    .bind(conversation_id)
    .bind(&final_bg)
    .bind(&final_pins)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({
            "chatBgUrl": final_bg,
            "pinnedButtons": final_pins,
        }))).into_response(),
        Err(e) => {
            tracing::error!("update_conversation_settings: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"}))).into_response()
        }
    }
}
