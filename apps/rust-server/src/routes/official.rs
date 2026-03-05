use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{get, post, put},
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
        // Official CS endpoints
        .route("/api/communities/{id}/start-chat", post(start_chat))
        .route(
            "/api/communities/{id}/transfer-human",
            post(transfer_human),
        )
        .route(
            "/api/communities/{id}/accept-transfer",
            post(accept_transfer),
        )
        .route("/api/communities/{id}/resolve", post(resolve))
        .route("/api/communities/{id}/cs-status", get(cs_status))
        .route("/api/communities/{id}/cs-queue", get(cs_queue))
        .route("/api/communities/{id}/invite-cs", post(invite_cs))
        // Verification
        .route("/api/communities/{id}/verify", post(submit_verification))
        .route(
            "/api/admin/verification-requests",
            get(list_verification_requests),
        )
        .route(
            "/api/admin/verification-requests/{id}",
            put(review_verification),
        )
}

// ---------------------------------------------------------------------------
// POST /api/communities/:id/start-chat — Start 1-on-1 with Official
// ---------------------------------------------------------------------------

async fn start_chat(
    State(state): State<AppState>,
    user: AuthUser,
    Path(community_id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Verify it's an official community
    let community = sqlx::query_as::<_, (String, Option<String>, Option<Uuid>)>(
        r#"SELECT type, cs_mode, default_agent_listing_id
           FROM communities WHERE id = $1 AND status = 'active'"#,
    )
    .bind(community_id)
    .fetch_optional(&state.db)
    .await;

    let (community_type, cs_mode, default_agent_id) = match community {
        Ok(Some(c)) => c,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Community not found" })),
            );
        }
        Err(e) => {
            tracing::error!("start_chat: fetch community failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    if community_type != "official" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "start-chat is only available for official communities" })),
        );
    }

    // Check if conversation already exists
    let existing = sqlx::query_as::<_, (Uuid,)>(
        r#"SELECT conversation_id FROM official_conversations
           WHERE community_id = $1 AND user_id = $2"#,
    )
    .bind(community_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    if let Ok(Some((conv_id,))) = existing {
        return (
            StatusCode::OK,
            Json(json!({ "conversationId": conv_id, "existing": true })),
        );
    }

    // Create conversation
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("start_chat: begin tx failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Get community name for conversation title
    let community_name: String = sqlx::query_scalar(
        "SELECT name FROM communities WHERE id = $1",
    )
    .bind(community_id)
    .fetch_one(&mut *tx)
    .await
    .unwrap_or_else(|_| "Official".to_string());

    let conv_id = match sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO conversations (title, type, user_id, agent_id, mention_only)
           VALUES ($1, 'official', $2, $3, FALSE)
           RETURNING id"#,
    )
    .bind(&community_name)
    .bind(&user.id)
    .bind(default_agent_id)
    .fetch_one(&mut *tx)
    .await
    {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("start_chat: create conversation failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    let cs_mode_str = cs_mode.as_deref().unwrap_or("ai_only");
    let initial_status = if cs_mode_str == "human_only" {
        "waiting_human"
    } else {
        "ai_active"
    };

    if let Err(e) = sqlx::query(
        r#"INSERT INTO official_conversations (community_id, user_id, conversation_id, status)
           VALUES ($1, $2, $3, $4)"#,
    )
    .bind(community_id)
    .bind(&user.id)
    .bind(conv_id)
    .bind(initial_status)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("start_chat: insert official_conversations failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("start_chat: commit failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    (
        StatusCode::CREATED,
        Json(json!({
            "conversationId": conv_id,
            "existing": false,
            "status": initial_status,
        })),
    )
}

// ---------------------------------------------------------------------------
// POST /api/communities/:id/transfer-human — User requests transfer to human
// ---------------------------------------------------------------------------

async fn transfer_human(
    State(state): State<AppState>,
    user: AuthUser,
    Path(community_id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let result = sqlx::query(
        r#"UPDATE official_conversations
           SET status = 'waiting_human', updated_at = NOW()
           WHERE community_id = $1 AND user_id = $2 AND status = 'ai_active'"#,
    )
    .bind(community_id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => (
            StatusCode::OK,
            Json(json!({ "status": "waiting_human" })),
        ),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "No active AI conversation found" })),
        ),
        Err(e) => {
            tracing::error!("transfer_human failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// POST /api/communities/:id/accept-transfer — CS agent accepts transfer
// ---------------------------------------------------------------------------

async fn accept_transfer(
    State(state): State<AppState>,
    user: AuthUser,
    Path(community_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> (StatusCode, Json<Value>) {
    // Verify user is cs_agent or creator/moderator
    let user_role = sqlx::query_scalar::<_, String>(
        r#"SELECT role FROM community_members
           WHERE community_id = $1 AND user_id = $2"#,
    )
    .bind(community_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match &user_role {
        Ok(Some(role)) if role == "creator" || role == "moderator" || role == "cs_agent" => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Not authorized as CS agent" })),
            );
        }
    }

    let conv_id = body
        .get("conversationId")
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok());

    let conv_id = match conv_id {
        Some(id) => id,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "conversationId required" })),
            );
        }
    };

    let result = sqlx::query(
        r#"UPDATE official_conversations
           SET status = 'human_active', assigned_cs_id = $3, updated_at = NOW()
           WHERE community_id = $1 AND conversation_id = $2 AND status = 'waiting_human'"#,
    )
    .bind(community_id)
    .bind(conv_id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => (
            StatusCode::OK,
            Json(json!({ "status": "human_active" })),
        ),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "No waiting conversation found" })),
        ),
        Err(e) => {
            tracing::error!("accept_transfer failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// POST /api/communities/:id/resolve — Mark conversation resolved
// ---------------------------------------------------------------------------

async fn resolve(
    State(state): State<AppState>,
    user: AuthUser,
    Path(community_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> (StatusCode, Json<Value>) {
    let conv_id = body
        .get("conversationId")
        .and_then(|v| v.as_str())
        .and_then(|s| Uuid::parse_str(s).ok());

    let conv_id = match conv_id {
        Some(id) => id,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "conversationId required" })),
            );
        }
    };

    // Allow CS agent, creator, moderator, or the user themselves to resolve
    let result = sqlx::query(
        r#"UPDATE official_conversations
           SET status = 'resolved', updated_at = NOW()
           WHERE community_id = $1 AND conversation_id = $2
             AND (user_id = $3 OR assigned_cs_id = $3
                  OR EXISTS (SELECT 1 FROM community_members WHERE community_id = $1 AND user_id = $3 AND role IN ('creator', 'moderator', 'cs_agent')))"#,
    )
    .bind(community_id)
    .bind(conv_id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => (
            StatusCode::OK,
            Json(json!({ "status": "resolved" })),
        ),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Conversation not found or not authorized" })),
        ),
        Err(e) => {
            tracing::error!("resolve failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/communities/:id/cs-status?conversationId=... — CS status for a conversation
// ---------------------------------------------------------------------------

async fn cs_status(
    State(state): State<AppState>,
    _user: AuthUser,
    Path(community_id): Path<Uuid>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> (StatusCode, Json<Value>) {
    let conversation_id = match params
        .get("conversationId")
        .and_then(|s| Uuid::parse_str(s).ok())
    {
        Some(id) => id,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "conversationId required (valid UUID)" })),
            );
        }
    };

    let status = sqlx::query_scalar::<_, String>(
        "SELECT status FROM official_conversations WHERE community_id = $1 AND conversation_id = $2",
    )
    .bind(community_id)
    .bind(conversation_id)
    .fetch_optional(&state.db)
    .await;

    match status {
        Ok(Some(s)) => (StatusCode::OK, Json(json!({ "status": s }))),
        Ok(None) => (StatusCode::OK, Json(json!({ "status": "none" }))),
        Err(e) => {
            tracing::error!("cs_status failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/communities/:id/cs-queue — CS queue for dashboard
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct CsQueueRow {
    id: Uuid,
    conversation_id: Uuid,
    user_id: String,
    status: String,
    assigned_cs_id: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    user_name: String,
    user_image: Option<String>,
}

async fn cs_queue(
    State(state): State<AppState>,
    user: AuthUser,
    Path(community_id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Verify CS role
    let role = sqlx::query_scalar::<_, String>(
        r#"SELECT role FROM community_members
           WHERE community_id = $1 AND user_id = $2"#,
    )
    .bind(community_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match &role {
        Ok(Some(r)) if r == "creator" || r == "moderator" || r == "cs_agent" => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Not authorized" })),
            );
        }
    }

    let rows = sqlx::query_as::<_, CsQueueRow>(
        r#"SELECT oc.id, oc.conversation_id, oc.user_id, oc.status,
                  oc.assigned_cs_id, oc.created_at, oc.updated_at,
                  u.name AS user_name, u.image AS user_image
           FROM official_conversations oc
           JOIN "user" u ON oc.user_id = u.id
           WHERE oc.community_id = $1
           ORDER BY
             CASE oc.status
               WHEN 'waiting_human' THEN 0
               WHEN 'human_active' THEN 1
               WHEN 'ai_active' THEN 2
               WHEN 'resolved' THEN 3
               ELSE 4
             END,
             oc.updated_at DESC"#,
    )
    .bind(community_id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let queue: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "conversationId": r.conversation_id,
                        "userId": r.user_id,
                        "status": r.status,
                        "assignedCsId": r.assigned_cs_id,
                        "userName": r.user_name,
                        "userImage": r.user_image,
                        "createdAt": r.created_at.to_rfc3339(),
                        "updatedAt": r.updated_at.to_rfc3339(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "queue": queue })))
        }
        Err(e) => {
            tracing::error!("cs_queue failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// POST /api/communities/:id/invite-cs — Invite user as CS agent
// ---------------------------------------------------------------------------

async fn invite_cs(
    State(state): State<AppState>,
    user: AuthUser,
    Path(community_id): Path<Uuid>,
    Json(body): Json<Value>,
) -> (StatusCode, Json<Value>) {
    // Verify creator/moderator
    let role = sqlx::query_scalar::<_, String>(
        r#"SELECT role FROM community_members
           WHERE community_id = $1 AND user_id = $2"#,
    )
    .bind(community_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match &role {
        Ok(Some(r)) if r == "creator" || r == "moderator" => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Only creator/moderator can invite CS agents" })),
            );
        }
    }

    let target_user_id = match body.get("userId").and_then(|v| v.as_str()) {
        Some(id) => id.to_string(),
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "userId required" })),
            );
        }
    };

    // Upsert member with cs_agent role
    let result = sqlx::query(
        r#"INSERT INTO community_members (community_id, user_id, role)
           VALUES ($1, $2, 'cs_agent')
           ON CONFLICT (community_id, user_id)
           DO UPDATE SET role = 'cs_agent'"#,
    )
    .bind(community_id)
    .bind(&target_user_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({ "success": true }))),
        Err(e) => {
            tracing::error!("invite_cs failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// POST /api/communities/:id/verify — Submit verification request
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct VerifyBody {
    #[serde(rename = "businessName")]
    business_name: Option<String>,
    #[serde(rename = "businessRegistration")]
    business_registration: Option<String>,
    #[serde(rename = "documentsUrl")]
    documents_url: Option<String>,
}

async fn submit_verification(
    State(state): State<AppState>,
    user: AuthUser,
    Path(community_id): Path<Uuid>,
    Json(body): Json<VerifyBody>,
) -> (StatusCode, Json<Value>) {
    // Verify creator
    let creator_id = sqlx::query_scalar::<_, String>(
        "SELECT creator_id FROM communities WHERE id = $1",
    )
    .bind(community_id)
    .fetch_optional(&state.db)
    .await;

    match &creator_id {
        Ok(Some(cid)) if cid == &user.id => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Only the creator can request verification" })),
            );
        }
    }

    let result = sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO official_verification_requests
             (community_id, requester_id, business_name, business_registration, documents_url)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id"#,
    )
    .bind(community_id)
    .bind(&user.id)
    .bind(body.business_name.as_deref())
    .bind(body.business_registration.as_deref())
    .bind(body.documents_url.as_deref())
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(id) => (
            StatusCode::CREATED,
            Json(json!({ "requestId": id })),
        ),
        Err(e) => {
            tracing::error!("submit_verification failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/admin/verification-requests — Admin list
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct VerificationRow {
    id: Uuid,
    community_id: Uuid,
    requester_id: String,
    business_name: Option<String>,
    business_registration: Option<String>,
    documents_url: Option<String>,
    status: String,
    reviewer_notes: Option<String>,
    created_at: DateTime<Utc>,
    reviewed_at: Option<DateTime<Utc>>,
    community_name: String,
}

async fn list_verification_requests(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    // Check admin
    let is_admin = sqlx::query_scalar::<_, bool>(
        r#"SELECT COALESCE(is_admin, FALSE) FROM "user" WHERE id = $1"#,
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !is_admin {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Admin only" })),
        );
    }

    let rows = sqlx::query_as::<_, VerificationRow>(
        r#"SELECT vr.id, vr.community_id, vr.requester_id,
                  vr.business_name, vr.business_registration, vr.documents_url,
                  vr.status, vr.reviewer_notes, vr.created_at, vr.reviewed_at,
                  c.name AS community_name
           FROM official_verification_requests vr
           JOIN communities c ON vr.community_id = c.id
           ORDER BY
             CASE vr.status WHEN 'pending' THEN 0 ELSE 1 END,
             vr.created_at DESC"#,
    )
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let requests: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "communityId": r.community_id,
                        "requesterId": r.requester_id,
                        "businessName": r.business_name,
                        "businessRegistration": r.business_registration,
                        "documentsUrl": r.documents_url,
                        "status": r.status,
                        "reviewerNotes": r.reviewer_notes,
                        "communityName": r.community_name,
                        "createdAt": r.created_at.to_rfc3339(),
                        "reviewedAt": r.reviewed_at.map(|d| d.to_rfc3339()),
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "requests": requests })))
        }
        Err(e) => {
            tracing::error!("list_verification_requests failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// PUT /api/admin/verification-requests/:id — Admin review
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct ReviewBody {
    status: String,
    #[serde(rename = "reviewerNotes")]
    reviewer_notes: Option<String>,
}

async fn review_verification(
    State(state): State<AppState>,
    user: AuthUser,
    Path(request_id): Path<Uuid>,
    Json(body): Json<ReviewBody>,
) -> (StatusCode, Json<Value>) {
    let is_admin = sqlx::query_scalar::<_, bool>(
        r#"SELECT COALESCE(is_admin, FALSE) FROM "user" WHERE id = $1"#,
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !is_admin {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Admin only" })),
        );
    }

    if body.status != "approved" && body.status != "rejected" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "status must be 'approved' or 'rejected'" })),
        );
    }

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("review_verification: begin tx failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Update request
    let community_id = sqlx::query_scalar::<_, Uuid>(
        r#"UPDATE official_verification_requests
           SET status = $2, reviewer_notes = $3, reviewed_at = NOW()
           WHERE id = $1 AND status = 'pending'
           RETURNING community_id"#,
    )
    .bind(request_id)
    .bind(&body.status)
    .bind(body.reviewer_notes.as_deref())
    .fetch_optional(&mut *tx)
    .await;

    let community_id = match community_id {
        Ok(Some(id)) => id,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Request not found or already reviewed" })),
            );
        }
        Err(e) => {
            tracing::error!("review_verification: update request failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // If approved, mark community as verified
    if body.status == "approved" {
        if let Err(e) = sqlx::query(
            r#"UPDATE communities SET verified = TRUE, verified_at = NOW(), updated_at = NOW()
               WHERE id = $1"#,
        )
        .bind(community_id)
        .execute(&mut *tx)
        .await
        {
            tracing::error!("review_verification: update community failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("review_verification: commit failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    (StatusCode::OK, Json(json!({ "success": true })))
}
