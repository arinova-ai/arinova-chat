use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::get,
    Router,
};
use chrono::NaiveDateTime;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/creator/agents", get(creator_agents))
        .route("/api/creator/dashboard", get(dashboard))
        .route("/api/creator/payout", axum::routing::post(payout))
}

// ---------------------------------------------------------------------------
// FromRow structs
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct CreatorListingRow {
    id: Uuid,
    agent_name: String,
    description: String,
    category: String,
    avatar_url: Option<String>,
    system_prompt: String,
    model_provider: String,
    model_id: String,
    price_per_message: i32,
    free_trial_messages: i32,
    status: String,
    sales_count: i32,
    avg_rating: Option<f64>,
    review_count: i32,
    total_messages: i32,
    total_revenue: i32,
    welcome_message: Option<String>,
    created_at: NaiveDateTime,
    updated_at: NaiveDateTime,
}

#[derive(sqlx::FromRow)]
struct DashboardAggRow {
    total_revenue: i64,
    total_messages: i64,
    total_conversations: i64,
    active_listings: i64,
    weighted_rating_sum: Option<f64>,
    total_weighted_reviews: i64,
    total_reviews: i64,
}

#[derive(sqlx::FromRow)]
struct EarningRow {
    id: Uuid,
    amount: i32,
    description: Option<String>,
    created_at: NaiveDateTime,
}

// ---------------------------------------------------------------------------
// GET /api/creator/agents — All listings owned by the creator
// ---------------------------------------------------------------------------

async fn creator_agents(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, CreatorListingRow>(
        r#"SELECT id, agent_name, description, category, avatar_url,
                  system_prompt, model_provider, model_id,
                  price_per_message, free_trial_messages,
                  status::text AS status, sales_count,
                  avg_rating::float8 AS avg_rating, review_count,
                  total_messages, total_revenue, welcome_message,
                  created_at, updated_at
           FROM agent_listings
           WHERE creator_id = $1
           ORDER BY created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let listings: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "agentName": r.agent_name,
                        "description": r.description,
                        "category": r.category,
                        "avatarUrl": r.avatar_url,
                        "systemPrompt": r.system_prompt,
                        "modelProvider": r.model_provider,
                        "modelId": r.model_id,
                        "pricePerMessage": r.price_per_message,
                        "freeTrialMessages": r.free_trial_messages,
                        "status": r.status,
                        "salesCount": r.sales_count,
                        "avgRating": r.avg_rating,
                        "reviewCount": r.review_count,
                        "totalMessages": r.total_messages,
                        "totalRevenue": r.total_revenue,
                        "welcomeMessage": r.welcome_message,
                        "createdAt": r.created_at.and_utc().to_rfc3339(),
                        "updatedAt": r.updated_at.and_utc().to_rfc3339(),
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "listings": listings })))
        }
        Err(e) => {
            tracing::error!("Creator agents fetch failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/creator/dashboard — Aggregate stats across all creator listings
// ---------------------------------------------------------------------------

async fn dashboard(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    // Aggregate stats
    let agg = sqlx::query_as::<_, DashboardAggRow>(
        r#"SELECT
               COALESCE(SUM(total_revenue), 0)::int8 AS total_revenue,
               COALESCE(SUM(total_messages), 0)::int8 AS total_messages,
               COALESCE(SUM(sales_count), 0)::int8 AS total_conversations,
               COUNT(*) FILTER (WHERE status = 'active')::int8 AS active_listings,
               SUM(avg_rating::float8 * review_count) AS weighted_rating_sum,
               COALESCE(SUM(review_count), 0)::int8 AS total_weighted_reviews,
               COALESCE(SUM(review_count), 0)::int8 AS total_reviews
           FROM agent_listings
           WHERE creator_id = $1"#,
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    let agg = match agg {
        Ok(a) => a,
        Err(e) => {
            tracing::error!("Creator dashboard aggregate failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Weighted average rating rounded to 1 decimal
    let avg_rating = if agg.total_weighted_reviews > 0 {
        let raw = agg.weighted_rating_sum.unwrap_or(0.0) / agg.total_weighted_reviews as f64;
        (raw * 10.0).round() / 10.0
    } else {
        0.0
    };

    // Last 10 earning transactions
    let earnings = sqlx::query_as::<_, EarningRow>(
        r#"SELECT id, amount, description, created_at
           FROM coin_transactions
           WHERE user_id = $1 AND type = 'earning'
             AND description LIKE 'Marketplace earning%'
           ORDER BY created_at DESC
           LIMIT 10"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Creator dashboard: fetch earnings failed: {}", e);
    })
    .unwrap_or_default();

    let earnings_json: Vec<Value> = earnings
        .iter()
        .map(|e| {
            json!({
                "id": e.id,
                "amount": e.amount,
                "description": e.description,
                "createdAt": e.created_at.and_utc().to_rfc3339(),
            })
        })
        .collect();

    (
        StatusCode::OK,
        Json(json!({
            "totalRevenue": agg.total_revenue,
            "totalMessages": agg.total_messages,
            "totalConversations": agg.total_conversations,
            "activeListings": agg.active_listings,
            "avgRating": avg_rating,
            "totalReviews": agg.total_reviews,
            "recentEarnings": earnings_json,
        })),
    )
}

// ---------------------------------------------------------------------------
// POST /api/creator/payout — Request a payout
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct PayoutBody {
    amount: i32,
}

async fn payout(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<PayoutBody>,
) -> (StatusCode, Json<Value>) {
    // Validate amount
    if body.amount < 100 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Minimum payout is 100 credits" })),
        );
    }

    // Verify creator has at least 1 listing
    let listing_count = match sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM agent_listings WHERE creator_id = $1",
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Payout: check listing count failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    if listing_count == 0 {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "You must have at least one listing to request a payout" })),
        );
    }

    // Atomic transaction: deduct balance + record transaction
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("Payout: begin transaction failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    // Deduct from coin_balances (only if sufficient)
    let rows_affected = sqlx::query(
        r#"UPDATE coin_balances
           SET balance = balance - $2, updated_at = NOW()
           WHERE user_id = $1 AND balance >= $2"#,
    )
    .bind(&user.id)
    .bind(body.amount)
    .execute(&mut *tx)
    .await;

    match rows_affected {
        Ok(r) if r.rows_affected() == 0 => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Insufficient balance" })),
            );
        }
        Err(e) => {
            tracing::error!("Payout: deduct balance failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
        _ => {}
    }

    // Record payout transaction
    let description = format!("Payout request: {} credits", body.amount);
    if let Err(e) = sqlx::query(
        r#"INSERT INTO coin_transactions (user_id, type, amount, description)
           VALUES ($1, 'payout', $2, $3)"#,
    )
    .bind(&user.id)
    .bind(-body.amount)
    .bind(&description)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Payout: insert transaction failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Failed to record payout" })),
        );
    }

    // Commit
    if let Err(e) = tx.commit().await {
        tracing::error!("Payout: commit failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    // Fetch new balance
    let new_balance = match sqlx::query_scalar::<_, i32>(
        "SELECT balance FROM coin_balances WHERE user_id = $1",
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await
    {
        Ok(b) => b.unwrap_or(0),
        Err(e) => {
            tracing::error!("Payout: fetch new balance failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Database error" })),
            );
        }
    };

    (
        StatusCode::OK,
        Json(json!({ "success": true, "newBalance": new_balance })),
    )
}
