use axum::{
    extract::{Path, State},
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
use crate::services::{billing, crypto, llm};
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
    api_key_encrypted: Option<String>,
    model_provider: String,
    model_id: String,
    status: String,
}

#[derive(sqlx::FromRow)]
struct ChatMessageRow {
    id: Uuid,
    role: String,
    content: String,
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
    // Validate message length
    if body.message.is_empty() || body.message.len() > 10_000 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Message must be 1-10000 characters" })),
        ));
    }

    // 1. Load listing (must be active)
    let listing = sqlx::query_as::<_, ChatListingInfo>(
        r#"SELECT agent_name, system_prompt, api_key_encrypted,
                  model_provider, model_id, status::text AS status
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

    // 2. Check billing
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

    // 3. Get or create conversation
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

    // 4. Store user message
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

    // 5. Load last 50 messages for LLM context
    let history = sqlx::query_as::<_, ChatMessageRow>(
        r#"SELECT id, role::text AS role, content, created_at
           FROM marketplace_messages
           WHERE conversation_id = $1
           ORDER BY created_at ASC
           LIMIT 50"#,
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

    // 6. Decrypt API key
    let api_key_encrypted = listing.api_key_encrypted.ok_or_else(|| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Listing has no API key configured" })),
        )
    })?;

    let api_key =
        crypto::decrypt(&api_key_encrypted, &state.config.encryption_key).map_err(|e| {
            tracing::error!("Chat: decrypt API key failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to decrypt API key" })),
            )
        })?;

    // 7. Build LLM messages
    let provider = match listing.model_provider.as_str() {
        "anthropic" => llm::LlmProvider::Anthropic,
        _ => llm::LlmProvider::OpenAI,
    };

    let mut llm_messages = vec![llm::ChatMessage {
        role: "system".into(),
        content: listing.system_prompt,
    }];

    for msg in &history {
        let role = match msg.role.as_str() {
            "user" => "user",
            "agent" => "assistant",
            _ => continue,
        };
        llm_messages.push(llm::ChatMessage {
            role: role.into(),
            content: msg.content.clone(),
        });
    }

    let llm_opts = llm::LlmCallOptions {
        provider,
        model: listing.model_id,
        api_key,
        messages: llm_messages,
        max_tokens: None,
        temperature: None,
    };

    // 8. Setup SSE stream via channel
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(32);
    let db = state.db.clone();
    let user_id = user.id.clone();
    let cost = billing_result.cost;
    let is_free = billing_result.is_free_trial || cost == 0;

    tokio::spawn(async move {
        // Send meta event
        let _ = tx
            .send(Ok(Event::default().data(
                json!({"type": "meta", "conversationId": conversation_id}).to_string(),
            )))
            .await;

        // Call LLM stream
        let mut stream = match llm::call_llm_stream(&llm_opts).await {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("Chat: LLM stream failed: {}", e);
                let _ = tx
                    .send(Ok(Event::default().data(
                        json!({"type": "error", "message": "LLM request failed"}).to_string(),
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
                            let text = match llm_opts.provider {
                                llm::LlmProvider::OpenAI => llm::parse_openai_chunk(data),
                                llm::LlmProvider::Anthropic => llm::parse_anthropic_chunk(data),
                            };
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
                    tracing::error!("Chat: LLM stream chunk error: {}", e);
                    break;
                }
            }
        }

        // Post-processing
        let mut charged = false;

        if !full_content.is_empty() {
            // Store assistant message
            if let Err(e) = sqlx::query(
                r#"INSERT INTO marketplace_messages (conversation_id, role, content)
                   VALUES ($1, 'agent', $2)"#,
            )
            .bind(conversation_id)
            .bind(&full_content)
            .execute(&db)
            .await
            {
                tracing::error!("Chat: store assistant message failed: {}", e);
            }

            // Deduct coins if not free
            if !is_free && cost > 0 {
                match billing::deduct_coins(&db, &user_id, listing_id, cost).await {
                    Ok(_) => charged = true,
                    Err(e) => tracing::error!("Chat: deduct_coins failed: {}", e),
                }
            }

            // Record message stats (increments message_count + total_messages + total_revenue)
            if let Err(e) =
                billing::record_message(&db, conversation_id, listing_id, cost).await
            {
                tracing::error!("Chat: record_message failed: {}", e);
            }
        }

        // Send done event
        let _ = tx
            .send(Ok(
                Event::default().data(json!({"type": "done", "charged": charged}).to_string())
            ))
            .await;
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

async fn get_messages(
    State(state): State<AppState>,
    user: AuthUser,
    Path(conversation_id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
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
        r#"SELECT id, role::text AS role, content, created_at
           FROM marketplace_messages
           WHERE conversation_id = $1
           ORDER BY created_at ASC"#,
    )
    .bind(conversation_id)
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
