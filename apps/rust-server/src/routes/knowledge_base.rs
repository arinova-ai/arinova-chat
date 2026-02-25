use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, post},
    Router,
};
use chrono::NaiveDateTime;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

// Max file size: 5 MB
const MAX_FILE_SIZE: usize = 5 * 1024 * 1024;

// Credits deducted per KB file upload
const KB_UPLOAD_FEE: i32 = 10;

// Allowed MIME types / extensions
const ALLOWED_EXTENSIONS: &[&str] = &["txt", "md", "csv", "json", "pdf"];

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/marketplace/agents/{listing_id}/knowledge-base",
            post(upload_file).get(list_files),
        )
        .route(
            "/api/marketplace/agents/{listing_id}/knowledge-base/{kb_id}",
            delete(delete_file),
        )
}

// ---------------------------------------------------------------------------
// FromRow structs
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct CreatorCheck {
    creator_id: String,
}

#[derive(sqlx::FromRow)]
struct KbRow {
    id: Uuid,
    listing_id: Uuid,
    creator_id: String,
    file_name: String,
    file_size: i32,
    file_type: Option<String>,
    status: String,
    chunk_count: i32,
    total_chars: i32,
    embedding_model: String,
    created_at: NaiveDateTime,
    updated_at: NaiveDateTime,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn kb_to_json(r: &KbRow) -> Value {
    json!({
        "id": r.id,
        "listingId": r.listing_id,
        "creatorId": r.creator_id,
        "fileName": r.file_name,
        "fileSize": r.file_size,
        "fileType": r.file_type,
        "status": r.status,
        "chunkCount": r.chunk_count,
        "totalChars": r.total_chars,
        "embeddingModel": r.embedding_model,
        "createdAt": r.created_at.and_utc().to_rfc3339(),
        "updatedAt": r.updated_at.and_utc().to_rfc3339(),
    })
}

/// Verify listing exists and the user is the creator. Returns Err response on failure.
async fn verify_creator(
    db: &sqlx::PgPool,
    listing_id: Uuid,
    user_id: &str,
) -> Result<(), (StatusCode, Json<Value>)> {
    let row = sqlx::query_as::<_, CreatorCheck>(
        "SELECT creator_id FROM agent_listings WHERE id = $1",
    )
    .bind(listing_id)
    .fetch_optional(db)
    .await;

    match row {
        Ok(None) => Err((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Listing not found" })),
        )),
        Ok(Some(r)) if r.creator_id != user_id => Err((
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Not your listing" })),
        )),
        Ok(Some(_)) => Ok(()),
        Err(e) => {
            tracing::error!("KB verify_creator DB error: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            ))
        }
    }
}

fn extension_from_filename(name: &str) -> Option<String> {
    name.rsplit('.').next().map(|e| e.to_lowercase())
}

// ---------------------------------------------------------------------------
// POST /api/marketplace/agents/{listing_id}/knowledge-base
// ---------------------------------------------------------------------------

async fn upload_file(
    State(state): State<AppState>,
    user: AuthUser,
    Path(listing_id): Path<Uuid>,
    mut multipart: Multipart,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    // 1. Creator check
    verify_creator(&state.db, listing_id, &user.id).await?;

    // 2. Read the file field from multipart
    let field = loop {
        match multipart.next_field().await {
            Ok(Some(f)) if f.name() == Some("file") => break f,
            Ok(Some(_)) => continue, // skip non-file fields
            Ok(None) => {
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "No file field in request" })),
                ));
            }
            Err(e) => {
                tracing::error!("KB multipart read error: {}", e);
                return Err((
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "Failed to read multipart data" })),
                ));
            }
        }
    };

    // 3. Extract filename and extension
    let file_name = field
        .file_name()
        .unwrap_or("unnamed.txt")
        .to_string();

    let ext = extension_from_filename(&file_name).unwrap_or_default();
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": format!("Unsupported file type '.{}'. Allowed: .txt, .md, .csv, .json, .pdf", ext)
            })),
        ));
    }

    // PDF: not supported yet
    if ext == "pdf" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "PDF support coming soon. Please upload .txt, .md, .csv, or .json files." })),
        ));
    }

    // Determine file_type string
    let file_type = match ext.as_str() {
        "txt" => "text/plain",
        "md" => "text/markdown",
        "csv" => "text/csv",
        "json" => "application/json",
        _ => "application/octet-stream",
    };

    // 4. Read bytes (with size check)
    let bytes = match field.bytes().await {
        Ok(b) => b,
        Err(e) => {
            tracing::error!("KB file read error: {}", e);
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Failed to read file data" })),
            ));
        }
    };

    if bytes.len() > MAX_FILE_SIZE {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": format!("File too large. Maximum size is {} MB", MAX_FILE_SIZE / 1024 / 1024)
            })),
        ));
    }

    let file_size = bytes.len() as i32;

    // 5. Parse text content
    let raw_content = match ext.as_str() {
        "json" => {
            // Parse then pretty-print for consistent formatting
            let text = String::from_utf8_lossy(&bytes);
            match serde_json::from_str::<Value>(&text) {
                Ok(v) => serde_json::to_string_pretty(&v).unwrap_or_else(|_| text.into_owned()),
                Err(_) => text.into_owned(), // if invalid JSON, store as-is
            }
        }
        _ => {
            // txt, md, csv — direct UTF-8
            String::from_utf8_lossy(&bytes).into_owned()
        }
    };

    let total_chars = raw_content.len() as i32;

    // 6. Deduct credits + record transaction + insert KB in single transaction
    let balance = sqlx::query_scalar::<_, i32>(
        "SELECT balance FROM coin_balances WHERE user_id = $1",
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("KB billing: fetch balance failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        )
    })?
    .unwrap_or(0);

    if balance < KB_UPLOAD_FEE {
        return Err((
            StatusCode::PAYMENT_REQUIRED,
            Json(json!({
                "error": "Insufficient credits. Knowledge base upload costs 10 credits."
            })),
        ));
    }

    let mut tx = state.db.begin().await.map_err(|e| {
        tracing::error!("KB tx: begin failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        )
    })?;

    // 6a. Atomic deduction — only succeeds if balance >= fee
    let deducted = sqlx::query_scalar::<_, i32>(
        r#"UPDATE coin_balances
           SET balance = balance - $2, updated_at = NOW()
           WHERE user_id = $1 AND balance >= $2
           RETURNING balance"#,
    )
    .bind(&user.id)
    .bind(KB_UPLOAD_FEE)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("KB billing: deduct failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Failed to deduct credits" })),
        )
    })?;

    if deducted.is_none() {
        return Err((
            StatusCode::PAYMENT_REQUIRED,
            Json(json!({
                "error": "Insufficient credits. Knowledge base upload costs 10 credits."
            })),
        ));
    }

    // 6b. Record transaction
    sqlx::query(
        r#"INSERT INTO coin_transactions (user_id, type, amount, description)
           VALUES ($1, 'kb_upload', $2, $3)"#,
    )
    .bind(&user.id)
    .bind(-KB_UPLOAD_FEE)
    .bind(format!("Knowledge base file upload: {}", file_name))
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("KB billing: record transaction failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Failed to record transaction" })),
        )
    })?;

    // 6c. INSERT into agent_knowledge_bases
    let row = sqlx::query_as::<_, KbRow>(
        r#"INSERT INTO agent_knowledge_bases
           (listing_id, creator_id, file_name, file_size, file_type, status, total_chars, raw_content)
           VALUES ($1, $2, $3, $4, $5, 'processing', $6, $7)
           RETURNING id, listing_id, creator_id, file_name, file_size, file_type,
                     status, chunk_count, total_chars, embedding_model, created_at, updated_at"#,
    )
    .bind(listing_id)
    .bind(&user.id)
    .bind(&file_name)
    .bind(file_size)
    .bind(file_type)
    .bind(total_chars)
    .bind(&raw_content)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("KB insert error: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Failed to save knowledge base file" })),
        )
    })?;

    tx.commit().await.map_err(|e| {
        tracing::error!("KB tx: commit failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        )
    })?;

    // 7. Spawn background embedding task (outside transaction)
    let db = state.db.clone();
    let config = state.config.clone();
    let kb_id = row.id;

    tokio::spawn(async move {
        match crate::services::embedding::process_embedding(
            db.clone(),
            config,
            kb_id,
            &raw_content,
        )
        .await
        {
            Ok(chunk_count) => {
                tracing::info!("KB {} embedding done: {} chunks", kb_id, chunk_count);
                if let Err(e) = sqlx::query(
                    "UPDATE agent_knowledge_bases SET status = 'ready', chunk_count = $1, updated_at = NOW() WHERE id = $2",
                )
                .bind(chunk_count as i32)
                .bind(kb_id)
                .execute(&db)
                .await
                {
                    tracing::error!("KB {} failed to update status to ready: {:?}", kb_id, e);
                }
            }
            Err(e) => {
                tracing::error!("KB {} embedding failed: {:?}", kb_id, e);
                if let Err(e) = sqlx::query(
                    "UPDATE agent_knowledge_bases SET status = 'failed', updated_at = NOW() WHERE id = $1",
                )
                .bind(kb_id)
                .execute(&db)
                .await
                {
                    tracing::error!("KB {} failed to update status to failed: {:?}", kb_id, e);
                }
            }
        }
    });

    Ok((StatusCode::CREATED, Json(kb_to_json(&row))))
}

// ---------------------------------------------------------------------------
// GET /api/marketplace/agents/{listing_id}/knowledge-base
// ---------------------------------------------------------------------------

async fn list_files(
    State(state): State<AppState>,
    user: AuthUser,
    Path(listing_id): Path<Uuid>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    // Creator check
    verify_creator(&state.db, listing_id, &user.id).await?;

    let rows = sqlx::query_as::<_, KbRow>(
        r#"SELECT id, listing_id, creator_id, file_name, file_size, file_type,
                  status, chunk_count, total_chars, embedding_model, created_at, updated_at
           FROM agent_knowledge_bases
           WHERE listing_id = $1
           ORDER BY created_at DESC"#,
    )
    .bind(listing_id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(list) => {
            let files: Vec<Value> = list.iter().map(kb_to_json).collect();
            Ok(Json(json!({ "files": files })))
        }
        Err(e) => {
            tracing::error!("KB list error: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to list knowledge base files" })),
            ))
        }
    }
}

// ---------------------------------------------------------------------------
// DELETE /api/marketplace/agents/{listing_id}/knowledge-base/{kb_id}
// ---------------------------------------------------------------------------

async fn delete_file(
    State(state): State<AppState>,
    user: AuthUser,
    Path((listing_id, kb_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, (StatusCode, Json<Value>)> {
    // Creator check
    verify_creator(&state.db, listing_id, &user.id).await?;

    let result = sqlx::query(
        "DELETE FROM agent_knowledge_bases WHERE id = $1 AND listing_id = $2",
    )
    .bind(kb_id)
    .bind(listing_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Ok(StatusCode::NO_CONTENT),
        Ok(_) => Err((
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Knowledge base file not found" })),
        )),
        Err(e) => {
            tracing::error!("KB delete error: {}", e);
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to delete knowledge base file" })),
            ))
        }
    }
}
