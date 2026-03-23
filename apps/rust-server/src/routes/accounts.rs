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
        .route("/api/accounts/{id}", get(get_account).patch(update_account).delete(delete_account))
        .route("/api/accounts/{id}/conversations", get(list_account_conversations))
        .route("/api/accounts/{id}/broadcast", post(broadcast_message))
        .route("/api/accounts/{id}/subscribers", get(list_subscribers))
        .route("/api/accounts/{id}/subscribe", post(subscribe).delete(unsubscribe))
        .route("/api/accounts/{id}/voice-sample", post(upload_voice_sample))
        .route("/api/accounts/{id}/gifts", post(send_gift).get(get_gift_report))
        .route("/api/accounts/{id}/analytics", get(get_analytics))
        .route("/api/explore/official", get(explore_official))
        .route("/api/explore/lounge", get(explore_lounge))
        // Broadcast CRUD
        .route("/api/accounts/{id}/broadcasts", get(list_broadcasts).post(create_broadcast))
        .route(
            "/api/accounts/{id}/broadcasts/{broadcast_id}",
            patch(update_broadcast).delete(delete_broadcast),
        )
        .route("/api/accounts/{id}/broadcasts/{broadcast_id}/send", post(send_broadcast))
        // Subscriber management
        .route("/api/accounts/{id}/subscribers/{user_id}/block", post(block_subscriber))
        .route("/api/accounts/{id}/subscribers/{user_id}/unblock", post(unblock_subscriber))
        // Subscriber tags
        .route("/api/accounts/{id}/tags", get(list_tags).post(create_tag))
        .route("/api/accounts/{id}/tags/{tag_id}", axum::routing::delete(delete_tag))
        .route("/api/accounts/{id}/subscribers/{user_id}/tags", post(assign_tag).delete(remove_tag))
        // Knowledge base
        .route("/api/accounts/{id}/knowledge", get(list_knowledge).post(create_knowledge))
        .route("/api/accounts/{id}/knowledge/{kb_id}", axum::routing::delete(delete_knowledge))
        // Lounge: Persona (uses update_account for fields)
        // Lounge: Diary CRUD
        .route("/api/accounts/{id}/diaries", get(list_diaries).post(create_diary))
        .route("/api/accounts/{id}/diaries/{diary_id}", patch(update_diary).delete(delete_diary))
        // Lounge: Preview (simulation)
        .route("/api/accounts/{id}/preview", post(create_preview_message).delete(clear_preview))
        .route("/api/accounts/{id}/preview/messages", get(list_preview_messages))
        // Lounge: Gift catalog + token system
        .route("/api/gifts/catalog", get(list_gift_catalog))
        .route("/api/gifts/send", post(send_gift_v2))
        .route("/api/tokens/balance", get(get_token_balance))
        .route("/api/tokens/topup", post(topup_tokens))
        .route("/api/tokens/transactions", get(list_token_transactions))
        // Lounge: Fan levels + leaderboard
        .route("/api/accounts/{id}/fans", get(list_fans))
        .route("/api/accounts/{id}/gifts/leaderboard", get(gift_leaderboard))
        // Lounge: Voice samples
        .route("/api/accounts/{id}/voice-samples", get(list_voice_samples).post(add_voice_sample))
        .route("/api/accounts/{id}/voice-samples/{sample_id}", axum::routing::delete(delete_voice_sample))
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
        is_public: bool,
        category: Option<String>,
        welcome_enabled: bool,
        welcome_message: Option<String>,
        auto_reply_mode: Option<String>,
        auto_reply_system_prompt: Option<String>,
        auto_reply_webhook_url: Option<String>,
        persona_catchphrase: Option<String>,
        persona_tone: Option<String>,
        persona_personality: Option<String>,
        persona_template: Option<String>,
        persona_age: Option<i32>,
        persona_interests: Option<String>,
        persona_backstory: Option<String>,
        persona_intro: Option<String>,
        persona_forbidden_topics: Option<String>,
        pricing_mode: Option<String>,
        pricing_amount: Option<i32>,
        free_trial_messages: Option<i32>,
        voice_model_status: Option<String>,
        created_at: DateTime<Utc>,
        updated_at: DateTime<Utc>,
    }

    let rows = sqlx::query_as::<_, AccountRow>(
        r#"SELECT id, name, type, avatar, bio, agent_id, proxy_user_id,
                  ai_mode, system_prompt, api_key, model, context_window,
                  voice_sample_url, voice_clone_id,
                  is_public, category, welcome_enabled, welcome_message,
                  auto_reply_mode, auto_reply_system_prompt, auto_reply_webhook_url,
                  persona_catchphrase, persona_tone, persona_personality, persona_template,
                  persona_age, persona_interests, persona_backstory, persona_intro,
                  persona_forbidden_topics, pricing_mode, pricing_amount, free_trial_messages,
                  voice_model_status,
                  created_at, updated_at
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
                        "isPublic": r.is_public,
                        "category": r.category,
                        "welcomeEnabled": r.welcome_enabled,
                        "welcomeMessage": r.welcome_message,
                        "autoReplyMode": r.auto_reply_mode,
                        "autoReplySystemPrompt": r.auto_reply_system_prompt,
                        "autoReplyWebhookUrl": r.auto_reply_webhook_url,
                        "personaCatchphrase": r.persona_catchphrase,
                        "personaTone": r.persona_tone,
                        "personaPersonality": r.persona_personality,
                        "personaTemplate": r.persona_template,
                        "personaAge": r.persona_age,
                        "personaInterests": r.persona_interests,
                        "personaBackstory": r.persona_backstory,
                        "personaIntro": r.persona_intro,
                        "personaForbiddenTopics": r.persona_forbidden_topics,
                        "pricingMode": r.pricing_mode,
                        "pricingAmount": r.pricing_amount,
                        "freeTrialMessages": r.free_trial_messages,
                        "voiceModelStatus": r.voice_model_status,
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

/// GET /api/accounts/:id — Get single account (verify owner)
async fn get_account(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    #[derive(Debug, sqlx::FromRow)]
    struct Row {
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
        is_public: bool,
        category: Option<String>,
        welcome_enabled: bool,
        welcome_message: Option<String>,
        auto_reply_mode: Option<String>,
        auto_reply_system_prompt: Option<String>,
        auto_reply_webhook_url: Option<String>,
        persona_catchphrase: Option<String>,
        persona_tone: Option<String>,
        persona_personality: Option<String>,
        persona_template: Option<String>,
        persona_age: Option<i32>,
        persona_interests: Option<String>,
        persona_backstory: Option<String>,
        persona_intro: Option<String>,
        persona_forbidden_topics: Option<String>,
        pricing_mode: Option<String>,
        pricing_amount: Option<i32>,
        free_trial_messages: Option<i32>,
        voice_model_status: Option<String>,
        created_at: DateTime<Utc>,
        updated_at: DateTime<Utc>,
    }

    let row = sqlx::query_as::<_, Row>(
        r#"SELECT id, name, type, avatar, bio, agent_id, proxy_user_id,
                  ai_mode, system_prompt, api_key, model, context_window,
                  voice_sample_url, voice_clone_id,
                  is_public, category, welcome_enabled, welcome_message,
                  auto_reply_mode, auto_reply_system_prompt, auto_reply_webhook_url,
                  persona_catchphrase, persona_tone, persona_personality, persona_template,
                  persona_age, persona_interests, persona_backstory, persona_intro,
                  persona_forbidden_topics, pricing_mode, pricing_amount, free_trial_messages,
                  voice_model_status,
                  created_at, updated_at
           FROM accounts
           WHERE id = $1 AND owner_id = $2"#,
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(r)) => {
            let masked_key = r.api_key.as_ref().map(|k| {
                if k.len() > 4 { format!("****{}", &k[k.len() - 4..]) } else { "****".to_string() }
            });
            (StatusCode::OK, Json(json!({
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
                "isPublic": r.is_public,
                "category": r.category,
                "welcomeEnabled": r.welcome_enabled,
                "welcomeMessage": r.welcome_message,
                "autoReplyMode": r.auto_reply_mode,
                "autoReplySystemPrompt": r.auto_reply_system_prompt,
                "autoReplyWebhookUrl": r.auto_reply_webhook_url,
                "personaCatchphrase": r.persona_catchphrase,
                "personaTone": r.persona_tone,
                "personaPersonality": r.persona_personality,
                "personaTemplate": r.persona_template,
                "personaAge": r.persona_age,
                "personaInterests": r.persona_interests,
                "personaBackstory": r.persona_backstory,
                "personaIntro": r.persona_intro,
                "personaForbiddenTopics": r.persona_forbidden_topics,
                "pricingMode": r.pricing_mode,
                "pricingAmount": r.pricing_amount,
                "freeTrialMessages": r.free_trial_messages,
                "voiceModelStatus": r.voice_model_status,
                "createdAt": r.created_at.to_rfc3339(),
                "updatedAt": r.updated_at.to_rfc3339(),
            })))
        }
        Ok(None) => (StatusCode::NOT_FOUND, Json(json!({ "error": "Account not found" }))),
        Err(e) => {
            tracing::error!("get_account failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
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
    // Official-specific
    #[serde(rename = "coverImageUrl")]
    cover_image_url: Option<String>,
    #[serde(rename = "isPublic")]
    is_public: Option<bool>,
    #[serde(rename = "isPublished")]
    is_published: Option<bool>,
    category: Option<String>,
    #[serde(rename = "welcomeEnabled")]
    welcome_enabled: Option<bool>,
    #[serde(rename = "welcomeMessage")]
    welcome_message: Option<String>,
    #[serde(rename = "autoReplyMode")]
    auto_reply_mode: Option<String>,
    #[serde(rename = "autoReplySystemPrompt")]
    auto_reply_system_prompt: Option<String>,
    #[serde(rename = "autoReplyWebhookUrl")]
    auto_reply_webhook_url: Option<String>,
    // Lounge-specific
    #[serde(rename = "personaCatchphrase")]
    persona_catchphrase: Option<String>,
    #[serde(rename = "personaTone")]
    persona_tone: Option<String>,
    #[serde(rename = "personaPersonality")]
    persona_personality: Option<String>,
    #[serde(rename = "personaTemplate")]
    persona_template: Option<String>,
    #[serde(rename = "personaAge")]
    persona_age: Option<i32>,
    #[serde(rename = "personaInterests")]
    persona_interests: Option<String>,
    #[serde(rename = "personaBackstory")]
    persona_backstory: Option<String>,
    #[serde(rename = "personaIntro")]
    persona_intro: Option<String>,
    #[serde(rename = "personaForbiddenTopics")]
    persona_forbidden_topics: Option<String>,
    #[serde(rename = "pricingMode")]
    pricing_mode: Option<String>,
    #[serde(rename = "pricingAmount")]
    pricing_amount: Option<i32>,
    #[serde(rename = "freeTrialMessages")]
    free_trial_messages: Option<i32>,
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
    push_field!(body.cover_image_url, "cover_image_url");
    push_field!(body.is_public, "is_public");
    push_field!(body.is_published, "is_published");
    push_field!(body.category, "category");
    push_field!(body.welcome_enabled, "welcome_enabled");
    push_field!(body.welcome_message, "welcome_message");
    push_field!(body.auto_reply_mode, "auto_reply_mode");
    push_field!(body.auto_reply_system_prompt, "auto_reply_system_prompt");
    push_field!(body.auto_reply_webhook_url, "auto_reply_webhook_url");
    push_field!(body.persona_catchphrase, "persona_catchphrase");
    push_field!(body.persona_tone, "persona_tone");
    push_field!(body.persona_personality, "persona_personality");
    push_field!(body.persona_template, "persona_template");
    push_field!(body.persona_age, "persona_age");
    push_field!(body.persona_interests, "persona_interests");
    push_field!(body.persona_backstory, "persona_backstory");
    push_field!(body.persona_intro, "persona_intro");
    push_field!(body.persona_forbidden_topics, "persona_forbidden_topics");
    push_field!(body.pricing_mode, "pricing_mode");
    push_field!(body.pricing_amount, "pricing_amount");
    push_field!(body.free_trial_messages, "free_trial_messages");
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
    if let Some(ref cover_image_url) = body.cover_image_url {
        query = query.bind(cover_image_url);
    }
    if let Some(ref is_public) = body.is_public {
        query = query.bind(is_public);
    }
    if let Some(ref is_published) = body.is_published {
        query = query.bind(is_published);
    }
    if let Some(ref category) = body.category {
        query = query.bind(category);
    }
    if let Some(ref welcome_enabled) = body.welcome_enabled {
        query = query.bind(welcome_enabled);
    }
    if let Some(ref welcome_message) = body.welcome_message {
        query = query.bind(welcome_message);
    }
    if let Some(ref auto_reply_mode) = body.auto_reply_mode {
        query = query.bind(auto_reply_mode);
    }
    if let Some(ref auto_reply_system_prompt) = body.auto_reply_system_prompt {
        query = query.bind(auto_reply_system_prompt);
    }
    if let Some(ref auto_reply_webhook_url) = body.auto_reply_webhook_url {
        query = query.bind(auto_reply_webhook_url);
    }
    if let Some(ref persona_catchphrase) = body.persona_catchphrase {
        query = query.bind(persona_catchphrase);
    }
    if let Some(ref persona_tone) = body.persona_tone {
        query = query.bind(persona_tone);
    }
    if let Some(ref persona_personality) = body.persona_personality {
        query = query.bind(persona_personality);
    }
    if let Some(ref persona_template) = body.persona_template {
        query = query.bind(persona_template);
    }
    if let Some(ref persona_age) = body.persona_age {
        query = query.bind(persona_age);
    }
    if let Some(ref persona_interests) = body.persona_interests {
        query = query.bind(persona_interests);
    }
    if let Some(ref persona_backstory) = body.persona_backstory {
        query = query.bind(persona_backstory);
    }
    if let Some(ref persona_intro) = body.persona_intro {
        query = query.bind(persona_intro);
    }
    if let Some(ref persona_forbidden_topics) = body.persona_forbidden_topics {
        query = query.bind(persona_forbidden_topics);
    }
    if let Some(ref pricing_mode) = body.pricing_mode {
        query = query.bind(pricing_mode);
    }
    if let Some(ref pricing_amount) = body.pricing_amount {
        query = query.bind(pricing_amount);
    }
    if let Some(ref free_trial_messages) = body.free_trial_messages {
        query = query.bind(free_trial_messages);
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
           WHERE a.type = 'lounge' AND COALESCE(a.is_published, true) = true
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

// ===========================================================================
// Broadcast CRUD
// ===========================================================================

#[derive(Deserialize)]
struct CreateBroadcastBody {
    content: String,
    status: Option<String>,
    #[serde(rename = "scheduledAt")]
    scheduled_at: Option<String>,
    #[serde(rename = "targetFilter")]
    target_filter: Option<Value>,
}

async fn create_broadcast(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateBroadcastBody>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let status = body.status.as_deref().unwrap_or("draft");
    if !["draft", "scheduled"].contains(&status) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Status must be draft or scheduled" })));
    }

    let scheduled_at: Option<DateTime<Utc>> = body.scheduled_at.as_deref().and_then(|s| s.parse().ok());

    let row = sqlx::query_as::<_, (Uuid,)>(
        r#"INSERT INTO official_broadcasts (account_id, content, status, scheduled_at, target_filter)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id"#,
    )
    .bind(id)
    .bind(&body.content)
    .bind(status)
    .bind(scheduled_at)
    .bind(body.target_filter.as_ref().unwrap_or(&json!({})))
    .fetch_one(&state.db)
    .await;

    match row {
        Ok((bid,)) => (StatusCode::CREATED, Json(json!({ "id": bid }))),
        Err(e) => {
            tracing::error!("create_broadcast failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn list_broadcasts(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let rows = sqlx::query_as::<_, (Uuid, String, String, Option<DateTime<Utc>>, Option<DateTime<Utc>>, i32, i32, i32, DateTime<Utc>)>(
        r#"SELECT id, content, status, scheduled_at, sent_at, total_recipients, delivered_count, read_count, created_at
           FROM official_broadcasts
           WHERE account_id = $1
           ORDER BY created_at DESC
           LIMIT 50"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let list: Vec<Value> = rows.iter().map(|r| json!({
                "id": r.0,
                "content": r.1,
                "status": r.2,
                "scheduledAt": r.3.map(|d| d.to_rfc3339()),
                "sentAt": r.4.map(|d| d.to_rfc3339()),
                "totalRecipients": r.5,
                "deliveredCount": r.6,
                "readCount": r.7,
                "createdAt": r.8.to_rfc3339(),
            })).collect();
            (StatusCode::OK, Json(json!({ "broadcasts": list })))
        }
        Err(e) => {
            tracing::error!("list_broadcasts failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

#[derive(Deserialize)]
struct UpdateBroadcastBody {
    content: Option<String>,
    status: Option<String>,
    #[serde(rename = "scheduledAt")]
    scheduled_at: Option<String>,
}

async fn update_broadcast(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, broadcast_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateBroadcastBody>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let scheduled_at: Option<DateTime<Utc>> = body.scheduled_at.as_deref().and_then(|s| s.parse().ok());

    let result = sqlx::query(
        r#"UPDATE official_broadcasts SET
             content = COALESCE($3, content),
             status = COALESCE($4, status),
             scheduled_at = COALESCE($5, scheduled_at),
             updated_at = NOW()
           WHERE id = $1 AND account_id = $2 AND status IN ('draft', 'scheduled')"#,
    )
    .bind(broadcast_id)
    .bind(id)
    .bind(body.content.as_deref())
    .bind(body.status.as_deref())
    .bind(scheduled_at)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => (StatusCode::NOT_FOUND, Json(json!({ "error": "Broadcast not found or already sent" }))),
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("update_broadcast failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn delete_broadcast(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, broadcast_id)): Path<(Uuid, Uuid)>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let result = sqlx::query(
        "DELETE FROM official_broadcasts WHERE id = $1 AND account_id = $2",
    )
    .bind(broadcast_id)
    .bind(id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => (StatusCode::NOT_FOUND, Json(json!({ "error": "Broadcast not found" }))),
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("delete_broadcast failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

/// POST /api/accounts/:id/broadcasts/:broadcast_id/send — Send a broadcast immediately
async fn send_broadcast(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, broadcast_id)): Path<(Uuid, Uuid)>,
) -> (StatusCode, Json<Value>) {
    let account = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT owner_id, proxy_user_id FROM accounts WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let proxy_user_id = match account {
        Ok(Some((owner_id, Some(pid)))) if owner_id == user.id => pid,
        _ => return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not authorized" }))),
    };

    // Get broadcast content
    let broadcast = sqlx::query_as::<_, (String, String)>(
        "SELECT content, status FROM official_broadcasts WHERE id = $1 AND account_id = $2",
    )
    .bind(broadcast_id)
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let content = match broadcast {
        Ok(Some((c, status))) if status == "draft" || status == "scheduled" => c,
        Ok(Some(_)) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Broadcast already sent" }))),
        _ => return (StatusCode::NOT_FOUND, Json(json!({ "error": "Broadcast not found" }))),
    };

    // Get all subscriber conversations
    let conversations = sqlx::query_as::<_, (Uuid,)>(
        "SELECT conversation_id FROM account_subscribers WHERE account_id = $1 AND blocked_at IS NULL",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let total = conversations.len() as i32;
    let mut delivered = 0i32;

    for (conv_id,) in &conversations {
        if sqlx::query(
            r#"INSERT INTO messages (conversation_id, sender_id, content, type) VALUES ($1, $2, $3, 'text')"#,
        )
        .bind(conv_id)
        .bind(&proxy_user_id)
        .bind(&content)
        .execute(&state.db)
        .await
        .is_ok()
        {
            delivered += 1;
        }
    }

    // Update broadcast status
    let _ = sqlx::query(
        r#"UPDATE official_broadcasts SET status = 'sent', sent_at = NOW(),
             total_recipients = $3, delivered_count = $4
           WHERE id = $1 AND account_id = $2"#,
    )
    .bind(broadcast_id)
    .bind(id)
    .bind(total)
    .bind(delivered)
    .execute(&state.db)
    .await;

    (StatusCode::OK, Json(json!({ "sent": delivered, "total": total })))
}

// ===========================================================================
// Subscriber Management
// ===========================================================================

async fn block_subscriber(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, target_user_id)): Path<(Uuid, String)>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let result = sqlx::query(
        "UPDATE account_subscribers SET blocked_at = NOW() WHERE account_id = $1 AND user_id = $2 AND blocked_at IS NULL",
    )
    .bind(id)
    .bind(&target_user_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => (StatusCode::NOT_FOUND, Json(json!({ "error": "Subscriber not found" }))),
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("block_subscriber failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn unblock_subscriber(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, target_user_id)): Path<(Uuid, String)>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let result = sqlx::query(
        "UPDATE account_subscribers SET blocked_at = NULL WHERE account_id = $1 AND user_id = $2 AND blocked_at IS NOT NULL",
    )
    .bind(id)
    .bind(&target_user_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => (StatusCode::NOT_FOUND, Json(json!({ "error": "Subscriber not found or not blocked" }))),
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("unblock_subscriber failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

// ===========================================================================
// Subscriber Tags
// ===========================================================================

#[derive(Deserialize)]
struct CreateTagBody {
    name: String,
    color: Option<String>,
}

async fn list_tags(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let rows = sqlx::query_as::<_, (Uuid, String, String, DateTime<Utc>)>(
        "SELECT id, name, color, created_at FROM official_subscriber_tags WHERE account_id = $1 ORDER BY name",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let tags: Vec<Value> = rows.iter().map(|r| json!({
                "id": r.0, "name": r.1, "color": r.2, "createdAt": r.3.to_rfc3339(),
            })).collect();
            (StatusCode::OK, Json(json!({ "tags": tags })))
        }
        Err(e) => {
            tracing::error!("list_tags failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn create_tag(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateTagBody>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let row = sqlx::query_as::<_, (Uuid,)>(
        "INSERT INTO official_subscriber_tags (account_id, name, color) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(id)
    .bind(&body.name)
    .bind(body.color.as_deref().unwrap_or("gray"))
    .fetch_one(&state.db)
    .await;

    match row {
        Ok((tid,)) => (StatusCode::CREATED, Json(json!({ "id": tid, "name": body.name }))),
        Err(e) => {
            if e.to_string().contains("unique") || e.to_string().contains("duplicate") {
                return (StatusCode::CONFLICT, Json(json!({ "error": "Tag already exists" })));
            }
            tracing::error!("create_tag failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn delete_tag(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, tag_id)): Path<(Uuid, Uuid)>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let result = sqlx::query("DELETE FROM official_subscriber_tags WHERE id = $1 AND account_id = $2")
        .bind(tag_id)
        .bind(id)
        .execute(&state.db)
        .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => (StatusCode::NOT_FOUND, Json(json!({ "error": "Tag not found" }))),
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("delete_tag failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

#[derive(Deserialize)]
struct TagAssignBody {
    #[serde(rename = "tagId")]
    tag_id: Uuid,
}

async fn assign_tag(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, target_user_id)): Path<(Uuid, String)>,
    Json(body): Json<TagAssignBody>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    // Get subscriber ID
    let sub = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM account_subscribers WHERE account_id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&target_user_id)
    .fetch_optional(&state.db)
    .await;

    let sub_id = match sub {
        Ok(Some(sid)) => sid,
        _ => return (StatusCode::NOT_FOUND, Json(json!({ "error": "Subscriber not found" }))),
    };

    let _ = sqlx::query(
        "INSERT INTO official_subscriber_tag_assignments (subscriber_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(sub_id)
    .bind(body.tag_id)
    .execute(&state.db)
    .await;

    (StatusCode::OK, Json(json!({ "success": true })))
}

async fn remove_tag(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, target_user_id)): Path<(Uuid, String)>,
    Json(body): Json<TagAssignBody>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let sub = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM account_subscribers WHERE account_id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&target_user_id)
    .fetch_optional(&state.db)
    .await;

    let sub_id = match sub {
        Ok(Some(sid)) => sid,
        _ => return (StatusCode::NOT_FOUND, Json(json!({ "error": "Subscriber not found" }))),
    };

    let _ = sqlx::query(
        "DELETE FROM official_subscriber_tag_assignments WHERE subscriber_id = $1 AND tag_id = $2",
    )
    .bind(sub_id)
    .bind(body.tag_id)
    .execute(&state.db)
    .await;

    (StatusCode::OK, Json(json!({ "success": true })))
}

// ===========================================================================
// Knowledge Base
// ===========================================================================

#[derive(Deserialize)]
struct CreateKnowledgeBody {
    #[serde(rename = "type")]
    kb_type: String,
    title: String,
    content: Option<String>,
    #[serde(rename = "fileUrl")]
    file_url: Option<String>,
    #[serde(rename = "sourceUrl")]
    source_url: Option<String>,
}

async fn create_knowledge(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateKnowledgeBody>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    if !["file", "faq", "url"].contains(&body.kb_type.as_str()) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Type must be file, faq, or url" })));
    }

    let row = sqlx::query_as::<_, (Uuid,)>(
        r#"INSERT INTO official_knowledge_base (account_id, type, title, content, file_url, source_url, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'ready')
           RETURNING id"#,
    )
    .bind(id)
    .bind(&body.kb_type)
    .bind(&body.title)
    .bind(body.content.as_deref())
    .bind(body.file_url.as_deref())
    .bind(body.source_url.as_deref())
    .fetch_one(&state.db)
    .await;

    match row {
        Ok((kid,)) => (StatusCode::CREATED, Json(json!({ "id": kid }))),
        Err(e) => {
            tracing::error!("create_knowledge failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn list_knowledge(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let rows = sqlx::query_as::<_, (Uuid, String, String, Option<String>, Option<String>, Option<String>, String, i32, DateTime<Utc>)>(
        r#"SELECT id, type, title, content, file_url, source_url, status, chunk_count, created_at
           FROM official_knowledge_base
           WHERE account_id = $1
           ORDER BY created_at DESC"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let items: Vec<Value> = rows.iter().map(|r| json!({
                "id": r.0,
                "type": r.1,
                "title": r.2,
                "content": r.3,
                "fileUrl": r.4,
                "sourceUrl": r.5,
                "status": r.6,
                "chunkCount": r.7,
                "createdAt": r.8.to_rfc3339(),
            })).collect();
            (StatusCode::OK, Json(json!({ "items": items })))
        }
        Err(e) => {
            tracing::error!("list_knowledge failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn delete_knowledge(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, kb_id)): Path<(Uuid, Uuid)>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let result = sqlx::query("DELETE FROM official_knowledge_base WHERE id = $1 AND account_id = $2")
        .bind(kb_id)
        .bind(id)
        .execute(&state.db)
        .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => (StatusCode::NOT_FOUND, Json(json!({ "error": "Knowledge base item not found" }))),
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("delete_knowledge failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

// ===========================================================================
// Lounge: Diary CRUD
// ===========================================================================

#[derive(Deserialize)]
struct CreateDiaryBody {
    content: String,
    date: Option<String>,
    #[serde(rename = "imageUrl")]
    image_url: Option<String>,
    #[serde(rename = "isImportant")]
    is_important: Option<bool>,
}

async fn create_diary(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreateDiaryBody>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let date_str = body.date.unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());
    let is_important = body.is_important.unwrap_or(false);

    let row = sqlx::query_as::<_, (Uuid, DateTime<Utc>)>(
        r#"INSERT INTO lounge_diaries (account_id, date, content, image_url, is_important)
           VALUES ($1, $2::date, $3, $4, $5)
           RETURNING id, created_at"#,
    )
    .bind(id)
    .bind(&date_str)
    .bind(&body.content)
    .bind(body.image_url.as_deref())
    .bind(is_important)
    .fetch_one(&state.db)
    .await;

    match row {
        Ok((diary_id, created_at)) => (StatusCode::CREATED, Json(json!({
            "id": diary_id,
            "date": date_str,
            "content": body.content,
            "imageUrl": body.image_url,
            "isImportant": is_important,
            "createdAt": created_at.to_rfc3339(),
        }))),
        Err(e) => {
            tracing::error!("create_diary failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn list_diaries(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let rows = sqlx::query_as::<_, (Uuid, String, String, Option<String>, bool, DateTime<Utc>, DateTime<Utc>)>(
        r#"SELECT id, date::text, content, image_url, is_important, created_at, updated_at
           FROM lounge_diaries
           WHERE account_id = $1
           ORDER BY date DESC"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let items: Vec<Value> = rows.iter().map(|r| json!({
                "id": r.0,
                "date": r.1,
                "content": r.2,
                "imageUrl": r.3,
                "isImportant": r.4,
                "createdAt": r.5.to_rfc3339(),
                "updatedAt": r.6.to_rfc3339(),
            })).collect();
            (StatusCode::OK, Json(json!({ "diaries": items })))
        }
        Err(e) => {
            tracing::error!("list_diaries failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

#[derive(Deserialize)]
struct UpdateDiaryBody {
    content: Option<String>,
    #[serde(rename = "imageUrl")]
    image_url: Option<String>,
    #[serde(rename = "isImportant")]
    is_important: Option<bool>,
}

async fn update_diary(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, diary_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateDiaryBody>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let mut set_clauses: Vec<String> = Vec::new();
    let mut param_index = 3u32; // $1=diary_id, $2=account_id

    if body.content.is_some() { set_clauses.push(format!("content = ${}", param_index)); param_index += 1; }
    if body.image_url.is_some() { set_clauses.push(format!("image_url = ${}", param_index)); param_index += 1; }
    if body.is_important.is_some() { set_clauses.push(format!("is_important = ${}", param_index)); param_index += 1; }
    let _ = param_index;

    if set_clauses.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "No fields to update" })));
    }

    set_clauses.push("updated_at = NOW()".to_string());
    let sql = format!("UPDATE lounge_diaries SET {} WHERE id = $1 AND account_id = $2", set_clauses.join(", "));

    let mut query = sqlx::query(&sql).bind(diary_id).bind(id);
    if let Some(ref content) = body.content { query = query.bind(content); }
    if let Some(ref image_url) = body.image_url { query = query.bind(image_url); }
    if let Some(ref is_important) = body.is_important { query = query.bind(is_important); }

    match query.execute(&state.db).await {
        Ok(r) if r.rows_affected() == 0 => (StatusCode::NOT_FOUND, Json(json!({ "error": "Diary not found" }))),
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("update_diary failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn delete_diary(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, diary_id)): Path<(Uuid, Uuid)>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    match sqlx::query("DELETE FROM lounge_diaries WHERE id = $1 AND account_id = $2")
        .bind(diary_id).bind(id).execute(&state.db).await
    {
        Ok(r) if r.rows_affected() == 0 => (StatusCode::NOT_FOUND, Json(json!({ "error": "Diary not found" }))),
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("delete_diary failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

// ===========================================================================
// Lounge: Preview (Simulation) Conversations
// ===========================================================================

#[derive(Deserialize)]
struct PreviewMessageBody {
    content: String,
}

async fn create_preview_message(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<PreviewMessageBody>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    // Find or create preview conversation
    let conv_id = match sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM lounge_preview_conversations WHERE account_id = $1 LIMIT 1"
    ).bind(id).fetch_optional(&state.db).await {
        Ok(Some(cid)) => cid,
        Ok(None) => {
            match sqlx::query_scalar::<_, Uuid>(
                "INSERT INTO lounge_preview_conversations (account_id) VALUES ($1) RETURNING id"
            ).bind(id).fetch_one(&state.db).await {
                Ok(cid) => cid,
                Err(e) => {
                    tracing::error!("create_preview_message: create conv failed: {}", e);
                    return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })));
                }
            }
        }
        Err(e) => {
            tracing::error!("create_preview_message: find conv failed: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })));
        }
    };

    // Insert user message
    let user_msg = sqlx::query_as::<_, (Uuid, DateTime<Utc>)>(
        "INSERT INTO lounge_preview_messages (conversation_id, role, content) VALUES ($1, 'user', $2) RETURNING id, created_at"
    ).bind(conv_id).bind(&body.content).fetch_one(&state.db).await;

    match user_msg {
        Ok((msg_id, created_at)) => {
            // TODO: In a full implementation, call AI to generate assistant response
            // For now, return the user message
            (StatusCode::CREATED, Json(json!({
                "id": msg_id,
                "conversationId": conv_id,
                "role": "user",
                "content": body.content,
                "createdAt": created_at.to_rfc3339(),
            })))
        }
        Err(e) => {
            tracing::error!("create_preview_message failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn list_preview_messages(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let rows = sqlx::query_as::<_, (Uuid, String, String, DateTime<Utc>)>(
        r#"SELECT m.id, m.role, m.content, m.created_at
           FROM lounge_preview_messages m
           JOIN lounge_preview_conversations c ON c.id = m.conversation_id
           WHERE c.account_id = $1
           ORDER BY m.created_at ASC"#,
    ).bind(id).fetch_all(&state.db).await;

    match rows {
        Ok(rows) => {
            let messages: Vec<Value> = rows.iter().map(|r| json!({
                "id": r.0,
                "role": r.1,
                "content": r.2,
                "createdAt": r.3.to_rfc3339(),
            })).collect();
            (StatusCode::OK, Json(json!({ "messages": messages })))
        }
        Err(e) => {
            tracing::error!("list_preview_messages failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn clear_preview(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let _ = sqlx::query(
        "DELETE FROM lounge_preview_conversations WHERE account_id = $1"
    ).bind(id).execute(&state.db).await;

    (StatusCode::OK, Json(json!({ "success": true })))
}

// ===========================================================================
// Gift Catalog + Token System
// ===========================================================================

async fn list_gift_catalog(
    State(state): State<AppState>,
    _user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, (Uuid, String, String, i32, Option<String>, i32)>(
        r#"SELECT id, name, icon, price, category, sort_order
           FROM gift_catalog
           WHERE is_active = true
           ORDER BY sort_order ASC"#,
    ).fetch_all(&state.db).await;

    match rows {
        Ok(rows) => {
            let gifts: Vec<Value> = rows.iter().map(|r| json!({
                "id": r.0,
                "name": r.1,
                "icon": r.2,
                "price": r.3,
                "category": r.4,
                "sortOrder": r.5,
            })).collect();
            (StatusCode::OK, Json(json!({ "gifts": gifts })))
        }
        Err(e) => {
            tracing::error!("list_gift_catalog failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

#[derive(Deserialize)]
struct SendGiftV2Body {
    #[serde(rename = "toAccountId")]
    to_account_id: Uuid,
    #[serde(rename = "giftId")]
    gift_id: Uuid,
    quantity: Option<i32>,
    message: Option<String>,
}

async fn send_gift_v2(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<SendGiftV2Body>,
) -> (StatusCode, Json<Value>) {
    let quantity = body.quantity.unwrap_or(1);
    if quantity < 1 {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Quantity must be at least 1" })));
    }

    // Get gift price
    let gift = sqlx::query_as::<_, (i32,)>(
        "SELECT price FROM gift_catalog WHERE id = $1 AND is_active = true"
    ).bind(body.gift_id).fetch_optional(&state.db).await;

    let price = match gift {
        Ok(Some((p,))) => p,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({ "error": "Gift not found" }))),
        Err(e) => {
            tracing::error!("send_gift_v2: fetch gift failed: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })));
        }
    };

    let total_price = price * quantity;

    // Check balance
    let balance = sqlx::query_scalar::<_, i32>(
        "SELECT balance FROM user_token_balance WHERE user_id = $1"
    ).bind(&user.id).fetch_optional(&state.db).await.unwrap_or(None).unwrap_or(0);

    if balance < total_price {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Insufficient balance", "required": total_price, "balance": balance })));
    }

    // Begin transaction
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("send_gift_v2: begin tx failed: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })));
        }
    };

    // Deduct balance
    let new_balance = balance - total_price;
    let _ = sqlx::query(
        "INSERT INTO user_token_balance (user_id, balance, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO UPDATE SET balance = $2, updated_at = NOW()"
    ).bind(&user.id).bind(new_balance).execute(&mut *tx).await;

    // Record gift transaction
    let gift_tx_id = sqlx::query_scalar::<_, Uuid>(
        "INSERT INTO gift_transactions (from_user_id, to_account_id, gift_id, quantity, total_price, message) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id"
    ).bind(&user.id).bind(body.to_account_id).bind(body.gift_id).bind(quantity).bind(total_price).bind(body.message.as_deref())
    .fetch_one(&mut *tx).await;

    let gift_tx_id = match gift_tx_id {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("send_gift_v2: insert gift_tx failed: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })));
        }
    };

    // Record token transaction (spend)
    let _ = sqlx::query(
        "INSERT INTO token_transactions (user_id, type, amount, balance_after, description, related_gift_id) VALUES ($1, 'spend', $2, $3, 'Gift sent', $4)"
    ).bind(&user.id).bind(-total_price).bind(new_balance).bind(gift_tx_id).execute(&mut *tx).await;

    // Credit to account owner
    let owner_id = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM accounts WHERE id = $1"
    ).bind(body.to_account_id).fetch_optional(&mut *tx).await;

    if let Ok(Some(owner_id)) = owner_id {
        let _ = sqlx::query(
            "INSERT INTO user_token_balance (user_id, balance, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (user_id) DO UPDATE SET balance = user_token_balance.balance + $2, updated_at = NOW()"
        ).bind(&owner_id).bind(total_price).execute(&mut *tx).await;

        let _ = sqlx::query(
            "INSERT INTO token_transactions (user_id, type, amount, balance_after, description, related_gift_id) VALUES ($1, 'gift_received', $2, 0, 'Gift received', $3)"
        ).bind(&owner_id).bind(total_price).bind(gift_tx_id).execute(&mut *tx).await;
    }

    // Update fan level
    let _ = sqlx::query(
        r#"INSERT INTO lounge_fan_levels (account_id, user_id, total_spent, level)
           VALUES ($1, $2, $3, GREATEST(1, ($3 / 500) + 1))
           ON CONFLICT (account_id, user_id) DO UPDATE
           SET total_spent = lounge_fan_levels.total_spent + $3,
               level = GREATEST(1, ((lounge_fan_levels.total_spent + $3) / 500) + 1),
               updated_at = NOW()"#
    ).bind(body.to_account_id).bind(&user.id).bind(total_price).execute(&mut *tx).await;

    if let Err(e) = tx.commit().await {
        tracing::error!("send_gift_v2: commit failed: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })));
    }

    (StatusCode::OK, Json(json!({ "success": true, "transactionId": gift_tx_id, "newBalance": new_balance })))
}

async fn get_token_balance(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let balance = sqlx::query_scalar::<_, i32>(
        "SELECT balance FROM user_token_balance WHERE user_id = $1"
    ).bind(&user.id).fetch_optional(&state.db).await.unwrap_or(None).unwrap_or(0);

    (StatusCode::OK, Json(json!({ "balance": balance })))
}

#[derive(Deserialize)]
struct TopupBody {
    amount: i32,
}

async fn topup_tokens(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<TopupBody>,
) -> (StatusCode, Json<Value>) {
    if body.amount <= 0 {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "Amount must be positive" })));
    }

    let new_balance = sqlx::query_scalar::<_, i32>(
        r#"INSERT INTO user_token_balance (user_id, balance, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO UPDATE SET balance = user_token_balance.balance + $2, updated_at = NOW()
           RETURNING balance"#,
    ).bind(&user.id).bind(body.amount).fetch_one(&state.db).await;

    match new_balance {
        Ok(balance) => {
            let _ = sqlx::query(
                "INSERT INTO token_transactions (user_id, type, amount, balance_after, description) VALUES ($1, 'topup', $2, $3, 'Token top-up')"
            ).bind(&user.id).bind(body.amount).bind(balance).execute(&state.db).await;
            (StatusCode::OK, Json(json!({ "balance": balance })))
        }
        Err(e) => {
            tracing::error!("topup_tokens failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn list_token_transactions(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, (Uuid, String, i32, i32, Option<String>, DateTime<Utc>)>(
        r#"SELECT id, type, amount, balance_after, description, created_at
           FROM token_transactions
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT 50"#,
    ).bind(&user.id).fetch_all(&state.db).await;

    match rows {
        Ok(rows) => {
            let txs: Vec<Value> = rows.iter().map(|r| json!({
                "id": r.0,
                "type": r.1,
                "amount": r.2,
                "balanceAfter": r.3,
                "description": r.4,
                "createdAt": r.5.to_rfc3339(),
            })).collect();
            (StatusCode::OK, Json(json!({ "transactions": txs })))
        }
        Err(e) => {
            tracing::error!("list_token_transactions failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

// ===========================================================================
// Lounge: Fan levels + Leaderboard
// ===========================================================================

async fn list_fans(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let rows = sqlx::query_as::<_, (String, String, Option<String>, i32, i32, i32, DateTime<Utc>)>(
        r#"SELECT u.id, u.name, u.image, f.level, f.total_spent, f.total_messages, f.updated_at
           FROM lounge_fan_levels f
           JOIN "user" u ON u.id = f.user_id
           WHERE f.account_id = $1
           ORDER BY f.total_spent DESC"#,
    ).bind(id).fetch_all(&state.db).await;

    match rows {
        Ok(rows) => {
            let fans: Vec<Value> = rows.iter().map(|r| json!({
                "userId": r.0,
                "userName": r.1,
                "userImage": r.2,
                "level": r.3,
                "totalSpent": r.4,
                "totalMessages": r.5,
                "updatedAt": r.6.to_rfc3339(),
            })).collect();
            (StatusCode::OK, Json(json!({ "fans": fans })))
        }
        Err(e) => {
            tracing::error!("list_fans failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn gift_leaderboard(
    State(state): State<AppState>,
    _user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, (String, String, Option<String>, i64)>(
        r#"SELECT u.id, u.name, u.image, SUM(gt.total_price)::bigint as total
           FROM gift_transactions gt
           JOIN "user" u ON u.id = gt.from_user_id
           WHERE gt.to_account_id = $1
           GROUP BY u.id, u.name, u.image
           ORDER BY total DESC
           LIMIT 20"#,
    ).bind(id).fetch_all(&state.db).await;

    match rows {
        Ok(rows) => {
            let leaderboard: Vec<Value> = rows.iter().enumerate().map(|(i, r)| json!({
                "rank": i + 1,
                "userId": r.0,
                "userName": r.1,
                "userImage": r.2,
                "totalGifted": r.3,
            })).collect();
            (StatusCode::OK, Json(json!({ "leaderboard": leaderboard })))
        }
        Err(e) => {
            tracing::error!("gift_leaderboard failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

// ===========================================================================
// Lounge: Voice Samples
// ===========================================================================

#[derive(Deserialize)]
struct AddVoiceSampleBody {
    url: String,
    #[serde(rename = "durationSeconds")]
    duration_seconds: Option<i32>,
}

async fn add_voice_sample(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<AddVoiceSampleBody>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let row = sqlx::query_as::<_, (Uuid,)>(
        "INSERT INTO lounge_voice_samples (account_id, url, duration_seconds) VALUES ($1, $2, $3) RETURNING id"
    ).bind(id).bind(&body.url).bind(body.duration_seconds).fetch_one(&state.db).await;

    match row {
        Ok((sample_id,)) => (StatusCode::CREATED, Json(json!({ "id": sample_id, "url": body.url }))),
        Err(e) => {
            tracing::error!("add_voice_sample failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn list_voice_samples(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    let rows = sqlx::query_as::<_, (Uuid, String, Option<i32>, String, DateTime<Utc>)>(
        r#"SELECT id, url, duration_seconds, status, created_at
           FROM lounge_voice_samples
           WHERE account_id = $1
           ORDER BY created_at DESC"#,
    ).bind(id).fetch_all(&state.db).await;

    match rows {
        Ok(rows) => {
            let samples: Vec<Value> = rows.iter().map(|r| json!({
                "id": r.0,
                "url": r.1,
                "durationSeconds": r.2,
                "status": r.3,
                "createdAt": r.4.to_rfc3339(),
            })).collect();
            (StatusCode::OK, Json(json!({ "samples": samples })))
        }
        Err(e) => {
            tracing::error!("list_voice_samples failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

async fn delete_voice_sample(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, sample_id)): Path<(Uuid, Uuid)>,
) -> (StatusCode, Json<Value>) {
    if verify_owner(&state.db, id, &user.id).await.is_err() {
        return (StatusCode::FORBIDDEN, Json(json!({ "error": "Not the account owner" })));
    }

    match sqlx::query("DELETE FROM lounge_voice_samples WHERE id = $1 AND account_id = $2")
        .bind(sample_id).bind(id).execute(&state.db).await
    {
        Ok(r) if r.rows_affected() == 0 => (StatusCode::NOT_FOUND, Json(json!({ "error": "Sample not found" }))),
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("delete_voice_sample failed: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })))
        }
    }
}

// ===========================================================================
// Helper: verify account ownership
// ===========================================================================

async fn verify_owner(db: &sqlx::PgPool, account_id: Uuid, user_id: &str) -> Result<(), ()> {
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT owner_id FROM accounts WHERE id = $1",
    )
    .bind(account_id)
    .fetch_optional(db)
    .await;

    match owner {
        Ok(Some(oid)) if oid == user_id => Ok(()),
        _ => Err(()),
    }
}
