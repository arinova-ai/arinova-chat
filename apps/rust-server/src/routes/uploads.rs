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
    // Verify the user is a member of this conversation
    let is_member = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM conversation_user_members WHERE conversation_id = $1 AND user_id = $2",
    )
    .bind(conversation_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    if !matches!(is_member, Ok(Some(_))) {
        // Fallback: check conversations.user_id for backward compatibility
        let is_owner = sqlx::query_as::<_, (Uuid,)>(
            "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
        )
        .bind(conversation_id)
        .bind(&user.id)
        .fetch_optional(&state.db)
        .await;

        if !matches!(is_owner, Ok(Some(_))) {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Conversation not found"})),
            )
                .into_response();
        }
    }

    let max_size = state.config.max_file_size;

    // --- Phase 1: Read all multipart fields ---
    let mut caption = String::new();
    let mut duration_seconds: Option<i32> = None;
    let mut thread_id: Option<Uuid> = None;
    let mut files_data: Vec<(String, String, bytes::Bytes)> = Vec::new(); // Vec<(file_name, content_type, data)>

    while let Ok(Some(field)) = multipart.next_field().await {
        let field_name = field.name().unwrap_or("").to_string();

        if field_name == "caption" {
            caption = field.text().await.unwrap_or_default();
            continue;
        }

        if field_name == "duration_seconds" {
            let raw = match field.text().await {
                Ok(v) => v,
                Err(_) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({"error": "Failed to read duration_seconds field"})),
                    )
                        .into_response();
                }
            };
            if !raw.is_empty() {
                match raw.parse::<i32>() {
                    Ok(v) if v >= 0 && v <= 3600 => {
                        duration_seconds = Some(v);
                    }
                    _ => {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({"error": "Invalid duration_seconds: must be an integer between 0 and 3600"})),
                        )
                            .into_response();
                    }
                }
            }
            continue;
        }

        if field_name == "thread_id" {
            let raw = field.text().await.unwrap_or_default();
            if !raw.is_empty() {
                match raw.parse::<Uuid>() {
                    Ok(v) => { thread_id = Some(v); }
                    _ => {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({"error": "Invalid thread_id: must be a valid UUID"})),
                        )
                            .into_response();
                    }
                }
            }
            continue;
        }

        // Treat any other field as a file
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

        if files_data.len() >= 9 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Maximum 9 files per message"})),
            )
                .into_response();
        }
        files_data.push((file_name, content_type, data));
    }

    // --- Phase 2: Process the files ---
    if files_data.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "No file uploaded"})),
        )
            .into_response();
    }

    // Upload each file and collect attachment info
    let mut uploaded_files: Vec<(Uuid, String, String, i32, String, Option<i32>, Option<i32>)> = Vec::new(); // (att_id, file_name, content_type, file_size, storage_path, width, height)

    for (file_name, content_type, data) in &files_data {
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
                content_type,
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

        // Extract image dimensions for image/* MIME types
        let (width, height) = if content_type.starts_with("image/") {
            image::ImageReader::new(std::io::Cursor::new(data))
                .with_guessed_format()
                .ok()
                .and_then(|reader| reader.into_dimensions().ok())
                .map(|(w, h)| (i32::try_from(w).ok(), i32::try_from(h).ok()))
                .unwrap_or((None, None))
        } else {
            (None, None)
        };

        uploaded_files.push((attachment_id, file_name.clone(), content_type.clone(), file_size, storage_path, width, height));
    }

    // --- Phase 3: Create ONE message + multiple attachments ---
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
        r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_user_id, thread_id, created_at, updated_at)
           VALUES ($1, $2, $3, 'user', $4, 'completed', $5, $6, NOW(), NOW())
           RETURNING *"#,
    )
    .bind(message_id)
    .bind(conversation_id)
    .bind(seq)
    .bind(&caption)
    .bind(&user.id)
    .bind(thread_id)
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

    // Create attachment records for each uploaded file
    let mut attachments_json = Vec::new();
    for (attachment_id, file_name, content_type, file_size, storage_path, width, height) in &uploaded_files {
        let att_result = sqlx::query_as::<_, crate::db::models::Attachment>(
            r#"INSERT INTO attachments (id, message_id, file_name, file_type, file_size, storage_path, duration_seconds, width, height)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
               RETURNING *"#,
        )
        .bind(attachment_id)
        .bind(message_id)
        .bind(file_name)
        .bind(content_type)
        .bind(file_size)
        .bind(storage_path)
        .bind(duration_seconds)
        .bind(width)
        .bind(height)
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

        attachments_json.push(json!({
            "id": attachment.id,
            "messageId": attachment.message_id,
            "fileName": attachment.file_name,
            "fileType": attachment.file_type,
            "fileSize": attachment.file_size,
            "url": attachment.storage_path,
            "duration": attachment.duration_seconds,
            "width": attachment.width,
            "height": attachment.height,
            "createdAt": attachment.created_at.and_utc().to_rfc3339(),
        }));
    }

    // Update conversation timestamp
    let _ = sqlx::query(
        r#"UPDATE conversations SET updated_at = NOW() WHERE id = $1"#,
    )
    .bind(conversation_id)
    .execute(&state.db)
    .await;

    // --- Phase 3b: Broadcast new message with attachments via WS ---
    {
        let sender_info = sqlx::query_as::<_, (Option<String>, Option<String>, Option<String>, bool)>(
            r#"SELECT name, username, image, is_verified FROM "user" WHERE id = $1"#,
        )
        .bind(&user.id)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();

        let sender_name = sender_info.as_ref().and_then(|(n, _, _, _)| n.as_deref()).unwrap_or("");
        let sender_username = sender_info.as_ref().and_then(|(_, u, _, _)| u.as_deref()).unwrap_or("");
        let sender_image = sender_info.as_ref().and_then(|(_, _, img, _)| img.as_deref());
        let sender_is_verified = sender_info.as_ref().map(|(_, _, _, v)| *v).unwrap_or(false);

        let member_ids: Vec<String> = sqlx::query_as::<_, (String,)>(
            "SELECT user_id FROM conversation_user_members WHERE conversation_id = $1",
        )
        .bind(conversation_id)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|(uid,)| uid)
        .collect();

        let msg_event = json!({
            "type": "new_message",
            "conversationId": conv_id_str,
            "message": {
                "id": message_id.to_string(),
                "conversationId": conv_id_str,
                "seq": seq,
                "role": "user",
                "content": &caption,
                "status": "completed",
                "senderUserId": &user.id,
                "senderUserName": sender_name,
                "senderUsername": sender_username,
                "senderUserImage": sender_image,
                "senderIsVerified": sender_is_verified,
                "threadId": thread_id.map(|t| t.to_string()),
                "attachments": &attachments_json,
                "createdAt": message.created_at.and_utc().to_rfc3339(),
                "updatedAt": message.updated_at.and_utc().to_rfc3339(),
            }
        });
        state.ws.broadcast_to_members(&member_ids, &msg_event, &state.redis);
    }

    // --- Phase 4: Trigger agent response ---
    // Build message content for the agent: caption + all attachment references
    let attachment_refs: Vec<String> = uploaded_files
        .iter()
        .map(|(_, fname, _, _, spath, _, _)| format!("[Attachment: {}]({})", fname, spath))
        .collect();
    let agent_content = if caption.is_empty() {
        attachment_refs.join("\n")
    } else {
        format!("{}\n\n{}", caption, attachment_refs.join("\n"))
    };

    let user_id = user.id.clone();
    let ws = state.ws.clone();
    let db = state.db.clone();
    let redis = state.redis.clone();
    let config = state.config.clone();
    let thread_id_str = thread_id.map(|t| t.to_string());

    tokio::spawn(async move {
        trigger_agent_response(
            &user_id,
            &conv_id_str,
            &agent_content,
            true, // skip_user_message — we already created it above
            None,
            thread_id_str, // thread_id
            &[],
            None, // client_msg_id — N/A for uploads
            None, // client_metadata
            &ws,
            &db,
            &redis,
            &config,
        )
        .await;
    });

    // --- Phase 5: Return message with all attachments ---
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
                "threadId": message.thread_id,
                "createdAt": message.created_at.and_utc().to_rfc3339(),
                "updatedAt": message.updated_at.and_utc().to_rfc3339(),
                "attachments": attachments_json
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
            "width": a.width,
            "height": a.height,
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
