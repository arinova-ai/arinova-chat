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
use chrono::{DateTime, Utc};
use futures::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};
use std::convert::Infallible;
use tokio_stream::wrappers::ReceiverStream;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::services::{llm, openrouter, tts};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Browse
        .route("/api/communities", get(browse).post(create))
        // My communities
        .route("/api/communities/my", get(my_communities))
        .route("/api/communities/joined", get(joined_communities))
        // Single community
        .route(
            "/api/communities/{id}",
            get(get_community).put(update_community).delete(delete_community),
        )
        // Members
        .route("/api/communities/{id}/join", post(join))
        .route("/api/communities/{id}/leave", post(leave))
        .route("/api/communities/{id}/members", get(list_members))
        // Agents
        .route(
            "/api/communities/{id}/agents",
            get(list_agents).post(add_agent),
        )
        .route(
            "/api/communities/{id}/agents/{listing_id}",
            axum::routing::delete(remove_agent),
        )
        // Chat
        .route(
            "/api/communities/{id}/messages",
            get(get_messages).post(send_message),
        )
        .route(
            "/api/communities/{id}/agent-chat",
            post(agent_chat),
        )
}

// ---------------------------------------------------------------------------
// FromRow structs
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct CommunityRow {
    id: Uuid,
    creator_id: String,
    name: String,
    description: Option<String>,
    #[sqlx(rename = "type")]
    community_type: String,
    join_fee: i32,
    monthly_fee: i32,
    agent_call_fee: i32,
    status: String,
    member_count: i32,
    avatar_url: Option<String>,
    cover_image_url: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct CommunityBrowseRow {
    id: Uuid,
    creator_id: String,
    name: String,
    description: Option<String>,
    #[sqlx(rename = "type")]
    community_type: String,
    join_fee: i32,
    monthly_fee: i32,
    agent_call_fee: i32,
    member_count: i32,
    avatar_url: Option<String>,
    category: Option<String>,
    tags: Option<Vec<String>>,
    created_at: DateTime<Utc>,
    creator_name: String,
}

#[derive(sqlx::FromRow)]
struct MemberRow {
    id: Uuid,
    user_id: String,
    role: String,
    joined_at: DateTime<Utc>,
    subscription_status: Option<String>,
    user_name: String,
    user_image: Option<String>,
}

#[derive(sqlx::FromRow)]
struct CommunityAgentRow {
    id: Uuid,
    listing_id: Uuid,
    agent_name: String,
    avatar_url: Option<String>,
    description: String,
    model: String,
    added_at: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct CommunityMessageRow {
    id: Uuid,
    user_id: Option<String>,
    agent_listing_id: Option<Uuid>,
    content: String,
    message_type: String,
    created_at: DateTime<Utc>,
    user_name: Option<String>,
    user_image: Option<String>,
    agent_name: Option<String>,
}

fn community_json(r: &CommunityRow) -> Value {
    json!({
        "id": r.id,
        "creatorId": r.creator_id,
        "name": r.name,
        "description": r.description,
        "type": r.community_type,
        "joinFee": r.join_fee,
        "monthlyFee": r.monthly_fee,
        "agentCallFee": r.agent_call_fee,
        "status": r.status,
        "memberCount": r.member_count,
        "avatarUrl": r.avatar_url,
        "coverImageUrl": r.cover_image_url,
        "category": r.category,
        "tags": r.tags,
        "createdAt": r.created_at.to_rfc3339(),
        "updatedAt": r.updated_at.to_rfc3339(),
    })
}

// ---------------------------------------------------------------------------
// GET /api/communities — Browse active communities
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct BrowseQuery {
    #[serde(rename = "type")]
    community_type: Option<String>,
    category: Option<String>,
    search: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

async fn browse(
    State(state): State<AppState>,
    Query(q): Query<BrowseQuery>,
) -> (StatusCode, Json<Value>) {
    let limit = q.limit.unwrap_or(20).min(50);
    let page = q.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;

    let rows = sqlx::query_as::<_, CommunityBrowseRow>(
        r#"SELECT c.id, c.creator_id, c.name, c.description, c.type,
                  c.join_fee, c.monthly_fee, c.agent_call_fee,
                  c.member_count, c.avatar_url, c.category, c.tags,
                  c.created_at, u.name AS creator_name
           FROM communities c
           JOIN "user" u ON c.creator_id = u.id
           WHERE c.status = 'active'
             AND ($1::text IS NULL OR c.type = $1)
             AND ($2::text IS NULL OR c.category = $2)
             AND ($3::text IS NULL OR c.name ILIKE '%' || $3 || '%' OR c.description ILIKE '%' || $3 || '%')
           ORDER BY c.member_count DESC, c.created_at DESC
           LIMIT $4 OFFSET $5"#,
    )
    .bind(q.community_type.as_deref())
    .bind(q.category.as_deref())
    .bind(q.search.as_deref())
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await;

    let total = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM communities
           WHERE status = 'active'
             AND ($1::text IS NULL OR type = $1)
             AND ($2::text IS NULL OR category = $2)
             AND ($3::text IS NULL OR name ILIKE '%' || $3 || '%' OR description ILIKE '%' || $3 || '%')"#,
    )
    .bind(q.community_type.as_deref())
    .bind(q.category.as_deref())
    .bind(q.search.as_deref())
    .fetch_one(&state.db)
    .await
    .unwrap_or_else(|e| {
        tracing::error!("Browse: count query failed: {}", e);
        0
    });

    match rows {
        Ok(rows) => {
            let communities: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "creatorId": r.creator_id,
                        "name": r.name,
                        "description": r.description,
                        "type": r.community_type,
                        "joinFee": r.join_fee,
                        "monthlyFee": r.monthly_fee,
                        "agentCallFee": r.agent_call_fee,
                        "memberCount": r.member_count,
                        "avatarUrl": r.avatar_url,
                        "category": r.category,
                        "tags": r.tags,
                        "createdAt": r.created_at.to_rfc3339(),
                        "creatorName": r.creator_name,
                    })
                })
                .collect();
            (
                StatusCode::OK,
                Json(json!({ "communities": communities, "total": total })),
            )
        }
        Err(e) => {
            tracing::error!("Browse communities failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// POST /api/communities — Create community
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct CreateBody {
    name: String,
    description: Option<String>,
    #[serde(rename = "type")]
    community_type: Option<String>,
    #[serde(rename = "joinFee")]
    join_fee: Option<i32>,
    #[serde(rename = "monthlyFee")]
    monthly_fee: Option<i32>,
    #[serde(rename = "agentCallFee")]
    agent_call_fee: Option<i32>,
    category: Option<String>,
    #[serde(rename = "avatarUrl")]
    avatar_url: Option<String>,
}

async fn create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateBody>,
) -> (StatusCode, Json<Value>) {
    let name = body.name.trim();
    if name.is_empty() || name.len() > 100 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Name must be 1-100 characters" })),
        );
    }

    let community_type = body.community_type.as_deref().unwrap_or("lounge");
    if community_type != "lounge" && community_type != "hub" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Type must be 'lounge' or 'hub'" })),
        );
    }

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("Create community: begin tx failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Insert community
    let community_id = match sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO communities (creator_id, name, description, type, join_fee, monthly_fee,
                                     agent_call_fee, category, avatar_url, member_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)
           RETURNING id"#,
    )
    .bind(&user.id)
    .bind(name)
    .bind(body.description.as_deref())
    .bind(community_type)
    .bind(body.join_fee.unwrap_or(0).max(0))
    .bind(body.monthly_fee.unwrap_or(0).max(0))
    .bind(body.agent_call_fee.unwrap_or(0).max(0))
    .bind(body.category.as_deref())
    .bind(body.avatar_url.as_deref())
    .fetch_one(&mut *tx)
    .await
    {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("Create community: insert failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Add creator as member with role=creator
    if let Err(e) = sqlx::query(
        r#"INSERT INTO community_members (community_id, user_id, role)
           VALUES ($1, $2, 'creator')"#,
    )
    .bind(community_id)
    .bind(&user.id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Create community: add creator member failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("Create community: commit failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    (
        StatusCode::CREATED,
        Json(json!({ "id": community_id })),
    )
}

// ---------------------------------------------------------------------------
// GET /api/communities/:id — Community detail
// ---------------------------------------------------------------------------

async fn get_community(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let row = sqlx::query_as::<_, CommunityRow>(
        r#"SELECT id, creator_id, name, description, type, join_fee, monthly_fee,
                  agent_call_fee, status, member_count, avatar_url, cover_image_url,
                  category, tags, created_at, updated_at
           FROM communities WHERE id = $1"#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(r)) => (StatusCode::OK, Json(community_json(&r))),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Community not found" })),
        ),
        Err(e) => {
            tracing::error!("Get community failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// PUT /api/communities/:id — Update community (creator only)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct UpdateBody {
    name: Option<String>,
    description: Option<String>,
    #[serde(rename = "joinFee")]
    join_fee: Option<i32>,
    #[serde(rename = "monthlyFee")]
    monthly_fee: Option<i32>,
    #[serde(rename = "agentCallFee")]
    agent_call_fee: Option<i32>,
    category: Option<String>,
    #[serde(rename = "avatarUrl")]
    avatar_url: Option<String>,
    #[serde(rename = "coverImageUrl")]
    cover_image_url: Option<String>,
}

async fn update_community(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateBody>,
) -> (StatusCode, Json<Value>) {
    // Verify creator
    let creator_id = sqlx::query_scalar::<_, String>(
        "SELECT creator_id FROM communities WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    match &creator_id {
        Ok(Some(cid)) if cid == &user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Only the creator can update this community" })),
            );
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Community not found" })),
            );
        }
        Err(e) => {
            tracing::error!("Update community: verify creator failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    }

    if let Some(ref name) = body.name {
        let name = name.trim();
        if name.is_empty() || name.len() > 100 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Name must be 1-100 characters" })),
            );
        }
    }

    if let Some(fee) = body.join_fee {
        if fee < 0 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Join fee cannot be negative" })),
            );
        }
    }
    if let Some(fee) = body.monthly_fee {
        if fee < 0 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Monthly fee cannot be negative" })),
            );
        }
    }
    if let Some(fee) = body.agent_call_fee {
        if fee < 0 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Agent call fee cannot be negative" })),
            );
        }
    }

    let result = sqlx::query(
        r#"UPDATE communities SET
             name = COALESCE($2, name),
             description = COALESCE($3, description),
             join_fee = COALESCE($4, join_fee),
             monthly_fee = COALESCE($5, monthly_fee),
             agent_call_fee = COALESCE($6, agent_call_fee),
             category = COALESCE($7, category),
             avatar_url = COALESCE($8, avatar_url),
             cover_image_url = COALESCE($9, cover_image_url),
             updated_at = NOW()
           WHERE id = $1"#,
    )
    .bind(id)
    .bind(body.name.as_deref())
    .bind(body.description.as_deref())
    .bind(body.join_fee)
    .bind(body.monthly_fee)
    .bind(body.agent_call_fee)
    .bind(body.category.as_deref())
    .bind(body.avatar_url.as_deref())
    .bind(body.cover_image_url.as_deref())
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("Update community failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// DELETE /api/communities/:id — Soft delete (creator only)
// ---------------------------------------------------------------------------

async fn delete_community(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let result = sqlx::query(
        r#"UPDATE communities SET status = 'archived', updated_at = NOW()
           WHERE id = $1 AND creator_id = $2 AND status != 'archived'"#,
    )
    .bind(id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Community not found or not authorized" })),
        ),
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("Delete community failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// POST /api/communities/:id/join — Join community
// ---------------------------------------------------------------------------

async fn join(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Fetch community
    let community = sqlx::query_as::<_, (i32, i32, String)>(
        "SELECT join_fee, monthly_fee, status FROM communities WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await;

    let (join_fee, monthly_fee, status) = match community {
        Ok(Some(c)) => c,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Community not found" })),
            );
        }
        Err(e) => {
            tracing::error!("Join community: fetch failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    if status != "active" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Community is not active" })),
        );
    }

    // Check not already a member
    let exists = match sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $2)",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("Join: membership check failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    if exists {
        return (
            StatusCode::CONFLICT,
            Json(json!({ "error": "Already a member" })),
        );
    }

    let total_cost = join_fee + monthly_fee;

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("Join community: begin tx failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Deduct join fee + first month (if any)
    if total_cost > 0 {
        let deducted = sqlx::query_scalar::<_, i32>(
            r#"UPDATE coin_balances
               SET balance = balance - $2, updated_at = NOW()
               WHERE user_id = $1 AND balance >= $2
               RETURNING balance"#,
        )
        .bind(&user.id)
        .bind(total_cost)
        .fetch_optional(&mut *tx)
        .await;

        match deducted {
            Ok(None) => {
                return (
                    StatusCode::PAYMENT_REQUIRED,
                    Json(json!({ "error": "Insufficient balance" })),
                );
            }
            Err(e) => {
                tracing::error!("Join community: deduct balance failed: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "Payment failed" })),
                );
            }
            Ok(Some(_)) => {}
        }

        // Record join fee transaction
        if join_fee > 0 {
            if let Err(e) = sqlx::query(
                r#"INSERT INTO coin_transactions (user_id, type, amount, description)
                   VALUES ($1, 'community_join', $2, $3)"#,
            )
            .bind(&user.id)
            .bind(-join_fee)
            .bind(format!("Community join fee"))
            .execute(&mut *tx)
            .await
            {
                tracing::error!("Join: record join fee transaction failed: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "Failed to record transaction" })),
                );
            }

            // Creator gets 70% of join fee
            let creator_id = match sqlx::query_scalar::<_, String>(
                "SELECT creator_id FROM communities WHERE id = $1",
            )
            .bind(id)
            .fetch_one(&mut *tx)
            .await
            {
                Ok(cid) => cid,
                Err(e) => {
                    tracing::error!("Join: fetch creator_id failed: {}", e);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "error": "Database error" })),
                    );
                }
            };

            let creator_share = join_fee * 7 / 10;
            if let Err(e) = sqlx::query(
                r#"INSERT INTO coin_balances (user_id, balance, updated_at)
                   VALUES ($1, $2, NOW())
                   ON CONFLICT (user_id) DO UPDATE
                   SET balance = coin_balances.balance + $2, updated_at = NOW()"#,
            )
            .bind(&creator_id)
            .bind(creator_share)
            .execute(&mut *tx)
            .await
            {
                tracing::error!("Join: credit creator balance failed: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "Failed to credit creator" })),
                );
            }

            if let Err(e) = sqlx::query(
                r#"INSERT INTO coin_transactions (user_id, type, amount, description)
                   VALUES ($1, 'earning', $2, 'Community join fee earning')"#,
            )
            .bind(&creator_id)
            .bind(creator_share)
            .execute(&mut *tx)
            .await
            {
                tracing::error!("Join: record creator earning transaction failed: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "Failed to record transaction" })),
                );
            }
        }

        // Record subscription transaction
        if monthly_fee > 0 {
            if let Err(e) = sqlx::query(
                r#"INSERT INTO coin_transactions (user_id, type, amount, description)
                   VALUES ($1, 'community_subscription', $2, 'Community monthly subscription')"#,
            )
            .bind(&user.id)
            .bind(-monthly_fee)
            .execute(&mut *tx)
            .await
            {
                tracing::error!("Join: record subscription transaction failed: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "Failed to record transaction" })),
                );
            }
        }
    }

    // Insert member
    let subscription_expires = if monthly_fee > 0 {
        Some("NOW() + INTERVAL '30 days'")
    } else {
        None
    };

    let insert_result = if subscription_expires.is_some() {
        sqlx::query(
            r#"INSERT INTO community_members (community_id, user_id, role, subscription_status, subscription_expires_at)
               VALUES ($1, $2, 'member', 'active', NOW() + INTERVAL '30 days')"#,
        )
        .bind(id)
        .bind(&user.id)
        .execute(&mut *tx)
        .await
    } else {
        sqlx::query(
            r#"INSERT INTO community_members (community_id, user_id, role)
               VALUES ($1, $2, 'member')"#,
        )
        .bind(id)
        .bind(&user.id)
        .execute(&mut *tx)
        .await
    };

    if let Err(e) = insert_result {
        tracing::error!("Join community: insert member failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    // Increment member_count
    if let Err(e) = sqlx::query(
        "UPDATE communities SET member_count = member_count + 1, updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Join: increment member_count failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("Join community: commit failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    (StatusCode::OK, Json(json!({ "success": true })))
}

// ---------------------------------------------------------------------------
// POST /api/communities/:id/leave — Leave community
// ---------------------------------------------------------------------------

async fn leave(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Can't leave if creator
    let role = sqlx::query_scalar::<_, String>(
        "SELECT role FROM community_members WHERE community_id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match &role {
        Ok(Some(r)) if r == "creator" => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Creator cannot leave. Archive the community instead." })),
            );
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Not a member" })),
            );
        }
        Err(e) => {
            tracing::error!("Leave community: fetch role failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
        _ => {}
    }

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("Leave community: begin tx failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    if let Err(e) = sqlx::query(
        "DELETE FROM community_members WHERE community_id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Leave: delete member failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    if let Err(e) = sqlx::query(
        "UPDATE communities SET member_count = GREATEST(member_count - 1, 0), updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Leave: decrement member_count failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("Leave community: commit failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    (StatusCode::OK, Json(json!({ "success": true })))
}

// ---------------------------------------------------------------------------
// GET /api/communities/:id/members — List members
// ---------------------------------------------------------------------------

async fn list_members(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, MemberRow>(
        r#"SELECT cm.id, cm.user_id, cm.role, cm.joined_at,
                  cm.subscription_status,
                  u.name AS user_name, u.image AS user_image
           FROM community_members cm
           JOIN "user" u ON cm.user_id = u.id
           WHERE cm.community_id = $1
           ORDER BY
             CASE cm.role WHEN 'creator' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END,
             cm.joined_at ASC"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let members: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "userId": r.user_id,
                        "role": r.role,
                        "joinedAt": r.joined_at.to_rfc3339(),
                        "subscriptionStatus": r.subscription_status,
                        "userName": r.user_name,
                        "userImage": r.user_image,
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "members": members })))
        }
        Err(e) => {
            tracing::error!("List members failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// POST /api/communities/:id/agents — Add agent (creator only)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct AddAgentBody {
    #[serde(rename = "listingId")]
    listing_id: Uuid,
}

async fn add_agent(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<AddAgentBody>,
) -> (StatusCode, Json<Value>) {
    // Verify creator
    let is_creator = match sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM communities WHERE id = $1 AND creator_id = $2)",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("add_agent: creator check failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    if !is_creator {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Only the creator can add agents" })),
        );
    }

    // Verify listing exists and is active
    let listing_active = match sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM agent_listings WHERE id = $1 AND status = 'active')",
    )
    .bind(body.listing_id)
    .fetch_one(&state.db)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("add_agent: listing check failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    if !listing_active {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Listing not found or not active" })),
        );
    }

    let result = sqlx::query(
        r#"INSERT INTO community_agents (community_id, listing_id)
           VALUES ($1, $2)
           ON CONFLICT (community_id, listing_id) DO NOTHING"#,
    )
    .bind(id)
    .bind(body.listing_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::CREATED, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("Add agent to community failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// DELETE /api/communities/:id/agents/:listing_id — Remove agent
// ---------------------------------------------------------------------------

async fn remove_agent(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, listing_id)): Path<(Uuid, Uuid)>,
) -> (StatusCode, Json<Value>) {
    let is_creator = match sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM communities WHERE id = $1 AND creator_id = $2)",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("remove_agent: creator check failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    if !is_creator {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Only the creator can remove agents" })),
        );
    }

    let result = sqlx::query(
        "DELETE FROM community_agents WHERE community_id = $1 AND listing_id = $2",
    )
    .bind(id)
    .bind(listing_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Agent not found in this community" })),
        ),
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("Remove agent from community failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/communities/:id/agents — List agents
// ---------------------------------------------------------------------------

async fn list_agents(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, CommunityAgentRow>(
        r#"SELECT ca.id, ca.listing_id, l.agent_name, l.avatar_url,
                  l.description, l.model, ca.added_at
           FROM community_agents ca
           JOIN agent_listings l ON ca.listing_id = l.id
           WHERE ca.community_id = $1
           ORDER BY ca.added_at ASC"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let agents: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "listingId": r.listing_id,
                        "agentName": r.agent_name,
                        "avatarUrl": r.avatar_url,
                        "description": r.description,
                        "model": r.model,
                        "addedAt": r.added_at.to_rfc3339(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "agents": agents })))
        }
        Err(e) => {
            tracing::error!("List community agents failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// POST /api/communities/:id/messages — Send text message
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct SendMessageBody {
    content: String,
}

async fn send_message(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<SendMessageBody>,
) -> (StatusCode, Json<Value>) {
    if body.content.trim().is_empty() || body.content.len() > 5000 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Message must be 1-5000 characters" })),
        );
    }

    // Verify member
    let is_member = match sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $2)",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("send_message: membership check failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    if !is_member {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "You must be a member to send messages" })),
        );
    }

    let msg_id = sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO community_messages (community_id, user_id, content, message_type)
           VALUES ($1, $2, $3, 'text')
           RETURNING id"#,
    )
    .bind(id)
    .bind(&user.id)
    .bind(&body.content)
    .fetch_one(&state.db)
    .await;

    match msg_id {
        Ok(mid) => (
            StatusCode::CREATED,
            Json(json!({
                "id": mid,
                "userId": user.id,
                "content": body.content,
                "messageType": "text",
            })),
        ),
        Err(e) => {
            tracing::error!("Send community message failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// POST /api/communities/:id/agent-chat — Call an agent (SSE streaming)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct AgentChatBody {
    content: String,
    #[serde(rename = "listingId")]
    listing_id: Uuid,
}

#[derive(sqlx::FromRow)]
struct AgentChatInfo {
    agent_name: String,
    system_prompt: String,
    model: String,
    input_char_limit: i32,
    tts_voice: Option<String>,
}

async fn agent_chat(
    State(state): State<AppState>,
    user: AuthUser,
    Path(community_id): Path<Uuid>,
    Json(body): Json<AgentChatBody>,
) -> Result<Sse<impl futures::Stream<Item = Result<Event, Infallible>>>, (StatusCode, Json<Value>)>
{
    // 1. Verify member
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $2)",
    )
    .bind(community_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("agent_chat: membership check failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        )
    })?;

    if !is_member {
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "You must be a member" })),
        ));
    }

    // 2. Verify agent is in this community
    let agent_in_community = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM community_agents WHERE community_id = $1 AND listing_id = $2)",
    )
    .bind(community_id)
    .bind(body.listing_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("agent_chat: agent-in-community check failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        )
    })?;

    if !agent_in_community {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Agent is not in this community" })),
        ));
    }

    // 3. Fetch agent listing info
    let listing = sqlx::query_as::<_, AgentChatInfo>(
        r#"SELECT agent_name, system_prompt, model, input_char_limit, tts_voice
           FROM agent_listings WHERE id = $1 AND status = 'active'"#,
    )
    .bind(body.listing_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Agent chat: fetch listing failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        )
    })?
    .ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Agent listing not found or not active" })),
        )
    })?;

    // 4. Validate message length
    let char_limit = listing.input_char_limit.max(1) as usize;
    if body.content.is_empty() || body.content.len() > char_limit {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": format!("Message must be 1-{} characters", char_limit)
            })),
        ));
    }

    // 5. Ensure OpenRouter API key (check BEFORE billing)
    let openrouter_key = state.config.openrouter_api_key.as_deref().ok_or_else(|| {
        tracing::error!("Agent chat: OPENROUTER_API_KEY not configured");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "LLM service not configured" })),
        )
    })?;

    // 6. Check agent_call_fee and deduct if needed
    let community_fee = sqlx::query_scalar::<_, i32>(
        "SELECT agent_call_fee FROM communities WHERE id = $1",
    )
    .bind(community_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("agent_chat: fetch agent_call_fee failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        )
    })?;

    if community_fee > 0 {
        // Wrap entire billing flow in a transaction
        let mut tx = state.db.begin().await.map_err(|e| {
            tracing::error!("agent_chat: begin billing tx failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        })?;

        // Atomic deduction
        let deducted = sqlx::query_scalar::<_, i32>(
            r#"UPDATE coin_balances
               SET balance = balance - $2, updated_at = NOW()
               WHERE user_id = $1 AND balance >= $2
               RETURNING balance"#,
        )
        .bind(&user.id)
        .bind(community_fee)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| {
            tracing::error!("agent_chat: deduct fee failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Payment failed" })),
            )
        })?;

        if deducted.is_none() {
            return Err((
                StatusCode::PAYMENT_REQUIRED,
                Json(json!({ "error": "Insufficient balance for agent call" })),
            ));
        }

        // Record transaction
        sqlx::query(
            r#"INSERT INTO coin_transactions (user_id, type, amount, description)
               VALUES ($1, 'community_agent_call', $2, $3)"#,
        )
        .bind(&user.id)
        .bind(-community_fee)
        .bind(format!("Agent call: {}", listing.agent_name))
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            tracing::error!("agent_chat: record transaction failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to record transaction" })),
            )
        })?;

        // Creator gets 70%
        let creator_id = sqlx::query_scalar::<_, String>(
            "SELECT creator_id FROM communities WHERE id = $1",
        )
        .bind(community_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| {
            tracing::error!("agent_chat: fetch creator_id failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        })?;

        if let Some(cid) = creator_id {
            let creator_share = community_fee * 7 / 10;
            sqlx::query(
                r#"INSERT INTO coin_balances (user_id, balance, updated_at)
                   VALUES ($1, $2, NOW())
                   ON CONFLICT (user_id) DO UPDATE
                   SET balance = coin_balances.balance + $2, updated_at = NOW()"#,
            )
            .bind(&cid)
            .bind(creator_share)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                tracing::error!("agent_chat: credit creator balance failed: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "Failed to credit creator" })),
                )
            })?;

            sqlx::query(
                r#"INSERT INTO coin_transactions (user_id, type, amount, description)
                   VALUES ($1, 'earning', $2, 'Community agent call earning')"#,
            )
            .bind(&cid)
            .bind(creator_share)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                tracing::error!("agent_chat: record creator earning failed: {}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "Failed to record transaction" })),
                )
            })?;
        }

        tx.commit().await.map_err(|e| {
            tracing::error!("agent_chat: commit billing tx failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Billing commit failed" })),
            )
        })?;
    }

    // 7. Store user message
    let user_msg_id = sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO community_messages (community_id, user_id, content, message_type)
           VALUES ($1, $2, $3, 'text')
           RETURNING id"#,
    )
    .bind(community_id)
    .bind(&user.id)
    .bind(&body.content)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Agent chat: store user message failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Failed to store message" })),
        )
    })?;

    // 8. Load last 30 messages for context
    let history = sqlx::query_as::<_, (Option<String>, Option<Uuid>, String)>(
        r#"SELECT user_id, agent_listing_id, content FROM (
               SELECT user_id, agent_listing_id, content, created_at
               FROM community_messages
               WHERE community_id = $1 AND message_type = 'text'
               ORDER BY created_at DESC LIMIT 30
           ) sub ORDER BY created_at ASC"#,
    )
    .bind(community_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("agent_chat: load history failed: {}", e);
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Failed to load message history" })),
        )
    })?;

    // 9. Build LLM messages
    let mut llm_messages = vec![llm::ChatMessage {
        role: "system".into(),
        content: listing.system_prompt.clone(),
    }];

    for (uid, agent_lid, content) in &history {
        let role = if agent_lid.is_some() {
            "assistant"
        } else if uid.is_some() {
            "user"
        } else {
            continue;
        };
        llm_messages.push(llm::ChatMessage {
            role: role.into(),
            content: content.clone(),
        });
    }

    let or_opts = openrouter::OpenRouterCallOptions {
        model: listing.model.clone(),
        messages: llm_messages,
        max_tokens: None,
        temperature: None,
    };

    // 10. Setup SSE stream
    let (tx, rx) = tokio::sync::mpsc::channel::<Result<Event, Infallible>>(32);
    let db = state.db.clone();
    let api_key = openrouter_key.to_string();
    let listing_id = body.listing_id;
    let s3_clone = state.s3.clone();
    let config_clone = state.config.clone();
    let tts_voice = listing.tts_voice.clone().unwrap_or_else(|| "alloy".into());

    tokio::spawn(async move {
        // Send meta event
        let _ = tx
            .send(Ok(Event::default().data(
                json!({
                    "type": "meta",
                    "communityId": community_id,
                    "userMessageId": user_msg_id,
                })
                .to_string(),
            )))
            .await;

        // Call OpenRouter
        let mut stream = match openrouter::call_stream(&api_key, &or_opts).await {
            Ok(s) => s,
            Err(e) => {
                tracing::error!("Agent chat: OpenRouter failed: {}", e);
                let _ = tx
                    .send(Ok(Event::default().data(
                        json!({"type": "error", "message": "LLM request failed"}).to_string(),
                    )))
                    .await;
                let _ = tx
                    .send(Ok(Event::default().data(
                        json!({"type": "done"}).to_string(),
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
                    while let Some(pos) = buffer.find('\n') {
                        let line = buffer[..pos].trim_end_matches('\r').to_string();
                        buffer = buffer[pos + 1..].to_string();

                        if let Some(data) = line.strip_prefix("data: ") {
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
                    tracing::error!("Agent chat: stream chunk error: {}", e);
                    break;
                }
            }
        }

        // Store agent reply
        if !full_content.is_empty() {
            let msg_id = sqlx::query_scalar::<_, Uuid>(
                r#"INSERT INTO community_messages (community_id, agent_listing_id, content, message_type)
                   VALUES ($1, $2, $3, 'text')
                   RETURNING id"#,
            )
            .bind(community_id)
            .bind(listing_id)
            .bind(&full_content)
            .fetch_one(&db)
            .await;

            let msg_id = match msg_id {
                Ok(id) => Some(id),
                Err(e) => {
                    tracing::error!("Agent chat: store agent message failed: {}", e);
                    None
                }
            };

            // TTS: generate audio from agent reply (non-blocking, silent on failure)
            if let Some(openai_key) = config_clone.openai_api_key.as_deref() {
                match tts::text_to_speech(openai_key, &full_content, &tts_voice).await {
                    Ok(audio_bytes) => {
                        let tts_filename = format!(
                            "tts_{}.mp3",
                            msg_id.map(|id| id.to_string()).unwrap_or_else(|| "unknown".into())
                        );
                        let r2_key = format!(
                            "tts/community/{}/{}",
                            community_id, tts_filename
                        );

                        let audio_url = if let Some(ref s3) = s3_clone {
                            match crate::services::r2::upload_to_r2(
                                s3,
                                &config_clone.r2_bucket,
                                &r2_key,
                                audio_bytes.clone(),
                                "audio/mpeg",
                                &config_clone.r2_public_url,
                            )
                            .await
                            {
                                Ok(url) => Some(url),
                                Err(e) => {
                                    tracing::error!("Community TTS: R2 upload failed: {}", e);
                                    let dir = std::path::Path::new(&config_clone.upload_dir)
                                        .join("tts")
                                        .join("community")
                                        .join(community_id.to_string());
                                    let _ = tokio::fs::create_dir_all(&dir).await;
                                    let local_path = dir.join(&tts_filename);
                                    match tokio::fs::write(&local_path, &audio_bytes).await {
                                        Ok(_) => Some(format!(
                                            "/uploads/tts/community/{}/{}",
                                            community_id, tts_filename
                                        )),
                                        Err(e2) => {
                                            tracing::error!("Community TTS: local write failed: {}", e2);
                                            None
                                        }
                                    }
                                }
                            }
                        } else {
                            let dir = std::path::Path::new(&config_clone.upload_dir)
                                .join("tts")
                                .join("community")
                                .join(community_id.to_string());
                            let _ = tokio::fs::create_dir_all(&dir).await;
                            let local_path = dir.join(&tts_filename);
                            match tokio::fs::write(&local_path, &audio_bytes).await {
                                Ok(_) => Some(format!(
                                    "/uploads/tts/community/{}/{}",
                                    community_id, tts_filename
                                )),
                                Err(e) => {
                                    tracing::error!("Community TTS: local write failed: {}", e);
                                    None
                                }
                            }
                        };

                        if let Some(ref url) = audio_url {
                            if let Some(mid) = msg_id {
                                let _ = sqlx::query(
                                    "UPDATE community_messages SET tts_audio_url = $1 WHERE id = $2",
                                )
                                .bind(url)
                                .bind(mid)
                                .execute(&db)
                                .await;
                            }

                            let _ = tx
                                .send(Ok(Event::default().data(
                                    json!({"type": "audio_ready", "audioUrl": url}).to_string(),
                                )))
                                .await;
                        }
                    }
                    Err(e) => {
                        tracing::error!("Community TTS: generation failed: {}", e);
                    }
                }
            }
        }

        let _ = tx
            .send(Ok(
                Event::default().data(json!({"type": "done"}).to_string())
            ))
            .await;
    });

    let stream = ReceiverStream::new(rx);
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

// ---------------------------------------------------------------------------
// GET /api/communities/:id/messages — Chat history (paginated)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct MessagesQuery {
    before: Option<String>,
    limit: Option<i64>,
}

async fn get_messages(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Query(q): Query<MessagesQuery>,
) -> (StatusCode, Json<Value>) {
    // Verify membership
    let is_member = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $2)",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    match is_member {
        Ok(false) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "You must be a member to view messages" })),
            );
        }
        Err(e) => {
            tracing::error!("get_messages: membership check failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
        Ok(true) => {}
    }

    let limit = q.limit.unwrap_or(50).min(100);

    let rows = if let Some(ref before) = q.before {
        sqlx::query_as::<_, CommunityMessageRow>(
            r#"SELECT m.id, m.user_id, m.agent_listing_id, m.content, m.message_type, m.created_at,
                      u.name AS user_name, u.image AS user_image,
                      l.agent_name
               FROM community_messages m
               LEFT JOIN "user" u ON m.user_id = u.id
               LEFT JOIN agent_listings l ON m.agent_listing_id = l.id
               WHERE m.community_id = $1 AND m.created_at < $2::timestamptz
               ORDER BY m.created_at DESC
               LIMIT $3"#,
        )
        .bind(id)
        .bind(before)
        .bind(limit)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as::<_, CommunityMessageRow>(
            r#"SELECT m.id, m.user_id, m.agent_listing_id, m.content, m.message_type, m.created_at,
                      u.name AS user_name, u.image AS user_image,
                      l.agent_name
               FROM community_messages m
               LEFT JOIN "user" u ON m.user_id = u.id
               LEFT JOIN agent_listings l ON m.agent_listing_id = l.id
               WHERE m.community_id = $1
               ORDER BY m.created_at DESC
               LIMIT $2"#,
        )
        .bind(id)
        .bind(limit)
        .fetch_all(&state.db)
        .await
    };

    match rows {
        Ok(rows) => {
            let messages: Vec<Value> = rows
                .iter()
                .rev() // reverse to chronological order
                .map(|r| {
                    json!({
                        "id": r.id,
                        "userId": r.user_id,
                        "agentListingId": r.agent_listing_id,
                        "content": r.content,
                        "messageType": r.message_type,
                        "createdAt": r.created_at.to_rfc3339(),
                        "userName": r.user_name,
                        "userImage": r.user_image,
                        "agentName": r.agent_name,
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "messages": messages })))
        }
        Err(e) => {
            tracing::error!("Get community messages failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/communities/my — Creator's communities
// ---------------------------------------------------------------------------

async fn my_communities(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, CommunityRow>(
        r#"SELECT id, creator_id, name, description, type, join_fee, monthly_fee,
                  agent_call_fee, status, member_count, avatar_url, cover_image_url,
                  category, tags, created_at, updated_at
           FROM communities
           WHERE creator_id = $1
           ORDER BY created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let communities: Vec<Value> = rows.iter().map(community_json).collect();
            (StatusCode::OK, Json(json!({ "communities": communities })))
        }
        Err(e) => {
            tracing::error!("My communities failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/communities/joined — Communities user has joined
// ---------------------------------------------------------------------------

async fn joined_communities(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, CommunityRow>(
        r#"SELECT c.id, c.creator_id, c.name, c.description, c.type, c.join_fee, c.monthly_fee,
                  c.agent_call_fee, c.status, c.member_count, c.avatar_url, c.cover_image_url,
                  c.category, c.tags, c.created_at, c.updated_at
           FROM communities c
           JOIN community_members cm ON c.id = cm.community_id
           WHERE cm.user_id = $1 AND c.status = 'active'
           ORDER BY cm.joined_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let communities: Vec<Value> = rows.iter().map(community_json).collect();
            (StatusCode::OK, Json(json!({ "communities": communities })))
        }
        Err(e) => {
            tracing::error!("Joined communities failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}
