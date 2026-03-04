use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Json,
    routing::get,
    Router,
};
use chrono::{NaiveDate, NaiveDateTime};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/creator/agents", get(creator_agents))
        .route("/api/creator/dashboard", get(dashboard))
        .route("/api/creator/revenue", get(revenue))
        .route("/api/creator/ratings", get(ratings))
        .route("/api/creator/users", get(users))
        .route("/api/creator/downloads", get(downloads))
        .route("/api/creator/payout", axum::routing::post(payout))
        .route("/api/creator/community", get(creator_community))
        .route("/api/creator/spaces", get(creator_spaces))
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
    model: String,
    input_char_limit: i32,
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
struct EarningRow {
    id: Uuid,
    amount: i32,
    description: Option<String>,
    created_at: NaiveDateTime,
}

#[derive(sqlx::FromRow)]
struct DailyRevenueRow {
    date: NaiveDate,
    sticker: i64,
    agent: i64,
    theme: i64,
    community: i64,
    spaces: i64,
}

#[derive(sqlx::FromRow)]
struct RevenueTotalRow {
    sticker: i64,
    agent: i64,
    theme: i64,
    community: i64,
    spaces: i64,
}

#[derive(sqlx::FromRow)]
struct DailyCountRow {
    date: NaiveDate,
    count: i64,
}

#[derive(sqlx::FromRow)]
struct AgentAggRow {
    agent_downloads: i64,
    avg_rating: Option<f64>,
    total_reviews: i64,
    agent_count: i64,
}

#[derive(sqlx::FromRow)]
struct StickerAggRow {
    sticker_downloads: i64,
    sticker_count: i64,
}

#[derive(sqlx::FromRow)]
struct RatingListingRow {
    avg_rating: Option<f64>,
    review_count: i32,
}

#[derive(Deserialize)]
struct PeriodQuery {
    #[serde(default = "default_days")]
    days: i32,
}

fn default_days() -> i32 {
    30
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
                  system_prompt, model, input_char_limit,
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
                        "model": r.model,
                        "inputCharLimit": r.input_char_limit,
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
// GET /api/creator/dashboard — Expanded aggregate stats
// ---------------------------------------------------------------------------

async fn dashboard(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    // Total revenue from all earning transactions
    let total_revenue = sqlx::query_scalar::<_, i64>(
        r#"SELECT COALESCE(SUM(amount), 0)
           FROM coin_transactions
           WHERE user_id = $1 AND type = 'earning'"#,
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    // Agent listing stats
    let agent_agg = sqlx::query_as::<_, AgentAggRow>(
        r#"SELECT
               COALESCE(SUM(sales_count), 0)::int8 AS agent_downloads,
               SUM(avg_rating::float8 * review_count) / NULLIF(SUM(review_count), 0) AS avg_rating,
               COALESCE(SUM(review_count), 0)::int8 AS total_reviews,
               COUNT(*)::int8 AS agent_count
           FROM agent_listings
           WHERE creator_id = $1"#,
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    let agent_agg = match agent_agg {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("Dashboard: agent aggregate failed: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })));
        }
    };

    let avg_rating = agent_agg.avg_rating.map(|r| (r * 10.0).round() / 10.0).unwrap_or(0.0);

    // Sticker download + pack count
    let sticker_agg = sqlx::query_as::<_, StickerAggRow>(
        r#"SELECT COALESCE(SUM(downloads), 0)::int8 AS sticker_downloads,
                  COUNT(*)::int8 AS sticker_count
           FROM sticker_packs WHERE creator_id = $1"#,
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    let sticker_agg = match sticker_agg {
        Ok(r) => r,
        Err(_) => StickerAggRow { sticker_downloads: 0, sticker_count: 0 },
    };

    let total_downloads = sticker_agg.sticker_downloads + agent_agg.agent_downloads;

    // Unique users who purchased creator's products (from earning transactions)
    let total_users = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(DISTINCT ct2.user_id)
           FROM coin_transactions ct1
           JOIN coin_transactions ct2 ON ct2.created_at BETWEEN ct1.created_at - INTERVAL '1 second'
                                         AND ct1.created_at + INTERVAL '1 second'
               AND ct2.type = 'purchase' AND ct2.amount < 0
           WHERE ct1.user_id = $1 AND ct1.type = 'earning'"#,
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    // Recent earnings (all sources)
    let earnings = sqlx::query_as::<_, EarningRow>(
        r#"SELECT id, amount, description, created_at
           FROM coin_transactions
           WHERE user_id = $1 AND type = 'earning'
           ORDER BY created_at DESC
           LIMIT 10"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let earnings_json: Vec<Value> = earnings
        .iter()
        .map(|e| {
            let source = categorize_earning(e.description.as_deref().unwrap_or(""));
            json!({
                "id": e.id,
                "amount": e.amount,
                "description": e.description,
                "source": source,
                "createdAt": e.created_at.and_utc().to_rfc3339(),
            })
        })
        .collect();

    let community_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM communities WHERE creator_id = $1",
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let spaces_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM playgrounds WHERE owner_id = $1",
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    (
        StatusCode::OK,
        Json(json!({
            "totalRevenue": total_revenue,
            "totalDownloads": total_downloads,
            "totalUsers": total_users,
            "avgRating": avg_rating,
            "totalReviews": agent_agg.total_reviews,
            "creations": {
                "stickerPacks": sticker_agg.sticker_count,
                "agents": agent_agg.agent_count,
                "themes": 0,
                "communities": community_count,
                "spaces": spaces_count,
            },
            "recentEarnings": earnings_json,
        })),
    )
}

// ---------------------------------------------------------------------------
// GET /api/creator/revenue — Revenue breakdown by source with daily data
// ---------------------------------------------------------------------------

async fn revenue(
    State(state): State<AppState>,
    user: AuthUser,
    Query(params): Query<PeriodQuery>,
) -> (StatusCode, Json<Value>) {
    let days = params.days.clamp(1, 365);

    // Daily revenue by source
    let daily = sqlx::query_as::<_, DailyRevenueRow>(
        r#"SELECT
               DATE(created_at) AS date,
               COALESCE(SUM(amount) FILTER (WHERE description LIKE 'Sticker sale:%'), 0)::int8 AS sticker,
               COALESCE(SUM(amount) FILTER (WHERE description LIKE 'Agent Hub earning%'), 0)::int8 AS agent,
               COALESCE(SUM(amount) FILTER (WHERE description LIKE 'Theme sale:%'), 0)::int8 AS theme,
               COALESCE(SUM(amount) FILTER (WHERE description LIKE 'Community%'), 0)::int8 AS community,
               COALESCE(SUM(amount) FILTER (WHERE description NOT LIKE 'Sticker sale:%'
                   AND description NOT LIKE 'Agent Hub earning%'
                   AND description NOT LIKE 'Theme sale:%'
                   AND description NOT LIKE 'Community%'), 0)::int8 AS spaces
           FROM coin_transactions
           WHERE user_id = $1 AND type = 'earning'
             AND created_at >= NOW() - make_interval(days => $2)
           GROUP BY DATE(created_at)
           ORDER BY date"#,
    )
    .bind(&user.id)
    .bind(days)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Source totals
    let totals = sqlx::query_as::<_, RevenueTotalRow>(
        r#"SELECT
               COALESCE(SUM(amount) FILTER (WHERE description LIKE 'Sticker sale:%'), 0)::int8 AS sticker,
               COALESCE(SUM(amount) FILTER (WHERE description LIKE 'Agent Hub earning%'), 0)::int8 AS agent,
               COALESCE(SUM(amount) FILTER (WHERE description LIKE 'Theme sale:%'), 0)::int8 AS theme,
               COALESCE(SUM(amount) FILTER (WHERE description LIKE 'Community%'), 0)::int8 AS community,
               COALESCE(SUM(amount) FILTER (WHERE description NOT LIKE 'Sticker sale:%'
                   AND description NOT LIKE 'Agent Hub earning%'
                   AND description NOT LIKE 'Theme sale:%'
                   AND description NOT LIKE 'Community%'), 0)::int8 AS spaces
           FROM coin_transactions
           WHERE user_id = $1 AND type = 'earning'
             AND created_at >= NOW() - make_interval(days => $2)"#,
    )
    .bind(&user.id)
    .bind(days)
    .fetch_one(&state.db)
    .await;

    let totals = match totals {
        Ok(t) => t,
        Err(e) => {
            tracing::error!("Revenue: totals query failed: {}", e);
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": "Database error" })));
        }
    };

    let total = totals.sticker + totals.agent + totals.theme + totals.community + totals.spaces;

    // Recent earning transactions
    let recent = sqlx::query_as::<_, EarningRow>(
        r#"SELECT id, amount, description, created_at
           FROM coin_transactions
           WHERE user_id = $1 AND type = 'earning'
           ORDER BY created_at DESC
           LIMIT 20"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let daily_json: Vec<Value> = daily
        .iter()
        .map(|d| {
            json!({
                "date": d.date.format("%Y-%m-%d").to_string(),
                "sticker": d.sticker,
                "agent": d.agent,
                "theme": d.theme,
                "community": d.community,
                "spaces": d.spaces,
            })
        })
        .collect();

    let transactions_json: Vec<Value> = recent
        .iter()
        .map(|e| {
            let source = categorize_earning(e.description.as_deref().unwrap_or(""));
            json!({
                "id": e.id,
                "amount": e.amount,
                "description": e.description,
                "source": source,
                "date": e.created_at.and_utc().to_rfc3339(),
            })
        })
        .collect();

    (
        StatusCode::OK,
        Json(json!({
            "total": total,
            "sources": {
                "sticker": totals.sticker,
                "agent": totals.agent,
                "theme": totals.theme,
                "community": totals.community,
                "spaces": totals.spaces,
            },
            "dailyData": daily_json,
            "transactions": transactions_json,
        })),
    )
}

// ---------------------------------------------------------------------------
// GET /api/creator/ratings — Aggregated rating stats
// ---------------------------------------------------------------------------

async fn ratings(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    // Aggregate from agent_listings
    let rows = sqlx::query_as::<_, RatingListingRow>(
        r#"SELECT avg_rating::float8 AS avg_rating, review_count
           FROM agent_listings
           WHERE creator_id = $1 AND review_count > 0"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let total_reviews: i32 = rows.iter().map(|r| r.review_count).sum();
    let weighted_sum: f64 = rows.iter().map(|r| r.avg_rating.unwrap_or(0.0) * r.review_count as f64).sum();
    let avg_rating = if total_reviews > 0 {
        (weighted_sum / total_reviews as f64 * 10.0).round() / 10.0
    } else {
        0.0
    };

    // Approximate distribution from per-listing averages
    // Since we don't have individual reviews, we estimate based on the weighted average
    let distribution = if total_reviews > 0 {
        // Use a simple model: concentrate reviews around the average
        let avg = avg_rating;
        let make_pct = |star: f64| -> i64 {
            let dist = (star - avg).abs();
            let weight = (-dist * 1.5).exp();
            (weight * 100.0) as i64
        };
        let raw = [make_pct(5.0), make_pct(4.0), make_pct(3.0), make_pct(2.0), make_pct(1.0)];
        let sum: i64 = raw.iter().sum();
        if sum > 0 {
            (1..=5)
                .rev()
                .zip(raw.iter())
                .map(|(stars, &raw_pct)| {
                    let pct = (raw_pct * 100 / sum) as i32;
                    let count = (total_reviews as i64 * raw_pct / sum) as i32;
                    json!({ "stars": stars, "count": count, "pct": pct })
                })
                .collect::<Vec<_>>()
        } else {
            vec![]
        }
    } else {
        vec![]
    };

    (
        StatusCode::OK,
        Json(json!({
            "avgRating": avg_rating,
            "totalReviews": total_reviews,
            "distribution": distribution,
            "dailyData": [],
            "recentReviews": [],
        })),
    )
}

// ---------------------------------------------------------------------------
// GET /api/creator/users — User stats
// ---------------------------------------------------------------------------

async fn users(
    State(state): State<AppState>,
    user: AuthUser,
    Query(params): Query<PeriodQuery>,
) -> (StatusCode, Json<Value>) {
    let days = params.days.clamp(1, 365);

    // Total unique users from purchase transactions that correspond to creator earnings
    let total_users = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(DISTINCT ct2.user_id)
           FROM coin_transactions ct1
           JOIN coin_transactions ct2 ON ct2.created_at BETWEEN ct1.created_at - INTERVAL '1 second'
                                         AND ct1.created_at + INTERVAL '1 second'
               AND ct2.type = 'purchase' AND ct2.amount < 0
           WHERE ct1.user_id = $1 AND ct1.type = 'earning'"#,
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    // Daily new users (first-time purchasers per day)
    let daily_new = sqlx::query_as::<_, DailyCountRow>(
        r#"WITH buyer_dates AS (
               SELECT DISTINCT ct2.user_id, DATE(ct2.created_at) AS buy_date
               FROM coin_transactions ct1
               JOIN coin_transactions ct2 ON ct2.created_at BETWEEN ct1.created_at - INTERVAL '1 second'
                                             AND ct1.created_at + INTERVAL '1 second'
                   AND ct2.type = 'purchase' AND ct2.amount < 0
               WHERE ct1.user_id = $1 AND ct1.type = 'earning'
                 AND ct1.created_at >= NOW() - make_interval(days => $2)
           ),
           first_dates AS (
               SELECT user_id, MIN(buy_date) AS first_date
               FROM buyer_dates GROUP BY user_id
           )
           SELECT first_date AS date, COUNT(*)::int8 AS count
           FROM first_dates
           WHERE first_date >= NOW()::date - make_interval(days => $2)
           GROUP BY first_date
           ORDER BY first_date"#,
    )
    .bind(&user.id)
    .bind(days)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Daily returning users (repeat purchasers per day)
    let daily_returning = sqlx::query_as::<_, DailyCountRow>(
        r#"WITH buyer_dates AS (
               SELECT DISTINCT ct2.user_id, DATE(ct2.created_at) AS buy_date
               FROM coin_transactions ct1
               JOIN coin_transactions ct2 ON ct2.created_at BETWEEN ct1.created_at - INTERVAL '1 second'
                                             AND ct1.created_at + INTERVAL '1 second'
                   AND ct2.type = 'purchase' AND ct2.amount < 0
               WHERE ct1.user_id = $1 AND ct1.type = 'earning'
                 AND ct1.created_at >= NOW() - make_interval(days => $2)
           ),
           first_dates AS (
               SELECT user_id, MIN(buy_date) AS first_date
               FROM buyer_dates GROUP BY user_id
           )
           SELECT bd.buy_date AS date, COUNT(DISTINCT bd.user_id)::int8 AS count
           FROM buyer_dates bd
           JOIN first_dates fd ON bd.user_id = fd.user_id
           WHERE bd.buy_date > fd.first_date
             AND bd.buy_date >= NOW()::date - make_interval(days => $2)
           GROUP BY bd.buy_date
           ORDER BY bd.buy_date"#,
    )
    .bind(&user.id)
    .bind(days)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Merge daily data
    let new_map: std::collections::HashMap<NaiveDate, i64> =
        daily_new.iter().map(|r| (r.date, r.count)).collect();
    let ret_map: std::collections::HashMap<NaiveDate, i64> =
        daily_returning.iter().map(|r| (r.date, r.count)).collect();

    let mut all_dates: Vec<NaiveDate> = new_map.keys().chain(ret_map.keys()).copied().collect();
    all_dates.sort();
    all_dates.dedup();

    let daily_json: Vec<Value> = all_dates
        .iter()
        .map(|d| {
            json!({
                "date": d.format("%Y-%m-%d").to_string(),
                "newUsers": new_map.get(d).unwrap_or(&0),
                "returning": ret_map.get(d).unwrap_or(&0),
            })
        })
        .collect();

    let new_total: i64 = daily_new.iter().map(|r| r.count).sum();
    let returning_total: i64 = daily_returning.iter().map(|r| r.count).sum();

    (
        StatusCode::OK,
        Json(json!({
            "totalUsers": total_users,
            "newUsers": new_total,
            "returning": returning_total,
            "dailyData": daily_json,
        })),
    )
}

// ---------------------------------------------------------------------------
// GET /api/creator/downloads — Download/purchase stats by product type
// ---------------------------------------------------------------------------

async fn downloads(
    State(state): State<AppState>,
    user: AuthUser,
    Query(params): Query<PeriodQuery>,
) -> (StatusCode, Json<Value>) {
    let days = params.days.clamp(1, 365);

    // Totals from sticker_packs and agent_listings
    let sticker_total = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(downloads), 0)::int8 FROM sticker_packs WHERE creator_id = $1",
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let agent_total = sqlx::query_scalar::<_, i64>(
        "SELECT COALESCE(SUM(sales_count), 0)::int8 FROM agent_listings WHERE creator_id = $1",
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    // Daily breakdown from earning transactions
    let daily = sqlx::query_as::<_, DailyRevenueRow>(
        r#"SELECT
               DATE(created_at) AS date,
               COUNT(*) FILTER (WHERE description LIKE 'Sticker sale:%')::int8 AS sticker,
               COUNT(*) FILTER (WHERE description LIKE 'Agent Hub earning%')::int8 AS agent,
               COUNT(*) FILTER (WHERE description LIKE 'Theme sale:%')::int8 AS theme,
               0::int8 AS community,
               0::int8 AS spaces
           FROM coin_transactions
           WHERE user_id = $1 AND type = 'earning'
             AND created_at >= NOW() - make_interval(days => $2)
           GROUP BY DATE(created_at)
           ORDER BY date"#,
    )
    .bind(&user.id)
    .bind(days)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let daily_json: Vec<Value> = daily
        .iter()
        .map(|d| {
            json!({
                "date": d.date.format("%Y-%m-%d").to_string(),
                "sticker": d.sticker,
                "agent": d.agent,
                "theme": d.theme,
            })
        })
        .collect();

    (
        StatusCode::OK,
        Json(json!({
            "sources": [
                { "key": "sticker", "label": "Sticker Packs", "total": sticker_total },
                { "key": "agent", "label": "Agents", "total": agent_total },
                { "key": "theme", "label": "Themes", "total": 0 },
            ],
            "totalDownloads": sticker_total + agent_total,
            "dailyData": daily_json,
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

// ---------------------------------------------------------------------------
// GET /api/creator/community — Communities created by the user
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct CreatorCommunityRow {
    id: Uuid,
    name: String,
    member_count: i64,
    monthly_revenue: i64,
    status: String,
}

async fn creator_community(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, CreatorCommunityRow>(
        r#"SELECT c.id, c.name,
                  (SELECT COUNT(*) FROM community_members cm WHERE cm.community_id = c.id) AS member_count,
                  COALESCE((SELECT SUM(ct.amount) FROM coin_transactions ct
                            WHERE ct.user_id = $1 AND ct.type = 'earning'
                            AND ct.description LIKE 'Community%'
                            AND ct.created_at >= NOW() - INTERVAL '30 days'), 0)::int8 AS monthly_revenue,
                  c.status::text AS status
           FROM communities c
           WHERE c.creator_id = $1
           ORDER BY c.created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let communities: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "name": r.name,
                        "memberCount": r.member_count,
                        "monthlyRevenue": r.monthly_revenue,
                        "status": r.status,
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "communities": communities })))
        }
        Err(e) => {
            tracing::error!("Creator community fetch failed: {}", e);
            (StatusCode::OK, Json(json!({ "communities": [] })))
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/creator/spaces — Spaces (playgrounds) created by the user
// ---------------------------------------------------------------------------

#[derive(sqlx::FromRow)]
struct CreatorSpaceRow {
    id: Uuid,
    name: String,
    session_count: i64,
    total_revenue: i64,
    status: String,
}

async fn creator_spaces(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, CreatorSpaceRow>(
        r#"SELECT p.id, p.name,
                  (SELECT COUNT(*) FROM playground_sessions ps WHERE ps.playground_id = p.id) AS session_count,
                  COALESCE((SELECT SUM(ct.amount) FROM coin_transactions ct
                            WHERE ct.user_id = $1 AND ct.type = 'earning'
                            AND ct.description NOT LIKE 'Sticker sale:%'
                            AND ct.description NOT LIKE 'Agent Hub earning%'
                            AND ct.description NOT LIKE 'Theme sale:%'
                            AND ct.description NOT LIKE 'Community%'
                            AND ct.created_at >= NOW() - INTERVAL '30 days'), 0)::int8 AS total_revenue,
                  CASE WHEN p.is_public THEN 'active' ELSE 'draft' END AS status
           FROM playgrounds p
           WHERE p.owner_id = $1
           ORDER BY p.created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let spaces: Vec<Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.id,
                        "name": r.name,
                        "sessionCount": r.session_count,
                        "totalRevenue": r.total_revenue,
                        "status": r.status,
                    })
                })
                .collect();
            (StatusCode::OK, Json(json!({ "spaces": spaces })))
        }
        Err(e) => {
            tracing::error!("Creator spaces fetch failed: {}", e);
            (StatusCode::OK, Json(json!({ "spaces": [] })))
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn categorize_earning(description: &str) -> &'static str {
    if description.starts_with("Sticker sale:") {
        "Sticker Shop"
    } else if description.starts_with("Agent Hub earning") {
        "Agent Hub"
    } else if description.starts_with("Theme sale:") {
        "Theme"
    } else if description.contains("Community") {
        "Community"
    } else {
        "Spaces"
    }
}
