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
use crate::ws::handler::trigger_agent_response;
use crate::AppState;

/// Blocked MIME types — executables and scripts that could be dangerous if downloaded and run.
const BLOCKED_TYPES: &[&str] = &[
    "application/x-executable",
    "application/x-msdos-program",
    "application/x-msdownload",
    "application/x-sh",
    "application/x-bat",
    "application/x-csh",
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

    // --- Phase 1: Read all multipart fields ---
    let mut caption = String::new();
    let mut file_data: Option<(String, String, bytes::Bytes)> = None; // (file_name, content_type, data)

    while let Ok(Some(field)) = multipart.next_field().await {
        let field_name = field.name().unwrap_or("").to_string();

        if field_name == "caption" {
            caption = field.text().await.unwrap_or_default();
            continue;
        }

        // Treat any other field as the file
        let content_type = field.content_type().unwrap_or("").to_string();

        if BLOCKED_TYPES.contains(&content_type.as_str()) {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": format!("File type '{}' is not allowed", content_type)
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
    }

    // --- Phase 2: Process the file ---
    let (file_name, content_type, data) = match file_data {
        Some(f) => f,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "No file uploaded"})),
            )
                .into_response();
        }
    };

    let attachment_id = Uuid::new_v4();
    let ext = file_name.rsplit('.').next().unwrap_or("bin");
    let stored_name = format!(
        "{}_{}.{}",
        attachment_id,
        chrono::Utc::now().timestamp(),
        ext
    );
    let r2_key = format!("attachments/{}/{}", conversation_id, stored_name);

    // Try R2 upload first, fallback to local storage
    let storage_path = if let Some(s3) = &state.s3 {
        match crate::services::r2::upload_to_r2(
            s3,
            &state.config.r2_bucket,
            &r2_key,
            data.to_vec(),
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
        format!(
            "/uploads/attachments/{}/{}",
            conversation_id, stored_name
        )
    };

    let file_size = data.len() as i32;

    // --- Phase 3: Create message + attachment ---
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
        r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_user_id, created_at, updated_at)
           VALUES ($1, $2, $3, 'user', $4, 'completed', $5, NOW(), NOW())
           RETURNING *"#,
    )
    .bind(message_id)
    .bind(conversation_id)
    .bind(seq)
    .bind(&caption)
    .bind(&user.id)
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

    // Update conversation timestamp
    let _ = sqlx::query(
        r#"UPDATE conversations SET updated_at = NOW() WHERE id = $1"#,
    )
    .bind(conversation_id)
    .execute(&state.db)
    .await;

    // --- Phase 4: Trigger agent response ---
    // Build message content for the agent: caption + attachment URL
    let agent_content = if caption.is_empty() {
        format!("[Attachment: {}]({})", file_name, storage_path)
    } else {
        format!("{}\n\n[Attachment: {}]({})", caption, file_name, storage_path)
    };

    let user_id = user.id.clone();
    let ws = state.ws.clone();
    let db = state.db.clone();
    let redis = state.redis.clone();
    let config = state.config.clone();

    tokio::spawn(async move {
        trigger_agent_response(
            &user_id,
            &conv_id_str,
            &agent_content,
            true, // skip_user_message — we already created it above
            None,
            None, // thread_id
            &[],
            &ws,
            &db,
            &redis,
            &config,
        )
        .await;
    });

    // --- Phase 5: Return message with embedded attachments ---
    (
        StatusCode::CREATED,
        Json(json!({
            "message": {
                "id": message.id,
                "conversationId": message.conversation_id,
                "seq": message.seq,
                "role": message.role,
                "content": message.content,
                "status": message.status,
                "senderUserId": message.sender_user_id,
                "senderAgentId": message.sender_agent_id,
                "createdAt": message.created_at.and_utc().to_rfc3339(),
                "updatedAt": message.updated_at.and_utc().to_rfc3339(),
                "attachments": [{
                    "id": attachment.id,
                    "messageId": attachment.message_id,
                    "fileName": attachment.file_name,
                    "fileType": attachment.file_type,
                    "fileSize": attachment.file_size,
                    "url": attachment.storage_path,
                    "createdAt": attachment.created_at.and_utc().to_rfc3339(),
                }]
            }
        })),
    )
        .into_response()
}

async fn get_attachment(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
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

    match attachment {
        Ok(Some(a)) => Json(json!({
            "id": a.id,
            "messageId": a.message_id,
            "fileName": a.file_name,
            "fileType": a.file_type,
            "fileSize": a.file_size,
            "storagePath": a.storage_path,
            "createdAt": a.created_at.and_utc().to_rfc3339(),
        }))
        .into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Attachment not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
