use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::Json,
    routing::{delete, get, patch, post},
    Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::{AuthAdmin, AuthUser};
use crate::services::message_seq::get_next_seq;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Public
        .route("/api/stickers", get(list_packs))
        .route("/api/stickers/{id}", get(get_pack))
        .route("/api/stickers/{id}/purchase", post(purchase_pack))
        .route("/api/stickers/{id}/gift", post(gift_pack))
        // User
        .route("/api/user/stickers", get(user_packs))
        .route("/api/user/stickers/favorites", get(list_favorites))
        .route("/api/user/stickers/favorites", post(add_favorite))
        .route(
            "/api/user/stickers/favorites/reorder",
            patch(reorder_favorites),
        )
        .route(
            "/api/user/stickers/favorites/{sticker_id}",
            delete(remove_favorite),
        )
        // Creator
        .route("/api/creator/stickers", get(creator_list_packs))
        .route("/api/creator/stickers", post(create_pack))
        .route("/api/creator/stickers/{id}", patch(update_pack))
        .route("/api/creator/stickers/{id}", delete(delete_pack))
        .route("/api/creator/stickers/{id}/stickers", post(add_sticker))
        .route(
            "/api/creator/stickers/{pack_id}/stickers/{sticker_id}",
            delete(delete_sticker),
        )
        .route(
            "/api/creator/stickers/{id}/submit-review",
            post(submit_review),
        )
        // Admin
        .route("/api/admin/stickers/pending", get(admin_list_pending))
        .route("/api/admin/stickers/{id}/review", post(admin_review))
}

// ===== Row structs =====

#[derive(sqlx::FromRow)]
#[allow(dead_code)]
struct PackRow {
    id: Uuid,
    creator_id: String,
    name: String,
    name_zh: Option<String>,
    description: Option<String>,
    character_name: Option<String>,
    category: String,
    price: i32,
    status: String,
    downloads: i32,
    cover_image: Option<String>,
    agent_compatible: bool,
    review_status: String,
    review_note: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
#[allow(dead_code)]
struct PackWithCount {
    id: Uuid,
    creator_id: String,
    name: String,
    name_zh: Option<String>,
    description: Option<String>,
    character_name: Option<String>,
    category: String,
    price: i32,
    status: String,
    downloads: i32,
    cover_image: Option<String>,
    agent_compatible: bool,
    review_status: String,
    review_note: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    sticker_count: Option<i64>,
    creator_name: Option<String>,
}

#[derive(sqlx::FromRow)]
struct StickerRow {
    id: Uuid,
    pack_id: Uuid,
    filename: String,
    emoji: Option<String>,
    description_en: Option<String>,
    description_zh: Option<String>,
    agent_prompt: Option<String>,
    sort_order: i32,
    created_at: DateTime<Utc>,
}

fn pack_to_json(p: &PackWithCount) -> Value {
    json!({
        "id": p.id,
        "creatorId": p.creator_id,
        "creatorName": p.creator_name,
        "name": p.name,
        "nameZh": p.name_zh,
        "description": p.description,
        "characterName": p.character_name,
        "category": p.category,
        "price": p.price,
        "status": p.status,
        "downloads": p.downloads,
        "coverImage": p.cover_image,
        "agentCompatible": p.agent_compatible,
        "reviewStatus": p.review_status,
        "stickerCount": p.sticker_count.unwrap_or(0),
        "createdAt": p.created_at.to_rfc3339(),
        "updatedAt": p.updated_at.to_rfc3339(),
    })
}

fn sticker_to_json(s: &StickerRow) -> Value {
    json!({
        "id": s.id,
        "packId": s.pack_id,
        "filename": s.filename,
        "emoji": s.emoji,
        "descriptionEn": s.description_en,
        "descriptionZh": s.description_zh,
        "agentPrompt": s.agent_prompt,
        "sortOrder": s.sort_order,
        "createdAt": s.created_at.to_rfc3339(),
    })
}

// ===== GET /api/stickers — list all active packs =====

async fn list_packs(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    let rows = match sqlx::query_as::<_, PackWithCount>(
        r#"SELECT sp.*, COUNT(s.id) AS sticker_count, u.name AS creator_name
           FROM sticker_packs sp
           LEFT JOIN stickers s ON s.pack_id = sp.id
           LEFT JOIN "user" u ON u.id = sp.creator_id
           WHERE sp.status = 'active'
             AND (sp.agent_compatible = FALSE OR sp.review_status = 'approved')
           GROUP BY sp.id, u.name
           ORDER BY sp.downloads DESC, sp.created_at DESC"#,
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("List sticker packs failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to fetch sticker packs" })),
            );
        }
    };

    let packs: Vec<Value> = rows.iter().map(pack_to_json).collect();
    (StatusCode::OK, Json(json!({ "packs": packs })))
}

// ===== GET /api/stickers/:id — single pack with stickers =====

async fn get_pack(
    State(state): State<AppState>,
    Path(pack_id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let pack = sqlx::query_as::<_, PackWithCount>(
        r#"SELECT sp.*, COUNT(s.id) AS sticker_count, u.name AS creator_name
           FROM sticker_packs sp
           LEFT JOIN stickers s ON s.pack_id = sp.id
           LEFT JOIN "user" u ON u.id = sp.creator_id
           WHERE sp.id = $1
           GROUP BY sp.id, u.name"#,
    )
    .bind(pack_id)
    .fetch_optional(&state.db)
    .await;

    let pack = match pack {
        Ok(Some(p)) => p,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Pack not found" })),
            );
        }
        Err(e) => {
            tracing::error!("Fetch sticker pack failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Internal error" })),
            );
        }
    };

    let stickers = sqlx::query_as::<_, StickerRow>(
        "SELECT * FROM stickers WHERE pack_id = $1 ORDER BY sort_order ASC, created_at ASC",
    )
    .bind(pack_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let stickers_json: Vec<Value> = stickers.iter().map(sticker_to_json).collect();

    (
        StatusCode::OK,
        Json(json!({
            "pack": pack_to_json(&pack),
            "stickers": stickers_json,
        })),
    )
}

// ===== POST /api/stickers/:id/purchase — purchase a pack =====

async fn purchase_pack(
    State(state): State<AppState>,
    user: AuthUser,
    Path(pack_id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Fetch pack
    let pack = sqlx::query_as::<_, PackRow>(
        "SELECT * FROM sticker_packs WHERE id = $1 AND status = 'active'",
    )
    .bind(pack_id)
    .fetch_optional(&state.db)
    .await;

    let pack = match pack {
        Ok(Some(p)) => p,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Pack not found or not active" })),
            );
        }
        Err(e) => {
            tracing::error!("Fetch pack failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Internal error" })),
            );
        }
    };

    // Block self-purchase
    if pack.creator_id == user.id {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Cannot purchase your own pack" })),
        );
    }

    // Check if already purchased
    let already = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM user_stickers WHERE user_id = $1 AND pack_id = $2",
    )
    .bind(&user.id)
    .bind(pack_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if already > 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Already purchased" })),
        );
    }

    // Free packs — just record ownership
    if pack.price == 0 {
        let _ = sqlx::query(
            "INSERT INTO user_stickers (user_id, pack_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(&user.id)
        .bind(pack_id)
        .execute(&state.db)
        .await;

        let _ = sqlx::query(
            "UPDATE sticker_packs SET downloads = downloads + 1 WHERE id = $1",
        )
        .bind(pack_id)
        .execute(&state.db)
        .await;

        return (StatusCode::OK, Json(json!({ "purchased": true, "price": 0 })));
    }

    // Paid packs — atomic transaction
    let creator_share = pack.price * 7 / 10;

    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("Begin tx failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Internal error" })),
            );
        }
    };

    // Deduct balance
    let new_balance = match sqlx::query_scalar::<_, i32>(
        r#"UPDATE coin_balances
           SET balance = balance - $2, updated_at = NOW()
           WHERE user_id = $1 AND balance >= $2
           RETURNING balance"#,
    )
    .bind(&user.id)
    .bind(pack.price)
    .fetch_optional(&mut *tx)
    .await
    {
        Ok(Some(b)) => b,
        Ok(None) => {
            return (
                StatusCode::PAYMENT_REQUIRED,
                Json(json!({ "error": "Insufficient balance" })),
            );
        }
        Err(e) => {
            tracing::error!("Deduction failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Payment failed" })),
            );
        }
    };

    // Record buyer transaction
    if let Err(e) = sqlx::query(
        r#"INSERT INTO coin_transactions (user_id, type, amount, description)
           VALUES ($1, 'purchase', $2, $3)"#,
    )
    .bind(&user.id)
    .bind(-pack.price)
    .bind(format!("Sticker pack: {}", pack.name))
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Record purchase tx failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    // Credit creator
    if let Err(e) = sqlx::query(
        r#"INSERT INTO coin_balances (user_id, balance, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO UPDATE
           SET balance = coin_balances.balance + $2, updated_at = NOW()"#,
    )
    .bind(&pack.creator_id)
    .bind(creator_share)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Credit creator failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    // Record creator earning
    if let Err(e) = sqlx::query(
        r#"INSERT INTO coin_transactions (user_id, type, amount, description)
           VALUES ($1, 'earning', $2, $3)"#,
    )
    .bind(&pack.creator_id)
    .bind(creator_share)
    .bind(format!("Sticker sale: {}", pack.name))
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Record earning tx failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    // Record ownership
    if let Err(e) = sqlx::query(
        "INSERT INTO user_stickers (user_id, pack_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(&user.id)
    .bind(pack_id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Record user_stickers failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    // Increment downloads
    if let Err(e) = sqlx::query(
        "UPDATE sticker_packs SET downloads = downloads + 1 WHERE id = $1",
    )
    .bind(pack_id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Increment downloads failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("Purchase commit failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Transaction failed" })),
        );
    }

    (
        StatusCode::OK,
        Json(json!({
            "purchased": true,
            "balance": new_balance,
            "price": pack.price,
            "creatorShare": creator_share,
        })),
    )
}

// ===== GET /api/user/stickers — user's owned packs =====

async fn user_packs(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let rows = match sqlx::query_as::<_, PackWithCount>(
        r#"SELECT sp.*, COUNT(s.id) AS sticker_count, u.name AS creator_name
           FROM user_stickers us
           JOIN sticker_packs sp ON sp.id = us.pack_id
           LEFT JOIN stickers s ON s.pack_id = sp.id
           LEFT JOIN "user" u ON u.id = sp.creator_id
           WHERE us.user_id = $1
           GROUP BY sp.id, u.name
           ORDER BY MAX(us.purchased_at) DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("Fetch user stickers failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to fetch user stickers" })),
            );
        }
    };

    // Also include free packs (price = 0) that user doesn't own yet
    let free_rows = match sqlx::query_as::<_, PackWithCount>(
        r#"SELECT sp.*, COUNT(s.id) AS sticker_count, u.name AS creator_name
           FROM sticker_packs sp
           LEFT JOIN stickers s ON s.pack_id = sp.id
           LEFT JOIN "user" u ON u.id = sp.creator_id
           WHERE sp.price = 0 AND sp.status = 'active'
             AND sp.id NOT IN (SELECT pack_id FROM user_stickers WHERE user_id = $1)
           GROUP BY sp.id, u.name"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("Fetch free stickers failed: {}", e);
            Vec::new() // non-fatal
        }
    };

    let mut packs: Vec<Value> = rows.iter().map(pack_to_json).collect();
    packs.extend(free_rows.iter().map(pack_to_json));

    // For each pack, include its stickers
    let mut result: Vec<Value> = Vec::new();
    for pack_json in &packs {
        let pack_id: Uuid = serde_json::from_value(pack_json["id"].clone()).unwrap_or_default();
        let stickers = sqlx::query_as::<_, StickerRow>(
            "SELECT * FROM stickers WHERE pack_id = $1 ORDER BY sort_order ASC",
        )
        .bind(pack_id)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        let stickers_json: Vec<Value> = stickers.iter().map(sticker_to_json).collect();
        let mut p = pack_json.clone();
        p["stickers"] = json!(stickers_json);
        result.push(p);
    }

    (StatusCode::OK, Json(json!({ "packs": result })))
}

// ===== GET /api/creator/stickers — creator's own packs =====

async fn creator_list_packs(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let rows = match sqlx::query_as::<_, PackWithCount>(
        r#"SELECT sp.*, COUNT(s.id) AS sticker_count, u.name AS creator_name
           FROM sticker_packs sp
           LEFT JOIN stickers s ON s.pack_id = sp.id
           LEFT JOIN "user" u ON u.id = sp.creator_id
           WHERE sp.creator_id = $1
           GROUP BY sp.id, u.name
           ORDER BY sp.created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("Creator list packs failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to fetch packs" })),
            );
        }
    };

    let packs: Vec<Value> = rows.iter().map(pack_to_json).collect();
    (StatusCode::OK, Json(json!({ "packs": packs })))
}

// ===== POST /api/creator/stickers — create pack =====

#[derive(Deserialize)]
struct CreatePackBody {
    name: String,
    #[serde(rename = "nameZh")]
    name_zh: Option<String>,
    description: Option<String>,
    #[serde(rename = "characterName")]
    character_name: Option<String>,
    category: Option<String>,
    price: Option<i32>,
    #[serde(rename = "coverImage")]
    cover_image: Option<String>,
    #[serde(rename = "agentCompatible")]
    agent_compatible: Option<bool>,
}

async fn create_pack(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreatePackBody>,
) -> (StatusCode, Json<Value>) {
    if body.name.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Name is required" })),
        );
    }

    let category = body.category.unwrap_or_else(|| "cute".to_string());
    let price = body.price.unwrap_or(0).max(0);
    let agent_compatible = body.agent_compatible.unwrap_or(false);

    let id = match sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO sticker_packs (creator_id, name, name_zh, description, character_name, category, price, cover_image, agent_compatible)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id"#,
    )
    .bind(&user.id)
    .bind(body.name.trim())
    .bind(&body.name_zh)
    .bind(&body.description)
    .bind(&body.character_name)
    .bind(&category)
    .bind(price)
    .bind(&body.cover_image)
    .bind(agent_compatible)
    .fetch_one(&state.db)
    .await
    {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("Create sticker pack failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to create pack" })),
            );
        }
    };

    (StatusCode::CREATED, Json(json!({ "id": id })))
}

// ===== PATCH /api/creator/stickers/:id — update pack =====

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdatePackBody {
    name: Option<String>,
    #[serde(rename = "nameZh")]
    name_zh: Option<String>,
    description: Option<String>,
    #[serde(rename = "characterName")]
    character_name: Option<String>,
    category: Option<String>,
    price: Option<i32>,
    status: Option<String>,
    #[serde(rename = "coverImage")]
    cover_image: Option<String>,
    #[serde(rename = "agentCompatible")]
    agent_compatible: Option<bool>,
}

async fn update_pack(
    State(state): State<AppState>,
    user: AuthUser,
    Path(pack_id): Path<Uuid>,
    Json(body): Json<UpdatePackBody>,
) -> (StatusCode, Json<Value>) {
    if body.name.is_none()
        && body.name_zh.is_none()
        && body.description.is_none()
        && body.character_name.is_none()
        && body.category.is_none()
        && body.price.is_none()
        && body.status.is_none()
        && body.cover_image.is_none()
        && body.agent_compatible.is_none()
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "No fields to update" })),
        );
    }

    // Verify ownership
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT creator_id FROM sticker_packs WHERE id = $1",
    )
    .bind(pack_id)
    .fetch_optional(&state.db)
    .await;

    match owner {
        Ok(Some(cid)) if cid == user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Not your pack" })),
            );
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Pack not found" })),
            );
        }
        Err(e) => {
            tracing::error!("Verify ownership failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Internal error" })),
            );
        }
    }

    // Use COALESCE pattern for partial updates
    if let Err(e) = sqlx::query(
        r#"UPDATE sticker_packs SET
             name = COALESCE($2, name),
             name_zh = COALESCE($3, name_zh),
             description = COALESCE($4, description),
             character_name = COALESCE($5, character_name),
             category = COALESCE($6, category),
             price = COALESCE($7, price),
             status = COALESCE($8, status),
             cover_image = COALESCE($9, cover_image),
             agent_compatible = COALESCE($10, agent_compatible),
             updated_at = NOW()
           WHERE id = $1"#,
    )
    .bind(pack_id)
    .bind(&body.name)
    .bind(&body.name_zh)
    .bind(&body.description)
    .bind(&body.character_name)
    .bind(&body.category)
    .bind(body.price)
    .bind(&body.status)
    .bind(&body.cover_image)
    .bind(body.agent_compatible)
    .execute(&state.db)
    .await
    {
        tracing::error!("Update pack failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Update failed" })),
        );
    }

    (StatusCode::OK, Json(json!({ "updated": true })))
}

// ===== DELETE /api/creator/stickers/:id — delete pack =====

async fn delete_pack(
    State(state): State<AppState>,
    user: AuthUser,
    Path(pack_id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let result = sqlx::query(
        "DELETE FROM sticker_packs WHERE id = $1 AND creator_id = $2",
    )
    .bind(pack_id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => {
            (StatusCode::OK, Json(json!({ "deleted": true })))
        }
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Pack not found or not yours" })),
        ),
        Err(e) => {
            tracing::error!("Delete pack failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Delete failed" })),
            )
        }
    }
}

// ===== POST /api/creator/stickers/:id/stickers — add sticker to pack =====

#[derive(Deserialize)]
struct AddStickerBody {
    filename: String,
    emoji: Option<String>,
    #[serde(rename = "descriptionEn")]
    description_en: Option<String>,
    #[serde(rename = "descriptionZh")]
    description_zh: Option<String>,
    #[serde(rename = "sortOrder")]
    sort_order: Option<i32>,
    #[serde(rename = "agentPrompt")]
    agent_prompt: Option<String>,
}

async fn add_sticker(
    State(state): State<AppState>,
    user: AuthUser,
    Path(pack_id): Path<Uuid>,
    Json(body): Json<AddStickerBody>,
) -> (StatusCode, Json<Value>) {
    // Verify ownership
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT creator_id FROM sticker_packs WHERE id = $1",
    )
    .bind(pack_id)
    .fetch_optional(&state.db)
    .await;

    match owner {
        Ok(Some(cid)) if cid == user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Not your pack" })),
            );
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Pack not found" })),
            );
        }
        Err(e) => {
            tracing::error!("Verify ownership failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Internal error" })),
            );
        }
    }

    if let Some(ref prompt) = body.agent_prompt {
        if prompt.chars().count() > 200 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "agent_prompt must be 200 characters or less" })),
            );
        }
    }

    let sort_order = body.sort_order.unwrap_or(0);

    let id = match sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO stickers (pack_id, filename, emoji, description_en, description_zh, sort_order, agent_prompt)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id"#,
    )
    .bind(pack_id)
    .bind(&body.filename)
    .bind(&body.emoji)
    .bind(&body.description_en)
    .bind(&body.description_zh)
    .bind(sort_order)
    .bind(&body.agent_prompt)
    .fetch_one(&state.db)
    .await
    {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("Add sticker failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to add sticker" })),
            );
        }
    };

    (StatusCode::CREATED, Json(json!({ "id": id })))
}

// ===== DELETE /api/creator/stickers/:pack_id/stickers/:sticker_id =====

async fn delete_sticker(
    State(state): State<AppState>,
    user: AuthUser,
    Path((pack_id, sticker_id)): Path<(Uuid, Uuid)>,
) -> (StatusCode, Json<Value>) {
    // Verify ownership of the pack
    let owner = sqlx::query_scalar::<_, String>(
        "SELECT creator_id FROM sticker_packs WHERE id = $1",
    )
    .bind(pack_id)
    .fetch_optional(&state.db)
    .await;

    match owner {
        Ok(Some(cid)) if cid == user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({ "error": "Not your pack" })),
            );
        }
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Pack not found" })),
            );
        }
        Err(e) => {
            tracing::error!("Verify ownership failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Internal error" })),
            );
        }
    }

    let result = sqlx::query(
        "DELETE FROM stickers WHERE id = $1 AND pack_id = $2",
    )
    .bind(sticker_id)
    .bind(pack_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => {
            (StatusCode::OK, Json(json!({ "deleted": true })))
        }
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Sticker not found" })),
        ),
        Err(e) => {
            tracing::error!("Delete sticker failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Delete failed" })),
            )
        }
    }
}

// ===== Gift =====

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GiftBody {
    friend_id: String,
    message: Option<String>,
}

async fn gift_pack(
    State(state): State<AppState>,
    user: AuthUser,
    Path(pack_id): Path<Uuid>,
    Json(body): Json<GiftBody>,
) -> (StatusCode, Json<Value>) {
    // 1. Verify pack exists and is active
    let pack = sqlx::query_as::<_, PackRow>(
        "SELECT * FROM sticker_packs WHERE id = $1 AND status = 'active'",
    )
    .bind(pack_id)
    .fetch_optional(&state.db)
    .await;

    let pack = match pack {
        Ok(Some(p)) => p,
        Ok(None) => return (StatusCode::NOT_FOUND, Json(json!({"error": "Pack not found"}))),
        Err(e) => {
            tracing::error!("gift_pack fetch: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Internal error"})));
        }
    };

    // 1b. Verify sender owns the sticker pack
    let sender_owns = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM user_stickers WHERE user_id = $1 AND pack_id = $2",
    )
    .bind(&user.id)
    .bind(pack_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if sender_owns == 0 {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "You don't own this sticker pack"})));
    }

    // 2. Verify friendship
    let friendship = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM friendships
           WHERE status = 'accepted'
             AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))"#,
    )
    .bind(&user.id)
    .bind(&body.friend_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if friendship == 0 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Not friends"})));
    }

    // 2b. Check if recipient already owns this pack
    let recipient_owns = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM user_stickers WHERE user_id = $1 AND pack_id = $2",
    )
    .bind(&body.friend_id)
    .bind(pack_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if recipient_owns > 0 {
        return (StatusCode::CONFLICT, Json(json!({"error": "Recipient already owns this pack"})));
    }

    // 3. Begin transaction for the entire gift operation
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("gift_pack begin tx: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Internal error"})));
        }
    };

    // 3a. Grant sticker pack to friend (skip if already owned)
    if let Err(e) = sqlx::query(
        "INSERT INTO user_stickers (user_id, pack_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(&body.friend_id)
    .bind(pack_id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("gift_pack grant: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to grant pack"})));
    }

    // 4. Find or create direct conversation with friend
    let existing_conv = sqlx::query_scalar::<_, Uuid>(
        r#"SELECT c.id FROM conversations c
           JOIN conversation_user_members cum1 ON cum1.conversation_id = c.id AND cum1.user_id = $1
           JOIN conversation_user_members cum2 ON cum2.conversation_id = c.id AND cum2.user_id = $2
           WHERE c.type = 'direct' AND c.agent_id IS NULL
           LIMIT 1"#,
    )
    .bind(&user.id)
    .bind(&body.friend_id)
    .fetch_optional(&mut *tx)
    .await
    .ok()
    .flatten();

    let conv_id = if let Some(cid) = existing_conv {
        cid
    } else {
        let new_id = Uuid::new_v4();
        if let Err(e) = sqlx::query(
            r#"INSERT INTO conversations (id, type, user_id, mention_only)
               VALUES ($1, 'direct', $2, FALSE)"#,
        )
        .bind(new_id)
        .bind(&user.id)
        .execute(&mut *tx)
        .await
        {
            tracing::error!("gift_pack create conv: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to create conversation"})));
        }
        if let Err(e) = sqlx::query(
            r#"INSERT INTO conversation_user_members (conversation_id, user_id, role)
               VALUES ($1, $2, 'member'), ($1, $3, 'member')"#,
        )
        .bind(new_id)
        .bind(&user.id)
        .bind(&body.friend_id)
        .execute(&mut *tx)
        .await
        {
            tracing::error!("gift_pack add members: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to add members"})));
        }
        new_id
    };

    // 5. Insert gift system message with JSON-encoded content (safe parsing)
    let sender_name = sqlx::query_scalar::<_, String>(
        r#"SELECT name FROM "user" WHERE id = $1"#,
    )
    .bind(&user.id)
    .fetch_optional(&mut *tx)
    .await
    .ok()
    .flatten()
    .unwrap_or_else(|| "Someone".into());

    let cover_url = pack.cover_image.as_deref().unwrap_or("");
    let gift_content = format!(
        "\u{1f381} {} sent you a sticker pack: {}",
        sender_name, pack.name
    );
    let gift_metadata = json!({
        "type": "sticker_gift",
        "packId": pack_id.to_string(),
        "packName": pack.name,
        "coverUrl": cover_url,
    });

    let conv_id_str = conv_id.to_string();
    let seq = match get_next_seq(&mut *tx, &conv_id_str).await {
        Ok(s) => s,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Seq error"}))),
    };

    let msg_id = Uuid::new_v4();
    let now = chrono::Utc::now();
    if let Err(e) = sqlx::query(
        r#"INSERT INTO messages (id, conversation_id, role, content, metadata, status, seq, sender_user_id, created_at, updated_at)
           VALUES ($1, $2, 'system', $3, $4, 'completed', $5, $6, $7, $7)"#,
    )
    .bind(msg_id)
    .bind(conv_id)
    .bind(&gift_content)
    .bind(&gift_metadata)
    .bind(seq)
    .bind(&user.id)
    .bind(now.naive_utc())
    .execute(&mut *tx)
    .await
    {
        tracing::error!("gift_pack insert msg: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to send gift message"})));
    }

    // Update conversation timestamp
    if let Err(e) = sqlx::query("UPDATE conversations SET updated_at = NOW() WHERE id = $1")
        .bind(conv_id)
        .execute(&mut *tx)
        .await
    {
        tracing::error!("gift_pack update conv: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to update conversation"})));
    }

    // 7. If the friend provided a personal message, send it as a user message
    let personal_msg_data = if let Some(ref personal_msg) = body.message {
        if !personal_msg.trim().is_empty() {
            let msg_seq = match get_next_seq(&mut *tx, &conv_id_str).await {
                Ok(s) => s,
                Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Seq error"}))),
            };
            let user_msg_id = Uuid::new_v4();
            let personal_now = chrono::Utc::now();
            if let Err(e) = sqlx::query(
                r#"INSERT INTO messages (id, conversation_id, seq, role, content, status, sender_user_id, created_at, updated_at)
                   VALUES ($1, $2, $3, 'user', $4, 'completed', $5, $6, $6)"#,
            )
            .bind(user_msg_id)
            .bind(conv_id)
            .bind(msg_seq)
            .bind(personal_msg.trim())
            .bind(&user.id)
            .bind(personal_now.naive_utc())
            .execute(&mut *tx)
            .await
            {
                tracing::error!("gift_pack personal msg: {}", e);
                return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to send personal message"})));
            }
            Some((user_msg_id, msg_seq, personal_msg.trim().to_string(), personal_now))
        } else {
            None
        }
    } else {
        None
    };

    // Commit transaction
    if let Err(e) = tx.commit().await {
        tracing::error!("gift_pack commit: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Transaction failed"})));
    }

    // 6. Broadcast via WS (after commit so readers see committed data)
    let member_ids: Vec<String> = sqlx::query_as::<_, (String,)>(
        "SELECT user_id FROM conversation_user_members WHERE conversation_id = $1",
    )
    .bind(conv_id)
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
            "id": msg_id.to_string(),
            "conversationId": conv_id_str,
            "seq": seq,
            "role": "system",
            "content": &gift_content,
            "metadata": &gift_metadata,
            "status": "completed",
            "senderUserId": &user.id,
            "createdAt": now.to_rfc3339(),
            "updatedAt": now.to_rfc3339(),
        }
    });
    state.ws.broadcast_to_members(&member_ids, &msg_event, &state.redis);

    // Broadcast personal message via WS too
    if let Some((user_msg_id, msg_seq, personal_content, personal_now)) = personal_msg_data {
        let personal_event = json!({
            "type": "new_message",
            "conversationId": conv_id_str,
            "message": {
                "id": user_msg_id.to_string(),
                "conversationId": conv_id_str,
                "seq": msg_seq,
                "role": "user",
                "content": personal_content,
                "status": "completed",
                "senderUserId": &user.id,
                "createdAt": personal_now.to_rfc3339(),
                "updatedAt": personal_now.to_rfc3339(),
            }
        });
        state.ws.broadcast_to_members(&member_ids, &personal_event, &state.redis);
    }

    (StatusCode::OK, Json(json!({"gifted": true, "conversationId": conv_id})))
}

// ===== POST /api/creator/stickers/:id/submit-review — submit for review =====

async fn submit_review(
    State(state): State<AppState>,
    user: AuthUser,
    Path(pack_id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Verify ownership and agent_compatible
    let pack = sqlx::query_as::<_, PackRow>(
        "SELECT * FROM sticker_packs WHERE id = $1",
    )
    .bind(pack_id)
    .fetch_optional(&state.db)
    .await;

    let pack = match pack {
        Ok(Some(p)) => p,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Pack not found" })),
            );
        }
        Err(e) => {
            tracing::error!("submit_review fetch: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Internal error" })),
            );
        }
    };

    if pack.creator_id != user.id {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Not your pack" })),
        );
    }

    if !pack.agent_compatible {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Pack is not agent compatible" })),
        );
    }

    // Check all stickers have agent_prompt
    let missing = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM stickers WHERE pack_id = $1 AND (agent_prompt IS NULL OR agent_prompt = '')",
    )
    .bind(pack_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if missing > 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "All stickers must have an agent_prompt before submitting for review" })),
        );
    }

    // Check there is at least one sticker
    let sticker_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM stickers WHERE pack_id = $1",
    )
    .bind(pack_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if sticker_count == 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Pack must have at least one sticker" })),
        );
    }

    if let Err(e) = sqlx::query(
        "UPDATE sticker_packs SET review_status = 'pending_review', review_note = NULL, updated_at = NOW() WHERE id = $1",
    )
    .bind(pack_id)
    .execute(&state.db)
    .await
    {
        tracing::error!("submit_review update: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Failed to submit for review" })),
        );
    }

    (StatusCode::OK, Json(json!({ "submitted": true })))
}

// ===== GET /api/admin/stickers/pending — list pending review packs with stickers =====

async fn admin_list_pending(
    State(state): State<AppState>,
    _admin: AuthAdmin,
) -> (StatusCode, Json<Value>) {
    let rows = match sqlx::query_as::<_, PackWithCount>(
        r#"SELECT sp.*, COUNT(s.id) AS sticker_count, u.name AS creator_name
           FROM sticker_packs sp
           LEFT JOIN stickers s ON s.pack_id = sp.id
           LEFT JOIN "user" u ON u.id = sp.creator_id
           WHERE sp.review_status = 'pending_review'
           GROUP BY sp.id, u.name
           ORDER BY sp.updated_at ASC"#,
    )
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("Admin list pending packs failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to fetch pending packs" })),
            );
        }
    };

    let mut packs: Vec<Value> = Vec::new();
    for row in &rows {
        let mut p = pack_to_json(row);
        // Include stickers with agent_prompt for review
        let stickers = sqlx::query_as::<_, StickerRow>(
            "SELECT * FROM stickers WHERE pack_id = $1 ORDER BY sort_order ASC",
        )
        .bind(row.id)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();
        p["stickers"] = json!(stickers.iter().map(sticker_to_json).collect::<Vec<_>>());
        packs.push(p);
    }

    (StatusCode::OK, Json(json!({ "packs": packs })))
}

// ===== POST /api/admin/stickers/:id/review — admin approve/reject =====

#[derive(Deserialize)]
struct AdminReviewBody {
    action: String, // "approve" or "reject"
    note: Option<String>,
}

async fn admin_review(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Path(pack_id): Path<Uuid>,
    Json(body): Json<AdminReviewBody>,
) -> (StatusCode, Json<Value>) {
    let new_status = match body.action.as_str() {
        "approve" => "approved",
        "reject" => "rejected",
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "action must be 'approve' or 'reject'" })),
            );
        }
    };

    let result = sqlx::query(
        "UPDATE sticker_packs SET review_status = $2, review_note = $3, updated_at = NOW() WHERE id = $1 AND review_status = 'pending_review'",
    )
    .bind(pack_id)
    .bind(new_status)
    .bind(&body.note)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => {
            (StatusCode::OK, Json(json!({ "reviewed": true, "status": new_status })))
        }
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({ "error": "Pack not found or not pending review" })),
        ),
        Err(e) => {
            tracing::error!("admin_review update: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Review failed" })),
            )
        }
    }
}

// ===== Favorites =====

// GET /api/user/stickers/favorites
async fn list_favorites(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, StickerRow>(
        r#"SELECT s.* FROM user_favorite_stickers uf
           JOIN stickers s ON s.id = uf.sticker_id
           WHERE uf.user_id = $1
           ORDER BY uf.sort_order ASC, uf.created_at ASC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let stickers: Vec<Value> = rows.iter().map(sticker_to_json).collect();
    (StatusCode::OK, Json(json!({ "favorites": stickers })))
}

// POST /api/user/stickers/favorites
#[derive(Deserialize)]
struct AddFavoriteBody {
    #[serde(rename = "stickerId")]
    sticker_id: Uuid,
}

async fn add_favorite(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<AddFavoriteBody>,
) -> (StatusCode, Json<Value>) {
    // Get next sort_order
    let max_order = sqlx::query_scalar::<_, Option<i32>>(
        "SELECT MAX(sort_order) FROM user_favorite_stickers WHERE user_id = $1",
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(None)
    .unwrap_or(0);

    let result = sqlx::query(
        r#"INSERT INTO user_favorite_stickers (user_id, sticker_id, sort_order)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, sticker_id) DO NOTHING"#,
    )
    .bind(&user.id)
    .bind(body.sticker_id)
    .bind(max_order + 1)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({ "added": true }))),
        Err(e) => {
            tracing::error!("add_favorite: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to add favorite" })),
            )
        }
    }
}

// DELETE /api/user/stickers/favorites/:stickerId
async fn remove_favorite(
    State(state): State<AppState>,
    user: AuthUser,
    Path(sticker_id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    let result = sqlx::query(
        "DELETE FROM user_favorite_stickers WHERE user_id = $1 AND sticker_id = $2",
    )
    .bind(&user.id)
    .bind(sticker_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::OK, Json(json!({ "removed": true }))),
        Err(e) => {
            tracing::error!("remove_favorite: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to remove favorite" })),
            )
        }
    }
}

// PATCH /api/user/stickers/favorites/reorder
#[derive(Deserialize)]
struct ReorderFavoritesBody {
    stickers: Vec<ReorderItem>,
}

#[derive(Deserialize)]
struct ReorderItem {
    id: Uuid,
    #[serde(rename = "sortOrder")]
    sort_order: i32,
}

async fn reorder_favorites(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<ReorderFavoritesBody>,
) -> (StatusCode, Json<Value>) {
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("reorder_favorites begin tx: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to reorder" })),
            );
        }
    };

    for item in &body.stickers {
        if let Err(e) = sqlx::query(
            "UPDATE user_favorite_stickers SET sort_order = $3 WHERE user_id = $1 AND sticker_id = $2",
        )
        .bind(&user.id)
        .bind(item.id)
        .bind(item.sort_order)
        .execute(&mut *tx)
        .await
        {
            tracing::error!("reorder_favorites: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to reorder" })),
            );
        }
    }

    if let Err(e) = tx.commit().await {
        tracing::error!("reorder_favorites commit: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Failed to reorder" })),
        );
    }

    (StatusCode::OK, Json(json!({ "reordered": true })))
}
