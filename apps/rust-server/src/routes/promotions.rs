use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, post, put},
    Router,
};
use chrono::{NaiveDateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::{AuthAdmin, AuthUser};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Buyer
        .route("/api/promotions/active", get(active_promotions))
        .route(
            "/api/promotions/{item_type}/{item_id}",
            get(promotions_for_item),
        )
        .route("/api/promo-codes/redeem", post(redeem_code))
        // Creator
        .route(
            "/api/creator/promotions",
            get(creator_list).post(creator_create),
        )
        .route(
            "/api/creator/promotions/{id}",
            put(creator_update).delete(creator_delete),
        )
        .route(
            "/api/creator/promotions/{id}/codes",
            post(creator_generate_codes),
        )
        // Admin
        .route(
            "/api/admin/promotions",
            get(admin_list).post(admin_create),
        )
}

// ── Shared helpers ───────────────────────────────────────────────────────

/// Calculate discounted price given discount_type, discount_value, original_price.
fn calc_discounted_price(
    discount_type: &str,
    discount_value: f64,
    override_value: Option<f64>,
    original_price: f64,
) -> f64 {
    let value = override_value.unwrap_or(discount_value);
    let discounted = match discount_type {
        "percentage" => original_price * (1.0 - value / 100.0),
        "fixed_amount" => original_price - value,
        "fixed_price" => value,
        _ => original_price,
    };
    // Never below 0
    discounted.max(0.0)
}

// ── Buyer endpoints ──────────────────────────────────────────────────────

/// GET /api/promotions/active — currently active promotions visible to buyers
async fn active_promotions(
    State(state): State<AppState>,
    _user: AuthUser,
) -> Response {
    let now = Utc::now();
    let rows = sqlx::query_as::<_, (Uuid, Option<String>, Option<String>, String, f64, String, Option<String>, NaiveDateTime, NaiveDateTime)>(
        r#"SELECT id, display_name, description, discount_type, discount_value::float8,
                  scope, category, starts_at AT TIME ZONE 'UTC', ends_at AT TIME ZONE 'UTC'
           FROM promotions
           WHERE status = 'active' AND starts_at <= $1 AND ends_at > $1
                 AND (max_uses IS NULL OR current_uses < max_uses)
           ORDER BY ends_at ASC
           LIMIT 50"#,
    )
    .bind(now)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let list: Vec<Value> = rows
                .into_iter()
                .map(|(id, display_name, description, discount_type, discount_value, scope, category, starts, ends)| {
                    json!({
                        "id": id,
                        "displayName": display_name,
                        "description": description,
                        "discountType": discount_type,
                        "discountValue": discount_value,
                        "scope": scope,
                        "category": category,
                        "startsAt": starts.and_utc().to_rfc3339(),
                        "endsAt": ends.and_utc().to_rfc3339(),
                    })
                })
                .collect();
            Json(json!({ "promotions": list })).into_response()
        }
        Err(e) => {
            tracing::error!("active_promotions: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// GET /api/promotions/:item_type/:item_id — best available promotion for a specific item
async fn promotions_for_item(
    State(state): State<AppState>,
    _user: AuthUser,
    Path((item_type, item_id)): Path<(String, String)>,
) -> Response {
    let now = Utc::now();

    // Find all active promotions that apply to this item:
    // 1. scope='global'
    // 2. scope='category' matching item_type → category mapping
    // 3. scope='specific' with matching promotion_items row
    let category = match item_type.as_str() {
        "sticker_pack" => "sticker",
        "theme" => "theme",
        "agent_listing" => "app",
        _ => "",
    };

    let rows = sqlx::query_as::<_, (Uuid, String, f64, Option<f64>, Option<String>, NaiveDateTime)>(
        r#"SELECT p.id, p.discount_type, p.discount_value::float8,
                  pi.override_discount_value::float8,
                  p.display_name,
                  p.ends_at AT TIME ZONE 'UTC'
           FROM promotions p
           LEFT JOIN promotion_items pi
                  ON pi.promotion_id = p.id AND pi.item_type = $1 AND pi.item_id = $2
           WHERE p.status = 'active' AND p.starts_at <= $3 AND p.ends_at > $3
                 AND (p.max_uses IS NULL OR p.current_uses < p.max_uses)
                 AND (
                     p.scope = 'global'
                     OR (p.scope = 'category' AND p.category = $4)
                     OR (p.scope = 'specific' AND pi.promotion_id IS NOT NULL)
                 )
           ORDER BY p.discount_value DESC
           LIMIT 10"#,
    )
    .bind(&item_type)
    .bind(&item_id)
    .bind(now)
    .bind(category)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let list: Vec<Value> = rows
                .into_iter()
                .map(|(id, discount_type, discount_value, override_val, display_name, ends)| {
                    json!({
                        "id": id,
                        "discountType": discount_type,
                        "discountValue": override_val.unwrap_or(discount_value),
                        "displayName": display_name,
                        "endsAt": ends.and_utc().to_rfc3339(),
                    })
                })
                .collect();
            Json(json!({ "promotions": list })).into_response()
        }
        Err(e) => {
            tracing::error!("promotions_for_item: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// POST /api/promo-codes/redeem — validate and apply a promo code
#[derive(Deserialize)]
struct RedeemBody {
    code: String,
    #[serde(rename = "itemType")]
    item_type: String,
    #[serde(rename = "itemId")]
    item_id: String,
}

async fn redeem_code(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<RedeemBody>,
) -> Response {
    let now = Utc::now();
    let code_upper = body.code.trim().to_uppercase();

    // Look up the code + its promotion (must be active, not expired)
    let row = sqlx::query_as::<_, (Uuid, Uuid, Option<i32>, i32, String, f64, String, Option<i32>, Option<i32>)>(
        r#"SELECT pc.id, pc.promotion_id, pc.max_uses, pc.current_uses,
                  p.discount_type, p.discount_value::float8, p.scope,
                  p.max_uses, p.max_uses_per_user
           FROM promo_codes pc
           JOIN promotions p ON p.id = pc.promotion_id
           WHERE pc.code = $1
                 AND p.status = 'active'
                 AND p.starts_at <= $2 AND p.ends_at > $2
                 AND (pc.expires_at IS NULL OR pc.expires_at > $2)"#,
    )
    .bind(&code_upper)
    .bind(now)
    .fetch_optional(&state.db)
    .await;

    let (code_id, promo_id, code_max, code_current, discount_type, discount_value, scope, promo_max, per_user_max) =
        match row {
            Ok(Some(r)) => r,
            Ok(None) => {
                return (StatusCode::NOT_FOUND, Json(json!({ "error": "invalidCode" }))).into_response();
            }
            Err(e) => {
                tracing::error!("redeem_code lookup: {e}");
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
        };

    // Check code usage limit
    if let Some(max) = code_max {
        if code_current >= max {
            return (StatusCode::CONFLICT, Json(json!({ "error": "codeExhausted" }))).into_response();
        }
    }

    // Check promotion total usage
    if let Some(max) = promo_max {
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM promotion_usages WHERE promotion_id = $1")
            .bind(promo_id)
            .fetch_one(&state.db)
            .await
            .unwrap_or((0,));
        if count.0 >= max as i64 {
            return (StatusCode::CONFLICT, Json(json!({ "error": "promotionExhausted" }))).into_response();
        }
    }

    // Check per-user usage
    if let Some(max) = per_user_max {
        let count: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM promotion_usages WHERE promotion_id = $1 AND user_id = $2",
        )
        .bind(promo_id)
        .bind(&user.id)
        .fetch_one(&state.db)
        .await
        .unwrap_or((0,));
        if count.0 >= max as i64 {
            return (StatusCode::CONFLICT, Json(json!({ "error": "perUserLimitReached" }))).into_response();
        }
    }

    // Check scope matches the item
    let category = match body.item_type.as_str() {
        "sticker_pack" => "sticker",
        "theme" => "theme",
        "agent_listing" => "app",
        _ => "",
    };

    if scope == "specific" {
        let exists: Option<(i32,)> = sqlx::query_as(
            "SELECT 1 FROM promotion_items WHERE promotion_id = $1 AND item_type = $2 AND item_id = $3",
        )
        .bind(promo_id)
        .bind(&body.item_type)
        .bind(&body.item_id)
        .fetch_optional(&state.db)
        .await
        .unwrap_or(None);

        if exists.is_none() {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "itemNotEligible" }))).into_response();
        }
    } else if scope == "category" {
        let promo_cat: Option<(Option<String>,)> =
            sqlx::query_as("SELECT category FROM promotions WHERE id = $1")
                .bind(promo_id)
                .fetch_optional(&state.db)
                .await
                .unwrap_or(None);
        if let Some((Some(pc),)) = promo_cat {
            if pc != category {
                return (StatusCode::BAD_REQUEST, Json(json!({ "error": "itemNotEligible" }))).into_response();
            }
        }
    }

    // Get original price of the item
    let original_price: Option<f64> = match body.item_type.as_str() {
        "sticker_pack" => {
            sqlx::query_as::<_, (i32,)>("SELECT price FROM sticker_packs WHERE id::text = $1")
                .bind(&body.item_id)
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten()
                .map(|(p,)| p as f64)
        }
        "theme" => {
            sqlx::query_as::<_, (i32,)>("SELECT price FROM themes WHERE id::text = $1")
                .bind(&body.item_id)
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten()
                .map(|(p,)| p as f64)
        }
        "agent_listing" => {
            sqlx::query_as::<_, (i32,)>("SELECT price FROM agent_listings WHERE id::text = $1")
                .bind(&body.item_id)
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten()
                .map(|(p,)| p as f64)
        }
        _ => None,
    };

    let original_price = match original_price {
        Some(p) if p > 0.0 => p,
        Some(_) => {
            // Free items not eligible
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "freeItemNotEligible" }))).into_response();
        }
        None => {
            return (StatusCode::NOT_FOUND, Json(json!({ "error": "itemNotFound" }))).into_response();
        }
    };

    // Check override
    let override_val: Option<f64> = sqlx::query_as::<_, (Option<f64>,)>(
        "SELECT override_discount_value::float8 FROM promotion_items WHERE promotion_id = $1 AND item_type = $2 AND item_id = $3",
    )
    .bind(promo_id)
    .bind(&body.item_type)
    .bind(&body.item_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .and_then(|(v,)| v);

    let final_price = calc_discounted_price(&discount_type, discount_value, override_val, original_price);
    let discount_amount = original_price - final_price;

    // Record usage + increment counters in a transaction
    let mut tx = state.db.begin().await.unwrap();

    sqlx::query(
        r#"INSERT INTO promotion_usages (promotion_id, user_id, promo_code_id, item_type, item_id, original_price, discount_amount, final_price)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#,
    )
    .bind(promo_id)
    .bind(&user.id)
    .bind(code_id)
    .bind(&body.item_type)
    .bind(&body.item_id)
    .bind(original_price)
    .bind(discount_amount)
    .bind(final_price)
    .execute(&mut *tx)
    .await
    .unwrap();

    sqlx::query("UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = $1")
        .bind(code_id)
        .execute(&mut *tx)
        .await
        .unwrap();

    sqlx::query("UPDATE promotions SET current_uses = current_uses + 1 WHERE id = $1")
        .bind(promo_id)
        .execute(&mut *tx)
        .await
        .unwrap();

    tx.commit().await.unwrap();

    Json(json!({
        "promotionId": promo_id,
        "originalPrice": original_price,
        "discountAmount": discount_amount,
        "finalPrice": final_price,
        "discountType": discount_type,
    }))
    .into_response()
}

// ── Creator endpoints ────────────────────────────────────────────────────

#[derive(Deserialize)]
struct CreatorListQuery {
    status: Option<String>,
}

/// GET /api/creator/promotions
async fn creator_list(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<CreatorListQuery>,
) -> Response {
    let status_filter = q.status.unwrap_or_default();
    let rows = sqlx::query_as::<_, (Uuid, String, Option<String>, String, f64, String, Option<String>, NaiveDateTime, NaiveDateTime, i32, Option<i32>, String)>(
        r#"SELECT id, name, display_name, discount_type, discount_value::float8,
                  scope, category,
                  starts_at AT TIME ZONE 'UTC', ends_at AT TIME ZONE 'UTC',
                  current_uses, max_uses, status
           FROM promotions
           WHERE creator_id = $1
                 AND ($2 = '' OR status = $2)
           ORDER BY created_at DESC
           LIMIT 100"#,
    )
    .bind(&user.id)
    .bind(&status_filter)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let list: Vec<Value> = rows
                .into_iter()
                .map(|(id, name, display_name, dt, dv, scope, cat, starts, ends, uses, max_uses, status)| {
                    json!({
                        "id": id,
                        "name": name,
                        "displayName": display_name,
                        "discountType": dt,
                        "discountValue": dv,
                        "scope": scope,
                        "category": cat,
                        "startsAt": starts.and_utc().to_rfc3339(),
                        "endsAt": ends.and_utc().to_rfc3339(),
                        "currentUses": uses,
                        "maxUses": max_uses,
                        "status": status,
                    })
                })
                .collect();
            Json(json!({ "promotions": list })).into_response()
        }
        Err(e) => {
            tracing::error!("creator_list: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

#[derive(Deserialize)]
struct CreatePromotionBody {
    name: String,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    description: Option<String>,
    #[serde(rename = "discountType")]
    discount_type: String,
    #[serde(rename = "discountValue")]
    discount_value: f64,
    scope: String,
    category: Option<String>,
    #[serde(rename = "startsAt")]
    starts_at: String,
    #[serde(rename = "endsAt")]
    ends_at: String,
    #[serde(rename = "maxUses")]
    max_uses: Option<i32>,
    #[serde(rename = "maxUsesPerUser")]
    max_uses_per_user: Option<i32>,
    items: Option<Vec<PromotionItemBody>>,
}

#[derive(Deserialize)]
struct PromotionItemBody {
    #[serde(rename = "itemType")]
    item_type: String,
    #[serde(rename = "itemId")]
    item_id: String,
    #[serde(rename = "overrideDiscountValue")]
    override_discount_value: Option<f64>,
}

/// POST /api/creator/promotions
async fn creator_create(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreatePromotionBody>,
) -> Response {
    // Validate discount type
    if !["percentage", "fixed_amount", "fixed_price"].contains(&body.discount_type.as_str()) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "invalidDiscountType" }))).into_response();
    }

    // Business rule: creator max 50% discount
    if body.discount_type == "percentage" && body.discount_value > 50.0 {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "creatorMaxDiscount50Percent" }))).into_response();
    }

    // Parse dates
    let starts_at = match chrono::DateTime::parse_from_rfc3339(&body.starts_at) {
        Ok(dt) => dt.with_timezone(&Utc),
        Err(_) => {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "invalidStartsAt" }))).into_response();
        }
    };
    let ends_at = match chrono::DateTime::parse_from_rfc3339(&body.ends_at) {
        Ok(dt) => dt.with_timezone(&Utc),
        Err(_) => {
            return (StatusCode::BAD_REQUEST, Json(json!({ "error": "invalidEndsAt" }))).into_response();
        }
    };

    if ends_at <= starts_at {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "endsAtMustBeAfterStartsAt" }))).into_response();
    }

    // Business rule: 7-day cooldown — check if any of the specified items had a promotion ending within 7 days
    if let Some(ref items) = body.items {
        for item in items {
            let recent: Option<(Uuid,)> = sqlx::query_as(
                r#"SELECT p.id FROM promotions p
                   JOIN promotion_items pi ON pi.promotion_id = p.id
                   WHERE p.creator_id = $1
                         AND pi.item_type = $2 AND pi.item_id = $3
                         AND p.status IN ('active', 'expired')
                         AND p.ends_at > $4 - INTERVAL '7 days'
                   LIMIT 1"#,
            )
            .bind(&user.id)
            .bind(&item.item_type)
            .bind(&item.item_id)
            .bind(starts_at)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();

            if recent.is_some() {
                return (
                    StatusCode::CONFLICT,
                    Json(json!({ "error": "cooldownPeriod", "itemType": item.item_type, "itemId": item.item_id })),
                )
                    .into_response();
            }
        }
    }

    // Determine initial status: if starts_at <= now, activate immediately
    let now = Utc::now();
    let initial_status = if starts_at <= now && ends_at > now {
        "active"
    } else {
        "draft"
    };

    let mut tx = state.db.begin().await.unwrap();

    let row: (Uuid,) = sqlx::query_as(
        r#"INSERT INTO promotions (name, display_name, description, discount_type, discount_value,
                                    scope, category, starts_at, ends_at, max_uses, max_uses_per_user,
                                    creator_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING id"#,
    )
    .bind(&body.name)
    .bind(&body.display_name)
    .bind(&body.description)
    .bind(&body.discount_type)
    .bind(body.discount_value)
    .bind(&body.scope)
    .bind(&body.category)
    .bind(starts_at)
    .bind(ends_at)
    .bind(body.max_uses)
    .bind(body.max_uses_per_user.unwrap_or(1))
    .bind(&user.id)
    .bind(initial_status)
    .fetch_one(&mut *tx)
    .await
    .unwrap();

    let promo_id = row.0;

    // Insert items if scope = 'specific'
    if let Some(items) = body.items {
        for item in &items {
            sqlx::query(
                "INSERT INTO promotion_items (promotion_id, item_type, item_id, override_discount_value) VALUES ($1, $2, $3, $4)",
            )
            .bind(promo_id)
            .bind(&item.item_type)
            .bind(&item.item_id)
            .bind(item.override_discount_value)
            .execute(&mut *tx)
            .await
            .unwrap();
        }
    }

    tx.commit().await.unwrap();

    (
        StatusCode::CREATED,
        Json(json!({ "id": promo_id, "status": initial_status })),
    )
        .into_response()
}

/// PUT /api/creator/promotions/:id
async fn creator_update(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<CreatePromotionBody>,
) -> Response {
    // Verify ownership
    let owner: Option<(String,)> =
        sqlx::query_as("SELECT creator_id FROM promotions WHERE id = $1 AND creator_id = $2")
            .bind(id)
            .bind(&user.id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();

    if owner.is_none() {
        return (StatusCode::NOT_FOUND, Json(json!({ "error": "notFound" }))).into_response();
    }

    // Validate
    if !["percentage", "fixed_amount", "fixed_price"].contains(&body.discount_type.as_str()) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "invalidDiscountType" }))).into_response();
    }
    if body.discount_type == "percentage" && body.discount_value > 50.0 {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "creatorMaxDiscount50Percent" }))).into_response();
    }

    let starts_at = match chrono::DateTime::parse_from_rfc3339(&body.starts_at) {
        Ok(dt) => dt.with_timezone(&Utc),
        Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "invalidStartsAt" }))).into_response(),
    };
    let ends_at = match chrono::DateTime::parse_from_rfc3339(&body.ends_at) {
        Ok(dt) => dt.with_timezone(&Utc),
        Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "invalidEndsAt" }))).into_response(),
    };

    let mut tx = state.db.begin().await.unwrap();

    sqlx::query(
        r#"UPDATE promotions SET name=$2, display_name=$3, description=$4, discount_type=$5, discount_value=$6,
                                  scope=$7, category=$8, starts_at=$9, ends_at=$10, max_uses=$11, max_uses_per_user=$12,
                                  updated_at=NOW()
           WHERE id = $1"#,
    )
    .bind(id)
    .bind(&body.name)
    .bind(&body.display_name)
    .bind(&body.description)
    .bind(&body.discount_type)
    .bind(body.discount_value)
    .bind(&body.scope)
    .bind(&body.category)
    .bind(starts_at)
    .bind(ends_at)
    .bind(body.max_uses)
    .bind(body.max_uses_per_user.unwrap_or(1))
    .execute(&mut *tx)
    .await
    .unwrap();

    // Replace items
    sqlx::query("DELETE FROM promotion_items WHERE promotion_id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await
        .unwrap();

    if let Some(items) = body.items {
        for item in &items {
            sqlx::query(
                "INSERT INTO promotion_items (promotion_id, item_type, item_id, override_discount_value) VALUES ($1, $2, $3, $4)",
            )
            .bind(id)
            .bind(&item.item_type)
            .bind(&item.item_id)
            .bind(item.override_discount_value)
            .execute(&mut *tx)
            .await
            .unwrap();
        }
    }

    tx.commit().await.unwrap();

    Json(json!({ "ok": true })).into_response()
}

/// DELETE /api/creator/promotions/:id — cancel a promotion
async fn creator_delete(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let result = sqlx::query(
        "UPDATE promotions SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND creator_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Json(json!({ "ok": true })).into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({ "error": "notFound" }))).into_response(),
        Err(e) => {
            tracing::error!("creator_delete: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// POST /api/creator/promotions/:id/codes — generate promo codes for a promotion
#[derive(Deserialize)]
struct GenerateCodesBody {
    count: Option<i32>,
    #[serde(rename = "maxUses")]
    max_uses: Option<i32>,
    prefix: Option<String>,
}

async fn creator_generate_codes(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<GenerateCodesBody>,
) -> Response {
    // Verify ownership
    let owner: Option<(String,)> =
        sqlx::query_as("SELECT creator_id FROM promotions WHERE id = $1 AND creator_id = $2")
            .bind(id)
            .bind(&user.id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();

    if owner.is_none() {
        return (StatusCode::NOT_FOUND, Json(json!({ "error": "notFound" }))).into_response();
    }

    let count = body.count.unwrap_or(1).min(100); // max 100 codes at once
    let max_uses = body.max_uses.unwrap_or(1);
    let prefix = body
        .prefix
        .as_deref()
        .unwrap_or("")
        .to_uppercase();

    let mut codes = Vec::new();
    for _ in 0..count {
        let random_part: String = (0..8)
            .map(|_| {
                let idx = rand::random::<u8>() % 36;
                if idx < 10 {
                    (b'0' + idx) as char
                } else {
                    (b'A' + idx - 10) as char
                }
            })
            .collect();
        let code = if prefix.is_empty() {
            random_part
        } else {
            format!("{}{}", prefix, random_part)
        };

        let result = sqlx::query_as::<_, (Uuid, String)>(
            "INSERT INTO promo_codes (code, promotion_id, max_uses) VALUES ($1, $2, $3) RETURNING id, code",
        )
        .bind(&code)
        .bind(id)
        .bind(max_uses)
        .fetch_one(&state.db)
        .await;

        match result {
            Ok((code_id, code_str)) => codes.push(json!({ "id": code_id, "code": code_str })),
            Err(e) => {
                tracing::warn!("Code generation collision or error: {e}");
                // Skip collisions
            }
        }
    }

    Json(json!({ "codes": codes })).into_response()
}

// ── Admin endpoints ──────────────────────────────────────────────────────

#[derive(Deserialize)]
struct AdminListQuery {
    status: Option<String>,
    limit: Option<i32>,
    offset: Option<i32>,
}

/// GET /api/admin/promotions
async fn admin_list(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Query(q): Query<AdminListQuery>,
) -> Response {
    let status_filter = q.status.unwrap_or_default();
    let limit = q.limit.unwrap_or(50).min(200);
    let offset = q.offset.unwrap_or(0);

    let rows = sqlx::query_as::<_, (Uuid, String, Option<String>, String, f64, String, Option<String>, NaiveDateTime, NaiveDateTime, i32, Option<i32>, String, Option<String>)>(
        r#"SELECT id, name, display_name, discount_type, discount_value::float8,
                  scope, category,
                  starts_at AT TIME ZONE 'UTC', ends_at AT TIME ZONE 'UTC',
                  current_uses, max_uses, status, creator_id
           FROM promotions
           WHERE ($1 = '' OR status = $1)
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3"#,
    )
    .bind(&status_filter)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let list: Vec<Value> = rows
                .into_iter()
                .map(|(id, name, display_name, dt, dv, scope, cat, starts, ends, uses, max_uses, status, creator_id)| {
                    json!({
                        "id": id,
                        "name": name,
                        "displayName": display_name,
                        "discountType": dt,
                        "discountValue": dv,
                        "scope": scope,
                        "category": cat,
                        "startsAt": starts.and_utc().to_rfc3339(),
                        "endsAt": ends.and_utc().to_rfc3339(),
                        "currentUses": uses,
                        "maxUses": max_uses,
                        "status": status,
                        "creatorId": creator_id,
                    })
                })
                .collect();
            Json(json!({ "promotions": list })).into_response()
        }
        Err(e) => {
            tracing::error!("admin_list: {e}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// POST /api/admin/promotions — create official promotion (no creator_id, no 50% limit)
async fn admin_create(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Json(body): Json<CreatePromotionBody>,
) -> Response {
    if !["percentage", "fixed_amount", "fixed_price"].contains(&body.discount_type.as_str()) {
        return (StatusCode::BAD_REQUEST, Json(json!({ "error": "invalidDiscountType" }))).into_response();
    }

    let starts_at = match chrono::DateTime::parse_from_rfc3339(&body.starts_at) {
        Ok(dt) => dt.with_timezone(&Utc),
        Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "invalidStartsAt" }))).into_response(),
    };
    let ends_at = match chrono::DateTime::parse_from_rfc3339(&body.ends_at) {
        Ok(dt) => dt.with_timezone(&Utc),
        Err(_) => return (StatusCode::BAD_REQUEST, Json(json!({ "error": "invalidEndsAt" }))).into_response(),
    };

    let now = Utc::now();
    let initial_status = if starts_at <= now && ends_at > now {
        "active"
    } else {
        "draft"
    };

    let mut tx = state.db.begin().await.unwrap();

    let row: (Uuid,) = sqlx::query_as(
        r#"INSERT INTO promotions (name, display_name, description, discount_type, discount_value,
                                    scope, category, starts_at, ends_at, max_uses, max_uses_per_user,
                                    creator_id, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, $12)
           RETURNING id"#,
    )
    .bind(&body.name)
    .bind(&body.display_name)
    .bind(&body.description)
    .bind(&body.discount_type)
    .bind(body.discount_value)
    .bind(&body.scope)
    .bind(&body.category)
    .bind(starts_at)
    .bind(ends_at)
    .bind(body.max_uses)
    .bind(body.max_uses_per_user.unwrap_or(1))
    .bind(initial_status)
    .fetch_one(&mut *tx)
    .await
    .unwrap();

    let promo_id = row.0;

    if let Some(items) = body.items {
        for item in &items {
            sqlx::query(
                "INSERT INTO promotion_items (promotion_id, item_type, item_id, override_discount_value) VALUES ($1, $2, $3, $4)",
            )
            .bind(promo_id)
            .bind(&item.item_type)
            .bind(&item.item_id)
            .bind(item.override_discount_value)
            .execute(&mut *tx)
            .await
            .unwrap();
        }
    }

    tx.commit().await.unwrap();

    (
        StatusCode::CREATED,
        Json(json!({ "id": promo_id, "status": initial_status })),
    )
        .into_response()
}
