use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, post},
    Router,
};
use serde_json::json;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::services::message_seq::get_next_seq;
use crate::AppState;

/// Allowed MIME types for file uploads.
const ALLOWED_TYPES: &[&str] = &[
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/json",
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/conversations/{conversationId}/upload",
            post(upload_file),
        )
        .route("/api/attachments/{id}", get(get_attachment))
}

async fn upload_file(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conversation_id): Path<Uuid>,
    mut multipart: Multipart,
) -> Response {
    // Verify the user owns this conversation
    let conv = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
    )
    .bind(conversation_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    if matches!(conv, Ok(None) | Err(_)) {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Conversation not found"})),
        )
            .into_response();
    }

    let max_size = state.config.max_file_size;
    let mut caption = String::new();

    while let Ok(Some(field)) = multipart.next_field().await {
        // Capture the caption text field
        let field_name = field.name().unwrap_or("").to_string();
        if field_name == "caption" {
            caption = field.text().await.unwrap_or_default();
            continue;
        }

        let content_type = field.content_type().unwrap_or("").to_string();

        // Validate MIME type
        if !ALLOWED_TYPES.contains(&content_type.as_str()) {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": format!(
                        "File type '{}' is not allowed. Allowed types: {}",
                        content_type,
                        ALLOWED_TYPES.join(", ")
                    )
                })),
            )
                .into_response();
        }

        let file_name = field
            .file_name()
            .unwrap_or("upload")
            .to_string();

        let data = match field.bytes().await {
            Ok(d) => d,
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

        let attachment_id = Uuid::new_v4();
        let ext = file_name
            .rsplit('.')
            .next()
            .unwrap_or("bin");
        let stored_name = format!(
            "{}_{}.{}",
            attachment_id,
            chrono::Utc::now().timestamp(),
            ext
        );
        let r2_key = format!("attachments/{}/{}", conversation_id, stored_name);

        // Try R2 upload first, fallback to local storage
        let storage_path = if let Some(s3) = &state.s3 {
            match crate::services::r2::upload_to_r2(s3, &state.config.r2_bucket, &r2_key, data.to_vec(), &content_type, &state.config.r2_public_url).await {
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
                format!(
                    "/uploads/attachments/{}/{}",
                    conversation_id, stored_name
                )
            };

        let file_size = data.len() as i32;

        // 1. Create user message first (so we have a valid message_id for the attachment FK)
        let conv_id_str = conversation_id.to_string();
        let seq = match get_next_seq(&state.db, &conv_id_str).await {
            Ok(s) => s,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("Failed to get sequence: {}", e)})),
                )
                    .into_response();
            }
        };

        let message_id = Uuid::new_v4();
        let msg_result = sqlx::query_as::<_, crate::db::models::Message>(
            r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, created_at, updated_at)
               VALUES ($1, $2, $3, 'user', $4, 'completed', NOW(), NOW())
               RETURNING *"#,
        )
        .bind(message_id)
        .bind(conversation_id)
        .bind(seq)
        .bind(&caption)
        .fetch_one(&state.db)
        .await;

        let message = match msg_result {
            Ok(m) => m,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("Failed to create message: {}", e)})),
                )
                    .into_response();
            }
        };

        // 2. Create attachment linked to the message
        let att_result = sqlx::query_as::<_, crate::db::models::Attachment>(
            r#"INSERT INTO attachments (id, message_id, file_name, file_type, file_size, storage_path)
               VALUES ($1, $2, $3, $4, $5, $6)
               RETURNING *"#,
        )
        .bind(attachment_id)
        .bind(message_id)
        .bind(&file_name)
        .bind(&content_type)
        .bind(file_size)
        .bind(&storage_path)
        .fetch_one(&state.db)
        .await;

        let attachment = match att_result {
            Ok(a) => a,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("Failed to create attachment: {}", e)})),
                )
                    .into_response();
            }
        };

        // 3. Update conversation timestamp
        let _ = sqlx::query(
            r#"UPDATE conversations SET updated_at = NOW() WHERE id = $1"#,
        )
        .bind(conversation_id)
        .execute(&state.db)
        .await;

        // 4. Return message with embedded attachments
        return (
            StatusCode::CREATED,
            Json(json!({
                "message": {
                    "id": message.id,
                    "conversationId": message.conversation_id,
                    "seq": message.seq,
                    "role": message.role,
                    "content": message.content,
                    "status": message.status,
                    "createdAt": message.created_at,
                    "updatedAt": message.updated_at,
                    "attachments": [{
                        "id": attachment.id,
                        "messageId": attachment.message_id,
                        "fileName": attachment.file_name,
                        "fileType": attachment.file_type,
                        "fileSize": attachment.file_size,
                        "url": attachment.storage_path,
                        "createdAt": attachment.created_at,
                    }]
                }
            })),
        )
            .into_response();
    }

    (
        StatusCode::BAD_REQUEST,
        Json(json!({"error": "No file uploaded"})),
    )
        .into_response()
}

async fn get_attachment(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    // Fetch the attachment and verify user has access through the conversation
    let attachment = sqlx::query_as::<_, crate::db::models::Attachment>(
        r#"SELECT att.*
           FROM attachments att
           JOIN messages m ON m.id = att.message_id
           JOIN conversations c ON c.id = m.conversation_id
           WHERE att.id = $1 AND c.user_id = $2"#,
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    // Also check attachments with placeholder message_id (unlinked uploads)
    let attachment = match attachment {
        Ok(Some(a)) => a,
        Ok(None) => {
            // Try finding unlinked attachment (placeholder message_id)
            match sqlx::query_as::<_, crate::db::models::Attachment>(
                "SELECT * FROM attachments WHERE id = $1",
            )
            .bind(id)
            .fetch_optional(&state.db)
            .await
            {
                Ok(Some(a)) => a,
                Ok(None) => {
                    return (
                        StatusCode::NOT_FOUND,
                        Json(json!({"error": "Attachment not found"})),
                    )
                        .into_response();
                }
                Err(e) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({"error": e.to_string()})),
                    )
                        .into_response();
                }
            }
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    Json(json!({
        "id": attachment.id,
        "messageId": attachment.message_id,
        "fileName": attachment.file_name,
        "fileType": attachment.file_type,
        "fileSize": attachment.file_size,
        "storagePath": attachment.storage_path,
        "createdAt": attachment.created_at,
    }))
    .into_response()
}
