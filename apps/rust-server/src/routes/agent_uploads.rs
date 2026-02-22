use axum::{
    extract::{Multipart, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::post,
    Router,
};
use serde_json::json;
use uuid::Uuid;

use crate::auth::middleware::AuthAgent;
use crate::AppState;

/// Blocked MIME types — executables and scripts that could be dangerous.
const BLOCKED_TYPES: &[&str] = &[
    "application/x-executable",
    "application/x-msdos-program",
    "application/x-msdownload",
    "application/x-sh",
    "application/x-bat",
    "application/x-csh",
];

pub fn router() -> Router<AppState> {
    Router::new().route("/api/agent/upload", post(agent_upload))
}

async fn agent_upload(
    State(state): State<AppState>,
    agent: AuthAgent,
    mut multipart: Multipart,
) -> Response {
    let mut conversation_id: Option<Uuid> = None;
    let mut file_data: Option<(String, String, Vec<u8>)> = None; // (fileName, contentType, bytes)

    let max_size = state.config.max_file_size;

    while let Ok(Some(field)) = multipart.next_field().await {
        let field_name = field.name().unwrap_or("").to_string();

        if field_name == "conversationId" {
            let text = field.text().await.unwrap_or_default();
            conversation_id = text.parse::<Uuid>().ok();
            continue;
        }

        if field_name == "file" {
            let content_type = field.content_type().unwrap_or("application/octet-stream").to_string();
            let file_name = field.file_name().unwrap_or("upload").to_string();

            // Validate MIME type
            if BLOCKED_TYPES.contains(&content_type.as_str()) {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": format!("File type '{}' is not allowed", content_type)
                    })),
                )
                    .into_response();
            }

            let data = match field.bytes().await {
                Ok(d) => d.to_vec(),
                Err(_) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({"error": "Failed to read file data"})),
                    )
                        .into_response();
                }
            };

            // Validate file size
            if data.len() > max_size {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "error": format!(
                            "File size ({} bytes) exceeds maximum allowed size ({} bytes)",
                            data.len(),
                            max_size
                        )
                    })),
                )
                    .into_response();
            }

            file_data = Some((file_name, content_type, data));
            continue;
        }
    }

    // Validate required fields
    let conversation_id = match conversation_id {
        Some(id) => id,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "conversationId is required"})),
            )
                .into_response();
        }
    };

    let (file_name, content_type, data) = match file_data {
        Some(f) => f,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "file is required"})),
            )
                .into_response();
        }
    };

    // Verify agent belongs to this conversation
    // Check direct conversations (conversations.agent_id = agent.id)
    let is_direct_member = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM conversations WHERE id = $1 AND agent_id = $2",
    )
    .bind(conversation_id)
    .bind(agent.id)
    .fetch_optional(&state.db)
    .await;

    let has_access = match is_direct_member {
        Ok(Some(_)) => true,
        Ok(None) => {
            // Check group conversations (conversation_members)
            let is_group_member = sqlx::query_as::<_, (Uuid,)>(
                "SELECT id FROM conversation_members WHERE conversation_id = $1 AND agent_id = $2",
            )
            .bind(conversation_id)
            .bind(agent.id)
            .fetch_optional(&state.db)
            .await;

            matches!(is_group_member, Ok(Some(_)))
        }
        Err(_) => false,
    };

    if !has_access {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Agent does not belong to this conversation"})),
        )
            .into_response();
    }

    // Build storage key
    let attachment_id = Uuid::new_v4();
    let ext = file_name.rsplit('.').next().unwrap_or("bin");
    let stored_name = format!(
        "{}_{}.{}",
        attachment_id,
        chrono::Utc::now().timestamp(),
        ext
    );
    let r2_key = format!("attachments/{}/{}", conversation_id, stored_name);
    let file_size = data.len();

    // Upload to R2 (with local fallback)
    let storage_path = if let Some(s3) = &state.s3 {
        match crate::services::r2::upload_to_r2(
            s3,
            &state.config.r2_bucket,
            &r2_key,
            data.clone(),
            &content_type,
            &state.config.r2_public_url,
        )
        .await
        {
            Ok(url) => url,
            Err(_) => {
                let dir = std::path::Path::new(&state.config.upload_dir)
                    .join("attachments")
                    .join(conversation_id.to_string());
                let _ = tokio::fs::create_dir_all(&dir).await;
                let local_path = dir.join(&stored_name);
                if let Err(e) = tokio::fs::write(&local_path, &data).await {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({"error": format!("Failed to store file: {}", e)})),
                    )
                        .into_response();
                }
                format!("/uploads/attachments/{}/{}", conversation_id, stored_name)
            }
        }
    } else {
        let dir = std::path::Path::new(&state.config.upload_dir)
            .join("attachments")
            .join(conversation_id.to_string());
        let _ = tokio::fs::create_dir_all(&dir).await;
        let local_path = dir.join(&stored_name);
        if let Err(e) = tokio::fs::write(&local_path, &data).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Failed to store file: {}", e)})),
            )
                .into_response();
        }
        format!("/uploads/attachments/{}/{}", conversation_id, stored_name)
    };

    (
        StatusCode::CREATED,
        Json(json!({
            "url": storage_path,
            "fileName": file_name,
            "fileType": content_type,
            "fileSize": file_size,
        })),
    )
        .into_response()
}
