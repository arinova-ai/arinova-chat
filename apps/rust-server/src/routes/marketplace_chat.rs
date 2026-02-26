use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        Json,
    },
    routing::{get, post},
    Router,
};
use chrono::NaiveDateTime;
use futures::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};
use std::convert::Infallible;
use tokio_stream::wrappers::ReceiverStream;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::services::{billing, llm, openrouter, tts};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/marketplace/agents/{id}/chat", post(chat))
        .route("/api/marketplace/conversations", get(list_conversations))
        .route(
            "/api/marketplace/conversations/{id}/messages",
            get(get_messages),
        )
}

// ---------------------------------------------------------------------------
// FromRow structs
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct ChatListingInfo {
    agent_name: String,
    system_prompt: String,
    model: String,
    input_char_limit: i32,
    status: String,
    tts_voice: Option<String>,
}

#[derive(sqlx::FromRow)]
struct ChatMessageRow {
    id: Uuid,
    role: String,
    content: String,
    tts_audio_url: Option<String>,
    created_at: NaiveDateTime,
}

#[derive(sqlx::FromRow)]
struct ConversationListRow {
    id: Uuid,
    listing_id: Uuid,
    agent_name: String,
    avatar_url: Option<String>,
    message_count: i32,
    created_at: NaiveDateTime,
    updated_at: NaiveDateTime,
}

// ---------------------------------------------------------------------------
// POST /api/marketplace/agents/{id}/chat — SSE streaming
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ChatBody {
    message: String,
    #[serde(rename = "conversationId")]
    conversation_id: Option<Uuid>,
}

async fn chat(
    State(state): State<AppState>,
    user: AuthUser,
    Path(listing_id): Path<Uuid>,
    Json(body): Json<ChatBody>,
) -> Result<Sse<impl futures::Stream<Item = Result<Event, Infallible>>>, (StatusCode, Json<Value>)>
{
    // 1. Load listing (must be active)
    let listing = sqlx::query_as::<_, ChatListingInfo>(
        r#"SELECT agent_name, system_prompt, model, input_char_limit,
                  status::text AS status, tts_voice
           FROM agent_listings WHERE id = $1"#,
    )
    .bind(listing_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Chat: fetch listing failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        )
    })?
    .ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Listing not found" })),
        )
    })?;

    if listing.status != "active" {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Listing is not active" })),
        ));
    }

    // 2. Validate message length against listing's input_char_limit
    let char_limit = listing.input_char_limit.max(1) as usize;
    if body.message.is_empty() || body.message.len() > char_limit {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": format!("Message must be 1-{} characters", char_limit)
            })),
        ));
    }

    // 3. Ensure platform OpenRouter API key is configured
    let openrouter_key = state.config.openrouter_api_key.as_deref().ok_or_else(|| {
        tracing::error!("Chat: OPENROUTER_API_KEY not configured");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "LLM service not configured" })),
        )
    })?;

    // 4. Check billing
    let billing_result =
        billing::check_billing(&state.db, &user.id, listing_id, body.conversation_id)
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": e })),
                )
            })?;

    if !billing_result.allowed {
        return Err((
            StatusCode::PAYMENT_REQUIRED,
            Json(json!({
                "error": billing_result.reason.unwrap_or_else(|| "Payment required".into())
            })),
        ));
    }

    // 5. Get or create conversation
    let conversation_id = match body.conversation_id {
        Some(cid) => cid,
        None => {
            let new_id = sqlx::query_scalar::<_, Uuid>(
                r#"INSERT INTO marketplace_conversations (listing_id, user_id, title)
                   VALUES ($1, $2, $3) RETURNING id"#,
            )
            .bind(listing_id)
            .bind(&user.id)
            .bind(&listing.agent_name)
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                tracing::error!("Chat: create conversation failed: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "Failed to create conversation" })),
                )
            })?;

            // Increment sales_count for new conversation
            if let Err(e) = sqlx::query(
                "UPDATE agent_listings SET sales_count = sales_count + 1, updated_at = NOW() WHERE id = $1",
            )
            .bind(listing_id)
            .execute(&state.db)
            .await
            {
                tracing::error!("Chat: increment sales_count failed: {}", e);
            }

            new_id
        }
    };

    // 6. Store user message
    sqlx::query(
        r#"INSERT INTO marketplace_messages (conversation_id, role, content)
           VALUES ($1, 'user', $2)"#,
    )
    .bind(conversation_id)
    .bind(&body.message)
    .execute(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Chat: store user message failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Failed to store message" })),
        )
    })?;

    // 7. Load last 50 messages for LLM context
    let history = sqlx::query_as::<_, ChatMessageRow>(
        r#"SELECT * FROM (
               SELECT id, role::text AS role, content, tts_audio_url, created_at
               FROM marketplace_messages
               WHERE conversation_id = $1
               ORDER BY created_at DESC
               LIMIT 50
           ) sub ORDER BY created_at ASC"#,
    )
    .bind(conversation_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Chat: load history failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Failed to load history" })),
        )
    })?;

    // 8. RAG: augment system prompt with knowledge base context
    let system_prompt = if let Some(ref openai_key) = state.config.openai_api_key {
        match crate::services::embedding::rag_search(
            &state.db,
            listing_id,
            &body.message,
            openai_key,
            5,
        )
        .await
        {
            Ok(chunks) if !chunks.is_empty() => {
                let context = chunks.join("\n\n");
                format!(
                    "{}\n\n---\nBelow is relevant context from the knowledge base:\n\n{}",
                    listing.system_prompt, context
                )
            }
            Ok(_) => listing.system_prompt.clone(),
            Err(e) => {
                tracing::warn!("RAG search failed for listing {}: {:?}", listing_id, e);
                listing.system_prompt.clone()
            }
        }
    } else {
        listing.system_prompt.clone()
    };

    // 9. Build LLM messages
    let mut llm_messages = vec![llm::ChatMessage {
        role: "system".into(),
        content: system_prompt,
    }];

    for msg in &history {
        let role = match msg.role.as_str() {
            "user" => "user",
            "assistant" => "assistant",
            _ => continue,
        };
        llm_messages.push(llm::ChatMessage {
            role: role.into(),
            content: msg.content.clone(),
        });
    }

    let or_opts = openrouter::OpenRouterCallOptions {
        model: listing.model.clone(),
        messages: llm_messages,
        max_tokens: None,
        temperature: None,
    };

    // 10. Setup SSE stream via channel
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(32);
    let db = state.db.clone();
    let user_id = user.id.clone();
    let cost = billing_result.cost;
    let is_free = billing_result.is_free_trial || cost == 0;
    let api_key = openrouter_key.to_string();
    let s3_clone = state.s3.clone();
    let config_clone = state.config.clone();
    let tts_voice = listing.tts_voice.clone().unwrap_or_else(|| "alloy".into());

    tokio::spawn(async move {
        // Send meta event
        let _ = tx
            .send(Ok(Event::default().data(
                json!({"type": "meta", "conversationId": conversation_id}).to_string(),
            )))
            .await;

        // Call OpenRouter stream
        let mut stream = match openrouter::call_stream(&api_key, &or_opts).await {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("Chat: OpenRouter stream failed: {}", e);
                let _ = tx
                    .send(Ok(Event::default().data(
                        json!({"type": "error", "message": "LLM request failed"}).to_string(),
                    )))
                    .await;
                let _ = tx
                    .send(Ok(Event::default().data(
                        json!({"type": "done", "charged": false}).to_string(),
                    )))
                    .await;
                return;
            }
        };

        let mut full_content = String::new();
        let mut buffer = String::new();

        while let Some(chunk) = stream.next().await {
            match chunk {
                Ok(bytes) => {
                    buffer.push_str(&String::from_utf8_lossy(&bytes));

                    // Process complete lines
                    while let Some(pos) = buffer.find('\n') {
                        let line = buffer[..pos].trim_end_matches('\r').to_string();
                        buffer = buffer[pos + 1..].to_string();

                        if let Some(data) = line.strip_prefix("data: ") {
                            // OpenRouter uses OpenAI-compatible SSE format
                            let text = llm::parse_openai_chunk(data);
                            if let Some(ref t) = text {
                                full_content.push_str(t);
                                let _ = tx
                                    .send(Ok(Event::default().data(
                                        json!({"type": "chunk", "content": t}).to_string(),
                                    )))
                                    .await;
                            }
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Chat: OpenRouter stream chunk error: {}", e);
                    break;
                }
            }
        }

        // Post-processing
        let mut charged = false;
        let mut msg_id: Option<Uuid> = None;

        if !full_content.is_empty() {
            // Store assistant message (with RETURNING id for TTS update)
            msg_id = match sqlx::query_scalar::<_, Uuid>(
                r#"INSERT INTO marketplace_messages (conversation_id, role, content)
                   VALUES ($1, 'assistant', $2)
                   RETURNING id"#,
            )
            .bind(conversation_id)
            .bind(&full_content)
            .fetch_one(&db)
            .await
            {
                Ok(id) => Some(id),
                Err(e) => {
                    tracing::error!("Chat: store assistant message failed: {}", e);
                    None
                }
            };

            // Deduct coins if not free
            if !is_free && cost > 0 {
                match billing::deduct_coins(&db, &user_id, listing_id, cost).await {
                    Ok(_) => charged = true,
                    Err(e) => tracing::error!("Chat: deduct_coins failed: {}", e),
                }
            }

            // Record message stats — only record revenue if actually charged
            let recorded_cost = if charged { cost } else { 0 };
            if let Err(e) =
                billing::record_message(&db, conversation_id, listing_id, recorded_cost).await
            {
                tracing::error!("Chat: record_message failed: {}", e);
            }

        }

        // Send done event BEFORE TTS (so the user sees the reply immediately)
        let _ = tx
            .send(Ok(
                Event::default().data(json!({"type": "done", "charged": charged}).to_string())
            ))
            .await;

        // TTS: generate audio in background (non-blocking, silent on failure)
        if let Some(openai_key) = config_clone.openai_api_key.as_deref() {
            let openai_key = openai_key.to_string();
            let tx_tts = tx.clone();
            let db_tts = db.clone();
            let s3_tts = s3_clone.clone();
            let config_tts = config_clone.clone();
            let tts_voice = tts_voice.clone();
            tokio::spawn(async move {
                match tts::text_to_speech(&openai_key, &full_content, &tts_voice).await {
                    Ok(audio_bytes) => {
                        let tts_filename = format!(
                            "tts_{}.mp3",
                            msg_id.map(|id| id.to_string()).unwrap_or_else(|| "unknown".into())
                        );
                        let r2_key = format!(
                            "tts/marketplace/{}/{}",
                            conversation_id, tts_filename
                        );

                        let audio_url = if let Some(ref s3) = s3_tts {
                            match crate::services::r2::upload_to_r2(
                                s3,
                                &config_tts.r2_bucket,
                                &r2_key,
                                audio_bytes.clone(),
                                "audio/mpeg",
                                &config_tts.r2_public_url,
                            )
                            .await
                            {
                                Ok(url) => Some(url),
                                Err(e) => {
                                    tracing::error!("Chat TTS: R2 upload failed: {}", e);
                                    let dir = std::path::Path::new(&config_tts.upload_dir)
                                        .join("tts")
                                        .join("marketplace")
                                        .join(conversation_id.to_string());
                                    let _ = tokio::fs::create_dir_all(&dir).await;
                                    let local_path = dir.join(&tts_filename);
                                    match tokio::fs::write(&local_path, &audio_bytes).await {
                                        Ok(_) => Some(format!(
                                            "/uploads/tts/marketplace/{}/{}",
                                            conversation_id, tts_filename
                                        )),
                                        Err(e2) => {
                                            tracing::error!("Chat TTS: local write failed: {}", e2);
                                            None
                                        }
                                    }
                                }
                            }
                        } else {
                            let dir = std::path::Path::new(&config_tts.upload_dir)
                                .join("tts")
                                .join("marketplace")
                                .join(conversation_id.to_string());
                            let _ = tokio::fs::create_dir_all(&dir).await;
                            let local_path = dir.join(&tts_filename);
                            match tokio::fs::write(&local_path, &audio_bytes).await {
                                Ok(_) => Some(format!(
                                    "/uploads/tts/marketplace/{}/{}",
                                    conversation_id, tts_filename
                                )),
                                Err(e) => {
                                    tracing::error!("Chat TTS: local write failed: {}", e);
                                    None
                                }
                            }
                        };

                        if let Some(ref url) = audio_url {
                            if let Some(mid) = msg_id {
                                let _ = sqlx::query(
                                    "UPDATE marketplace_messages SET tts_audio_url = $1 WHERE id = $2",
                                )
                                .bind(url)
                                .bind(mid)
                                .execute(&db_tts)
                                .await;
                            }

                            let _ = tx_tts
                                .send(Ok(Event::default().data(
                                    json!({"type": "audio_ready", "audioUrl": url}).to_string(),
                                )))
                                .await;
                        }
                    }
                    Err(e) => {
                        tracing::warn!("Chat TTS: generation failed: {}", e);
                    }
                }
            });
        }
    });

    let stream = ReceiverStream::new(rx);
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

// ---------------------------------------------------------------------------
// GET /api/marketplace/conversations — List user's conversations
// ---------------------------------------------------------------------------

async fn list_conversations(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, ConversationListRow>(
        r#"SELECT c.id, c.listing_id, l.agent_name, l.avatar_url,
                  c.message_count, c.created_at, c.updated_at
           FROM marketplace_conversations c
           JOIN agent_listings l ON c.listing_id = l.id
           WHERE c.user_id = $1
           ORDER BY c.updated_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let conversations: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "listingId": r.listing_id,
                        "agentName": r.agent_name,
                        "avatarUrl": r.avatar_url,
                        "messageCount": r.message_count,
                        "createdAt": r.created_at.and_utc().to_rfc3339(),
                        "updatedAt": r.updated_at.and_utc().to_rfc3339(),
                    })
                })
                .collect();
            (
                StatusCode::OK,
                Json(json!({ "conversations": conversations })),
            )
        }
        Err(e) => {
            tracing::error!("List conversations failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/marketplace/conversations/{id}/messages — Get conversation messages
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct MessagesQuery {
    limit: Option<i64>,
    offset: Option<i64>,
}

async fn get_messages(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conversation_id): Path<Uuid>,
    Query(q): Query<MessagesQuery>,
) -> (StatusCode, Json<Value>) {
    let limit = q.limit.unwrap_or(100).min(200);
    let offset = q.offset.unwrap_or(0).max(0);
    // Verify conversation belongs to user
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT user_id FROM marketplace_conversations WHERE id = $1",
    )
    .bind(conversation_id)
    .fetch_optional(&state.db)
    .await;

    match owner {
        Ok(Some(ref uid)) if uid == &user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Not your conversation" })),
            );
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Conversation not found" })),
            );
        }
        Err(e) => {
            tracing::error!("Get messages: verify owner failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    }

    let rows = sqlx::query_as::<_, ChatMessageRow>(
        r#"SELECT id, role::text AS role, content, tts_audio_url, created_at
           FROM marketplace_messages
           WHERE conversation_id = $1
           ORDER BY created_at ASC
           LIMIT $2 OFFSET $3"#,
    )
    .bind(conversation_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let messages: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "role": r.role,
                        "content": r.content,
                        "ttsAudioUrl": r.tts_audio_url,
                        "createdAt": r.created_at.and_utc().to_rfc3339(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "messages": messages })))
        }
        Err(e) => {
            tracing::error!("Get messages failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}
