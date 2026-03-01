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

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Public
        .route("/api/stickers", get(list_packs))
        .route("/api/stickers/{id}", get(get_pack))
        .route("/api/stickers/{id}/purchase", post(purchase_pack))
        // User
        .route("/api/user/stickers", get(user_packs))
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
}

// ===== Row structs =====

#[derive(sqlx::FromRow)]
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
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
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
           ORDER BY us.purchased_at DESC"#,
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

    let id = match sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO sticker_packs (creator_id, name, name_zh, description, character_name, category, price, cover_image)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
}

async fn update_pack(
    State(state): State<AppState>,
    user: AuthUser,
    Path(pack_id): Path<Uuid>,
    Json(body): Json<UpdatePackBody>,
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

    let sort_order = body.sort_order.unwrap_or(0);

    let id = match sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO stickers (pack_id, filename, emoji, description_en, description_zh, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id"#,
    )
    .bind(pack_id)
    .bind(&body.filename)
    .bind(&body.emoji)
    .bind(&body.description_en)
    .bind(&body.description_zh)
    .bind(sort_order)
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
