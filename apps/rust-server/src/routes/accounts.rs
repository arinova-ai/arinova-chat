use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{get, post, patch},
    Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/accounts", post(create_account).get(list_accounts))
        .route("/api/accounts/{id}", patch(update_account).delete(delete_account))
        .route("/api/accounts/{id}/conversations", get(list_account_conversations))
        .route("/api/accounts/{id}/broadcast", post(broadcast_message))
        .route("/api/accounts/{id}/subscribers", get(list_subscribers))
        .route("/api/accounts/{id}/subscribe", post(subscribe).delete(unsubscribe))
        .route("/api/accounts/{id}/voice-sample", post(upload_voice_sample))
        .route("/api/accounts/{id}/gifts", post(send_gift).get(get_gift_report))
        .route("/api/accounts/{id}/analytics", get(get_analytics))
        .route("/api/explore/official", get(explore_official))
        .route("/api/explore/lounge", get(explore_lounge))
}

// ===========================================================================
// Phase 1 - CRUD
// ===========================================================================

#[derive(Deserialize)]
struct CreateAccountBody {
    name: String,
    #[serde(rename = "type")]
    account_type: String,
    avatar: Option<String>,
    bio: Option<String>,
    #[serde(rename = "agentId")]
    agent_id: Option<Uuid>,
}

/// POST /api/accounts — Create account + proxy user
async fn create_account(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateAccountBody>,
) -> (StatusCode, Json<Value>) {
    // Validate type
    if body.account_type != "official" && body.account_type != "lounge" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "type must be 'official' or 'lounge'" })),
        );
    }

    // Validate name length
    if body.name.is_empty() || body.name.len() > 100 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "name must be between 1 and 100 characters" })),
        );
    }

    // Check unique constraint (owner_id + type)
    let existing = sqlx::query_as::<_, (Uuid,)>(
        r#"SELECT id FROM accounts WHERE owner_id = $1 AND type = $2"#,
    )
    .bind(&user.id)
    .bind(&body.account_type)
    .fetch_optional(&state.db)
    .await;

    if let Ok(Some(_)) = existing {
        return (
            StatusCode::CONFLICT,
            Json(json!({ "error": "You already have an account of this type" })),
        );
    }

    // Begin transaction for account + proxy user creation
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("create_account: begin tx failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Create account
    let account_id = match sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO accounts (name, type, owner_id, avatar, bio, agent_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id"#,
    )
    .bind(&body.name)
    .bind(&body.account_type)
    .bind(&user.id)
    .bind(body.avatar.as_deref())
    .bind(body.bio.as_deref())
    .bind(body.agent_id)
    .fetch_one(&mut *tx)
    .await
    {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("create_account: insert account failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Phase 2 - Create proxy user
    let proxy_user_id = format!("account_{}", account_id);
    let proxy_email = format!("{}@account.local", body.name);

    if let Err(e) = sqlx::query(
        r#"INSERT INTO "user" (id, name, email, image)
           VALUES ($1, $2, $3, $4)"#,
    )
    .bind(&proxy_user_id)
    .bind(&body.name)
    .bind(&proxy_email)
    .bind(body.avatar.as_deref())
    .execute(&mut *tx)
    .await
    {
        tracing::error!("create_account: insert proxy user failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    // Update account with proxy_user_id
    if let Err(e) = sqlx::query(
        r#"UPDATE accounts SET proxy_user_id = $1 WHERE id = $2"#,
    )
    .bind(&proxy_user_id)
    .bind(account_id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("create_account: update proxy_user_id failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("create_account: commit failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    (
        StatusCode::CREATED,
        Json(json!({
            "id": account_id,
            "name": body.name,
            "type": body.account_type,
            "proxyUserId": proxy_user_id,
        })),
    )
}

/// GET /api/accounts — List user's own accounts
async fn list_accounts(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    #[derive(sqlx::FromRow)]
    struct AccountRow {
        id: Uuid,
        name: String,
        #[sqlx(rename = "type")]
        account_type: String,
        avatar: Option<String>,
        bio: Option<String>,
        agent_id: Option<Uuid>,
        proxy_user_id: Option<String>,
        ai_mode: Option<String>,
        system_prompt: Option<String>,
        api_key: Option<String>,
        model: Option<String>,
        context_window: Option<i32>,
        voice_sample_url: Option<String>,
        voice_clone_id: Option<String>,
        created_at: DateTime<Utc>,
        updated_at: DateTime<Utc>,
    }

    let rows = sqlx::query_as::<_, AccountRow>(
        r#"SELECT id, name, type, avatar, bio, agent_id, proxy_user_id,
                  ai_mode, system_prompt, api_key, model, context_window,
                  voice_sample_url, voice_clone_id, created_at, updated_at
           FROM accounts
           WHERE owner_id = $1
           ORDER BY created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let accounts: Vec<Value> = rows
                .iter()
                .map(|r| {
                    // Mask API key: show only last 4 chars
                    let masked_key = r.api_key.as_ref().map(|k| {
                        if k.len() > 4 {
                            format!("****{}", &k[k.len() - 4..])
                        } else {
                            "****".to_string()
                        }
                    });
                    json!({
                        "id": r.id,
                        "name": r.name,
                        "type": r.account_type,
                        "avatar": r.avatar,
                        "bio": r.bio,
                        "agentId": r.agent_id,
                        "proxyUserId": r.proxy_user_id,
                        "aiMode": r.ai_mode,
                        "systemPrompt": r.system_prompt,
                        "apiKey": masked_key,
                        "model": r.model,
                        "contextWindow": r.context_window,
                        "voiceSampleUrl": r.voice_sample_url,
                        "voiceCloneId": r.voice_clone_id,
                        "createdAt": r.created_at.to_rfc3339(),
                        "updatedAt": r.updated_at.to_rfc3339(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!(accounts)))
        }
        Err(e) => {
            tracing::error!("list_accounts failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

#[derive(Deserialize)]
struct UpdateAccountBody {
    name: Option<String>,
    avatar: Option<String>,
    bio: Option<String>,
    #[serde(rename = "agentId")]
    agent_id: Option<Uuid>,
    #[serde(rename = "aiMode")]
    ai_mode: Option<String>,
    #[serde(rename = "systemPrompt")]
    system_prompt: Option<String>,
    #[serde(rename = "apiKey")]
    api_key: Option<String>,
    model: Option<String>,
    #[serde(rename = "contextWindow")]
    context_window: Option<i32>,
    #[serde(rename = "voiceSampleUrl")]
    voice_sample_url: Option<String>,
    #[serde(rename = "voiceCloneId")]
    voice_clone_id: Option<String>,
}

/// PATCH /api/accounts/:id — Update account (verify owner)
async fn update_account(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateAccountBody>,
) -> (StatusCode, Json<Value>) {
    // Verify ownership
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM accounts WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match &owner {
        Ok(Some(owner_id)) if owner_id == &user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Not the account owner" })),
            );
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Account not found" })),
            );
        }
        Err(e) => {
            tracing::error!("update_account: fetch owner failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    }

    // Validate name if provided
    if let Some(ref name) = body.name {
        if name.is_empty() || name.len() > 100 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "name must be between 1 and 100 characters" })),
            );
        }
    }

    // Build dynamic update query
    let mut set_clauses: Vec<String> = Vec::new();
    let mut param_index = 2u32; // $1 is id

    macro_rules! push_field {
        ($field:expr, $col:expr) => {
            if $field.is_some() {
                set_clauses.push(format!("{} = ${}", $col, param_index));
                param_index += 1;
            }
        };
    }

    push_field!(body.name, "name");
    push_field!(body.avatar, "avatar");
    push_field!(body.bio, "bio");
    push_field!(body.agent_id, "agent_id");
    push_field!(body.ai_mode, "ai_mode");
    push_field!(body.system_prompt, "system_prompt");
    push_field!(body.api_key, "api_key");
    push_field!(body.model, "model");
    push_field!(body.context_window, "context_window");
    push_field!(body.voice_sample_url, "voice_sample_url");
    push_field!(body.voice_clone_id, "voice_clone_id");
    let _ = param_index; // suppress unused_assignments warning

    if set_clauses.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "No fields to update" })),
        );
    }

    set_clauses.push("updated_at = NOW()".to_string());

    let sql = format!(
        "UPDATE accounts SET {} WHERE id = $1",
        set_clauses.join(", ")
    );

    let mut query = sqlx::query(&sql).bind(id);

    if let Some(ref name) = body.name {
        query = query.bind(name);
    }
    if let Some(ref avatar) = body.avatar {
        query = query.bind(avatar);
    }
    if let Some(ref bio) = body.bio {
        query = query.bind(bio);
    }
    if let Some(ref agent_id) = body.agent_id {
        query = query.bind(agent_id);
    }
    if let Some(ref ai_mode) = body.ai_mode {
        query = query.bind(ai_mode);
    }
    if let Some(ref system_prompt) = body.system_prompt {
        query = query.bind(system_prompt);
    }
    if let Some(ref api_key) = body.api_key {
        query = query.bind(api_key);
    }
    if let Some(ref model) = body.model {
        query = query.bind(model);
    }
    if let Some(ref context_window) = body.context_window {
        query = query.bind(context_window);
    }
    if let Some(ref voice_sample_url) = body.voice_sample_url {
        query = query.bind(voice_sample_url);
    }
    if let Some(ref voice_clone_id) = body.voice_clone_id {
        query = query.bind(voice_clone_id);
    }

    let result = query.execute(&state.db).await;

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("update_account failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

/// DELETE /api/accounts/:id — Delete account (verify owner)
async fn delete_account(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let result = sqlx::query(
        "DELETE FROM accounts WHERE id = $1 AND owner_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => (
            StatusCode::OK,
            Json(json!({ "success": true })),
        ),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Account not found or not owned by you" })),
        ),
        Err(e) => {
            tracing::error!("delete_account failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

/// GET /api/accounts/:id/conversations — List conversations for this account
async fn list_account_conversations(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Verify ownership
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM accounts WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match &owner {
        Ok(Some(owner_id)) if owner_id == &user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Not the account owner" })),
            );
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Account not found" })),
            );
        }
        Err(e) => {
            tracing::error!("list_account_conversations: fetch owner failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    }

    #[derive(sqlx::FromRow)]
    struct ConversationRow {
        id: Uuid,
        title: Option<String>,
        #[sqlx(rename = "type")]
        conv_type: Option<String>,
        user_id: String,
        created_at: DateTime<Utc>,
        updated_at: DateTime<Utc>,
    }

    let rows = sqlx::query_as::<_, ConversationRow>(
        r#"SELECT c.id, c.title, c.type, c.user_id, c.created_at, c.updated_at
           FROM conversations c
           JOIN account_subscribers s ON s.conversation_id = c.id
           WHERE s.account_id = $1
           ORDER BY c.updated_at DESC"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let conversations: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "title": r.title,
                        "type": r.conv_type,
                        "userId": r.user_id,
                        "createdAt": r.created_at.to_rfc3339(),
                        "updatedAt": r.updated_at.to_rfc3339(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!(conversations)))
        }
        Err(e) => {
            tracing::error!("list_account_conversations failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ===========================================================================
// Phase 4 - Broadcast + Subscribers
// ===========================================================================

#[derive(Deserialize)]
struct BroadcastBody {
    content: String,
}

/// POST /api/accounts/:id/broadcast — Send message to all subscribers' conversations
async fn broadcast_message(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<BroadcastBody>,
) -> (StatusCode, Json<Value>) {
    // Verify ownership
    let account = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT owner_id, proxy_user_id FROM accounts WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let proxy_user_id = match account {
        Ok(Some((owner_id, proxy_user_id))) if owner_id == user.id => {
            match proxy_user_id {
                Some(pid) => pid,
                None => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({ "error": "Account has no proxy user" })),
                    );
                }
            }
        }
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Not the account owner" })),
            );
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Account not found" })),
            );
        }
        Err(e) => {
            tracing::error!("broadcast_message: fetch account failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Get all subscriber conversation IDs
    let conversations = sqlx::query_as::<_, (Uuid,)>(
        "SELECT conversation_id FROM account_subscribers WHERE account_id = $1",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    let conversation_ids = match conversations {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("broadcast_message: fetch subscribers failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    if conversation_ids.is_empty() {
        return (
            StatusCode::OK,
            Json(json!({ "sent": 0 })),
        );
    }

    let mut sent_count = 0i64;
    for (conv_id,) in &conversation_ids {
        let result = sqlx::query(
            r#"INSERT INTO messages (conversation_id, sender_id, content, type)
               VALUES ($1, $2, $3, 'text')"#,
        )
        .bind(conv_id)
        .bind(&proxy_user_id)
        .bind(&body.content)
        .execute(&state.db)
        .await;

        match result {
            Ok(_) => sent_count += 1,
            Err(e) => {
                tracing::error!("broadcast_message: insert message to conv {} failed: {}", conv_id, e);
            }
        }
    }

    (
        StatusCode::OK,
        Json(json!({ "sent": sent_count, "total": conversation_ids.len() })),
    )
}

/// GET /api/accounts/:id/subscribers — List subscribers (verify owner)
async fn list_subscribers(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Verify ownership
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM accounts WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match &owner {
        Ok(Some(owner_id)) if owner_id == &user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Not the account owner" })),
            );
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Account not found" })),
            );
        }
        Err(e) => {
            tracing::error!("list_subscribers: fetch owner failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    }

    #[derive(sqlx::FromRow)]
    struct SubscriberRow {
        user_id: String,
        user_name: String,
        user_image: Option<String>,
        conversation_id: Uuid,
        subscribed_at: DateTime<Utc>,
    }

    let rows = sqlx::query_as::<_, SubscriberRow>(
        r#"SELECT s.user_id, u.name AS user_name, u.image AS user_image,
                  s.conversation_id, s.subscribed_at
           FROM account_subscribers s
           JOIN "user" u ON u.id = s.user_id
           WHERE s.account_id = $1
           ORDER BY s.subscribed_at DESC"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let subscribers: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "userId": r.user_id,
                        "userName": r.user_name,
                        "userImage": r.user_image,
                        "conversationId": r.conversation_id,
                        "subscribedAt": r.subscribed_at.to_rfc3339(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "subscribers": subscribers })))
        }
        Err(e) => {
            tracing::error!("list_subscribers failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

/// POST /api/accounts/:id/subscribe — Subscribe to account (any user)
async fn subscribe(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Verify account exists
    let account = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT name, proxy_user_id FROM accounts WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let (account_name, proxy_user_id) = match account {
        Ok(Some(a)) => a,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Account not found" })),
            );
        }
        Err(e) => {
            tracing::error!("subscribe: fetch account failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Check if already subscribed
    let existing = sqlx::query_as::<_, (Uuid,)>(
        "SELECT conversation_id FROM account_subscribers WHERE account_id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    if let Ok(Some((conv_id,))) = existing {
        return (
            StatusCode::OK,
            Json(json!({ "conversationId": conv_id, "existing": true })),
        );
    }

    // Create conversation for this subscription
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("subscribe: begin tx failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    let conv_id = match sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO conversations (title, type, user_id, agent_id)
           VALUES ($1, 'account', $2, NULL)
           RETURNING id"#,
    )
    .bind(&account_name)
    .bind(&user.id)
    .fetch_one(&mut *tx)
    .await
    {
        Ok(cid) => cid,
        Err(e) => {
            tracing::error!("subscribe: create conversation failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Add proxy user as participant if exists
    if let Some(ref pid) = proxy_user_id {
        let _ = sqlx::query(
            r#"INSERT INTO conversation_participants (conversation_id, user_id)
               VALUES ($1, $2)
               ON CONFLICT DO NOTHING"#,
        )
        .bind(conv_id)
        .bind(pid)
        .execute(&mut *tx)
        .await;
    }

    if let Err(e) = sqlx::query(
        r#"INSERT INTO account_subscribers (account_id, user_id, conversation_id)
           VALUES ($1, $2, $3)"#,
    )
    .bind(id)
    .bind(&user.id)
    .bind(conv_id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("subscribe: insert subscriber failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("subscribe: commit failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    (
        StatusCode::CREATED,
        Json(json!({ "conversationId": conv_id, "existing": false })),
    )
}

/// DELETE /api/accounts/:id/subscribe — Unsubscribe
async fn unsubscribe(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let result = sqlx::query(
        "DELETE FROM account_subscribers WHERE account_id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => (
            StatusCode::OK,
            Json(json!({ "success": true })),
        ),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Subscription not found" })),
        ),
        Err(e) => {
            tracing::error!("unsubscribe failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ===========================================================================
// Phase 5 - Voice sample upload
// ===========================================================================

#[derive(Deserialize)]
struct VoiceSampleBody {
    url: String,
}

/// POST /api/accounts/:id/voice-sample — Upload voice sample URL
async fn upload_voice_sample(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<VoiceSampleBody>,
) -> (StatusCode, Json<Value>) {
    // Verify ownership and type
    let account = sqlx::query_as::<_, (String, String)>(
        "SELECT owner_id, type FROM accounts WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match &account {
        Ok(Some((owner_id, account_type))) if owner_id == &user.id => {
            if account_type != "lounge" {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "error": "Voice samples are only for lounge accounts" })),
                );
            }
        }
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Not the account owner" })),
            );
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Account not found" })),
            );
        }
        Err(e) => {
            tracing::error!("upload_voice_sample: fetch account failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    }

    let result = sqlx::query(
        "UPDATE accounts SET voice_sample_url = $1, updated_at = NOW() WHERE id = $2",
    )
    .bind(&body.url)
    .bind(id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("upload_voice_sample failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ===========================================================================
// Phase 7 - Gifts
// ===========================================================================

#[derive(Deserialize)]
struct SendGiftBody {
    #[serde(rename = "giftType")]
    gift_type: String,
    amount: i64,
    message: Option<String>,
}

/// POST /api/accounts/:id/gifts — Send gift
async fn send_gift(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<SendGiftBody>,
) -> (StatusCode, Json<Value>) {
    // Verify account exists
    let exists = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM accounts WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match exists {
        Ok(Some(_)) => {}
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Account not found" })),
            );
        }
        Err(e) => {
            tracing::error!("send_gift: fetch account failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    }

    let result = sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO gifts (to_account_id, from_user_id, gift_type, amount, message)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id"#,
    )
    .bind(id)
    .bind(&user.id)
    .bind(&body.gift_type)
    .bind(body.amount)
    .bind(body.message.as_deref())
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(gift_id) => (
            StatusCode::CREATED,
            Json(json!({ "id": gift_id })),
        ),
        Err(e) => {
            tracing::error!("send_gift failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

/// GET /api/accounts/:id/gifts — Get gift report (verify owner)
async fn get_gift_report(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Verify ownership
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM accounts WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match &owner {
        Ok(Some(owner_id)) if owner_id == &user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Not the account owner" })),
            );
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Account not found" })),
            );
        }
        Err(e) => {
            tracing::error!("get_gift_report: fetch owner failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    }

    #[derive(sqlx::FromRow)]
    struct GiftSummaryRow {
        gift_type: String,
        total_count: i64,
        total_amount: i64,
    }

    let rows = sqlx::query_as::<_, GiftSummaryRow>(
        r#"SELECT gift_type, COUNT(*) AS total_count, COALESCE(SUM(amount), 0) AS total_amount
           FROM gifts
           WHERE to_account_id = $1
           GROUP BY gift_type
           ORDER BY total_amount DESC"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let gifts: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "giftType": r.gift_type,
                        "totalCount": r.total_count,
                        "totalAmount": r.total_amount,
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "gifts": gifts })))
        }
        Err(e) => {
            tracing::error!("get_gift_report failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ===========================================================================
// Phase 8 - Analytics
// ===========================================================================

/// GET /api/accounts/:id/analytics — Get analytics (verify owner)
async fn get_analytics(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Verify ownership
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM accounts WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match &owner {
        Ok(Some(owner_id)) if owner_id == &user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Not the account owner" })),
            );
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Account not found" })),
            );
        }
        Err(e) => {
            tracing::error!("get_analytics: fetch owner failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    }

    // Subscriber count
    let subscriber_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM account_subscribers WHERE account_id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    // Total gifts and amount
    #[derive(sqlx::FromRow)]
    struct GiftTotals {
        total_gifts: i64,
        total_gift_amount: i64,
    }

    let gift_totals = sqlx::query_as::<_, GiftTotals>(
        r#"SELECT COUNT(*) AS total_gifts, COALESCE(SUM(amount), 0) AS total_gift_amount
           FROM gifts WHERE to_account_id = $1"#,
    )
    .bind(id)
    .fetch_one(&state.db)
    .await;

    let (total_gifts, total_gift_amount) = match gift_totals {
        Ok(t) => (t.total_gifts, t.total_gift_amount),
        Err(_) => (0, 0),
    };

    // Conversation count
    let conversation_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM account_subscribers WHERE account_id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    // Daily stats for last 30 days
    #[derive(sqlx::FromRow)]
    struct DailyStatRow {
        day: chrono::NaiveDate,
        new_subscribers: i64,
        gifts_received: i64,
        gift_amount: i64,
    }

    let daily_stats = sqlx::query_as::<_, DailyStatRow>(
        r#"SELECT d.day,
                  COALESCE(s.cnt, 0) AS new_subscribers,
                  COALESCE(g.cnt, 0) AS gifts_received,
                  COALESCE(g.amt, 0) AS gift_amount
           FROM generate_series(
               CURRENT_DATE - INTERVAL '29 days',
               CURRENT_DATE,
               '1 day'::interval
           ) AS d(day)
           LEFT JOIN (
               SELECT DATE(subscribed_at) AS day, COUNT(*) AS cnt
               FROM account_subscribers
               WHERE account_id = $1
                 AND subscribed_at >= CURRENT_DATE - INTERVAL '29 days'
               GROUP BY DATE(subscribed_at)
           ) s ON s.day = d.day
           LEFT JOIN (
               SELECT DATE(created_at) AS day, COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS amt
               FROM gifts
               WHERE to_account_id = $1
                 AND created_at >= CURRENT_DATE - INTERVAL '29 days'
               GROUP BY DATE(created_at)
           ) g ON g.day = d.day
           ORDER BY d.day"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    let daily = match daily_stats {
        Ok(rows) => rows
            .iter()
            .map(|r| {
                json!({
                    "date": r.day.to_string(),
                    "newSubscribers": r.new_subscribers,
                    "giftsReceived": r.gifts_received,
                    "giftAmount": r.gift_amount,
                })
            })
            .collect::<Vec<Value>>(),
        Err(e) => {
            tracing::error!("get_analytics: daily stats query failed: {}", e);
            vec![]
        }
    };

    (
        StatusCode::OK,
        Json(json!({
            "subscriberCount": subscriber_count,
            "totalGifts": total_gifts,
            "totalGiftAmount": total_gift_amount,
            "conversationCount": conversation_count,
            "daily": daily,
        })),
    )
}

// ===========================================================================
// Explore endpoints (public)
// ===========================================================================

#[derive(sqlx::FromRow)]
struct ExploreAccountRow {
    id: Uuid,
    name: String,
    avatar: Option<String>,
    bio: Option<String>,
    owner_id: String,
    owner_name: String,
    owner_image: Option<String>,
    subscriber_count: i64,
    created_at: DateTime<Utc>,
}

/// GET /api/explore/official — List all official accounts (public)
async fn explore_official(
    State(state): State<AppState>,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, ExploreAccountRow>(
        r#"SELECT a.id, a.name, a.avatar, a.bio, a.owner_id,
                  u.name AS owner_name, u.image AS owner_image,
                  (SELECT COUNT(*) FROM account_subscribers WHERE account_id = a.id) AS subscriber_count,
                  a.created_at
           FROM accounts a
           JOIN "user" u ON u.id = a.owner_id
           WHERE a.type = 'official'
           ORDER BY subscriber_count DESC, a.created_at DESC"#,
    )
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let accounts: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "name": r.name,
                        "avatar": r.avatar,
                        "bio": r.bio,
                        "ownerId": r.owner_id,
                        "ownerName": r.owner_name,
                        "ownerImage": r.owner_image,
                        "subscriberCount": r.subscriber_count,
                        "createdAt": r.created_at.to_rfc3339(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!(accounts)))
        }
        Err(e) => {
            tracing::error!("explore_official failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

/// GET /api/explore/lounge — List all lounge accounts (public)
async fn explore_lounge(
    State(state): State<AppState>,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, ExploreAccountRow>(
        r#"SELECT a.id, a.name, a.avatar, a.bio, a.owner_id,
                  u.name AS owner_name, u.image AS owner_image,
                  (SELECT COUNT(*) FROM account_subscribers WHERE account_id = a.id) AS subscriber_count,
                  a.created_at
           FROM accounts a
           JOIN "user" u ON u.id = a.owner_id
           WHERE a.type = 'lounge'
           ORDER BY subscriber_count DESC, a.created_at DESC"#,
    )
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let accounts: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "name": r.name,
                        "avatar": r.avatar,
                        "bio": r.bio,
                        "ownerId": r.owner_id,
                        "ownerName": r.owner_name,
                        "ownerImage": r.owner_image,
                        "subscriberCount": r.subscriber_count,
                        "createdAt": r.created_at.to_rfc3339(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!(accounts)))
        }
        Err(e) => {
            tracing::error!("explore_lounge failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}
