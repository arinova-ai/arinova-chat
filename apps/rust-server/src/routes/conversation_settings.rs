use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, post},
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
        .route(
            "/api/conversations/{conversationId}/settings/upload",
            post(upload_settings_image),
        )
        .route(
            "/api/conversations/{conversationId}/general",
            get(get_general).patch(update_general),
        )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConversationSettings {
    chat_bg_url: Option<String>,
    pinned_buttons: Option<Vec<String>>,
    kanban_board_id: Option<Uuid>,
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
    #[serde(deserialize_with = "deserialize_optional_field", default)]
    kanban_board_id: Option<Option<Uuid>>,
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
    let row = sqlx::query_as::<_, (Option<String>, Option<Vec<String>>, Option<Uuid>)>(
        "SELECT chat_bg_url, pinned_buttons, kanban_board_id FROM conversation_user_settings WHERE user_id = $1 AND conversation_id = $2",
    )
    .bind(&user.id)
    .bind(conversation_id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some((chat_bg_url, pinned_buttons, kanban_board_id))) => {
            (StatusCode::OK, Json(json!(ConversationSettings { chat_bg_url, pinned_buttons, kanban_board_id }))).into_response()
        }
        Ok(None) => {
            (StatusCode::OK, Json(json!(ConversationSettings { chat_bg_url: None, pinned_buttons: None, kanban_board_id: None }))).into_response()
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
    let kanban_val = body.kanban_board_id;

    // Fetch current values, merge with provided fields, then upsert
    let current = sqlx::query_as::<_, (Option<String>, Option<Vec<String>>, Option<Uuid>)>(
        "SELECT chat_bg_url, pinned_buttons, kanban_board_id FROM conversation_user_settings WHERE user_id = $1 AND conversation_id = $2",
    )
    .bind(&user.id)
    .bind(conversation_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    let (cur_bg, cur_pins, cur_kanban) = current.unwrap_or((None, None, None));

    let final_bg = if let Some(v) = bg_val { v } else { cur_bg };
    let final_pins = if let Some(v) = pins_val { v } else { cur_pins };
    let final_kanban = if let Some(v) = kanban_val { v } else { cur_kanban };

    let result = sqlx::query(
        r#"INSERT INTO conversation_user_settings (user_id, conversation_id, chat_bg_url, pinned_buttons, kanban_board_id, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (user_id, conversation_id) DO UPDATE SET
             chat_bg_url = $3,
             pinned_buttons = $4,
             kanban_board_id = $5,
             updated_at = NOW()"#,
    )
    .bind(&user.id)
    .bind(conversation_id)
    .bind(&final_bg)
    .bind(&final_pins)
    .bind(&final_kanban)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({
            "chatBgUrl": final_bg,
            "pinnedButtons": final_pins,
            "kanbanBoardId": final_kanban,
        }))).into_response(),
        Err(e) => {
            tracing::error!("update_conversation_settings: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"}))).into_response()
        }
    }
}

/// Upload an image for conversation settings (bg, avatar) without creating a message.
async fn upload_settings_image(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conversation_id): Path<Uuid>,
    mut multipart: Multipart,
) -> Response {
    // Verify user is a member of the conversation
    let is_member = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
            SELECT 1 FROM conversation_user_members
            WHERE conversation_id = $1 AND user_id = $2
            UNION
            SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2
        )"#,
    )
    .bind(conversation_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !is_member {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Not a member"}))).into_response();
    }

    while let Ok(Some(field)) = multipart.next_field().await {
        let data = match field.bytes().await {
            Ok(d) => d,
            Err(_) => {
                return (StatusCode::BAD_REQUEST, Json(json!({"error": "Failed to read file"}))).into_response();
            }
        };

        if data.len() > 5 * 1024 * 1024 {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "Image must be under 5MB"}))).into_response();
        }

        let (ext, content_type) = if data.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
            ("png", "image/png")
        } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
            ("jpg", "image/jpeg")
        } else if data.starts_with(&[0x47, 0x49, 0x46]) {
            ("gif", "image/gif")
        } else if data.len() >= 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WEBP" {
            ("webp", "image/webp")
        } else {
            return (StatusCode::BAD_REQUEST, Json(json!({"error": "Only PNG, JPEG, GIF, and WebP images are allowed"}))).into_response();
        };

        let stored = format!(
            "settings_{}_{}.{}",
            conversation_id,
            chrono::Utc::now().timestamp_millis(),
            ext
        );
        let r2_key = format!("settings/{}", stored);

        let url = if let Some(s3) = &state.s3 {
            match crate::services::r2::upload_to_r2(
                s3,
                &state.config.r2_bucket,
                &r2_key,
                data.to_vec(),
                content_type,
                &state.config.r2_public_url,
            )
            .await
            {
                Ok(url) => url,
                Err(_) => {
                    let dir = std::path::Path::new(&state.config.upload_dir).join("settings");
                    if let Err(e) = tokio::fs::create_dir_all(&dir).await {
                        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("mkdir: {}", e)}))).into_response();
                    }
                    if let Err(e) = tokio::fs::write(dir.join(&stored), &data).await {
                        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("write: {}", e)}))).into_response();
                    }
                    format!("/uploads/settings/{}", stored)
                }
            }
        } else {
            let dir = std::path::Path::new(&state.config.upload_dir).join("settings");
            if let Err(e) = tokio::fs::create_dir_all(&dir).await {
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("mkdir: {}", e)}))).into_response();
            }
            if let Err(e) = tokio::fs::write(dir.join(&stored), &data).await {
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("write: {}", e)}))).into_response();
            }
            format!("/uploads/settings/{}", stored)
        };

        return (StatusCode::OK, Json(json!({"url": url}))).into_response();
    }

    (StatusCode::BAD_REQUEST, Json(json!({"error": "No file uploaded"}))).into_response()
}

// ── General (conversation-level) settings ────────────────────────────

/// GET /api/conversations/{conversationId}/general
async fn get_general(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conversation_id): Path<Uuid>,
) -> Response {
    // Verify ownership / membership
    let row = sqlx::query_as::<_, (i32,)>(
        r#"SELECT COALESCE(history_limit, 5)
           FROM conversations
           WHERE id = $1 AND (
             user_id = $2
             OR EXISTS (SELECT 1 FROM conversation_user_members WHERE conversation_id = $1 AND user_id = $2)
           )"#,
    )
    .bind(conversation_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some((history_limit,))) => {
            Json(json!({ "historyLimit": history_limit })).into_response()
        }
        Ok(None) => {
            (StatusCode::NOT_FOUND, Json(json!({"error": "Conversation not found"}))).into_response()
        }
        Err(e) => {
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response()
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateGeneralBody {
    history_limit: Option<i32>,
}

/// PATCH /api/conversations/{conversationId}/general
async fn update_general(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conversation_id): Path<Uuid>,
    Json(body): Json<UpdateGeneralBody>,
) -> Response {
    // Only owner can update
    let is_owner = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM conversations WHERE id = $1 AND user_id = $2)",
    )
    .bind(conversation_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !is_owner {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Only conversation owner can update"}))).into_response();
    }

    if let Some(limit) = body.history_limit {
        let clamped = limit.clamp(1, 50);
        let result = sqlx::query(
            "UPDATE conversations SET history_limit = $1 WHERE id = $2",
        )
        .bind(clamped)
        .bind(conversation_id)
        .execute(&state.db)
        .await;

        match result {
            Ok(_) => Json(json!({ "historyLimit": clamped })).into_response(),
            Err(e) => {
                (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response()
            }
        }
    } else {
        (StatusCode::BAD_REQUEST, Json(json!({"error": "No fields to update"}))).into_response()
    }
}
