use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post},
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
        .route("/api/wallet/balance", get(get_balance))
        .route("/api/wallet/transactions", get(get_transactions))
        .route("/api/wallet/topup", post(topup))
        .route("/api/apps/{id}/purchase", post(purchase))
        .route("/api/purchases/{purchaseId}/refund", post(refund))
}

// ---------- GET /api/wallet/balance ----------

async fn get_balance(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let balance = sqlx::query_scalar::<_, i32>(
        "SELECT balance FROM coin_balances WHERE user_id = $1",
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None)
    .unwrap_or(0);

    (StatusCode::OK, Json(json!({ "balance": balance })))
}

// ---------- GET /api/wallet/transactions ----------

#[derive(Deserialize)]
struct TransactionsQuery {
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(sqlx::FromRow)]
struct TxRow {
    id: Uuid,
    user_id: String,
    #[sqlx(rename = "type")]
    tx_type: String,
    amount: i32,
    related_app_id: Option<Uuid>,
    description: Option<String>,
    created_at: NaiveDateTime,
}

async fn get_transactions(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<TransactionsQuery>,
) -> (StatusCode, Json<Value>) {
    let limit = q.limit.unwrap_or(20).min(100);
    let page = q.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;

    let total = match sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM coin_transactions WHERE user_id = $1",
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    {
        Ok(n) => n,
        Err(e) => {
            tracing::error!("Count transactions failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to fetch transactions" })),
            );
        }
    };

    let rows = match sqlx::query_as::<_, TxRow>(
        r#"SELECT id, user_id, type::text, amount, related_app_id, description, created_at
           FROM coin_transactions
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3"#,
    )
    .bind(&user.id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("Fetch transactions failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to fetch transactions" })),
            );
        }
    };

    let transactions: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "id": r.id,
                "userId": r.user_id,
                "type": r.tx_type,
                "amount": r.amount,
                "relatedAppId": r.related_app_id,
                "description": r.description,
                "createdAt": r.created_at.and_utc().to_rfc3339(),
            })
        })
        .collect();

    (
        StatusCode::OK,
        Json(json!({
            "transactions": transactions,
            "total": total,
            "page": page,
            "limit": limit,
        })),
    )
}

// ---------- POST /api/wallet/topup ----------

#[derive(Deserialize)]
struct TopupBody {
    amount: i32,
    #[serde(rename = "receiptId")]
    receipt_id: Option<String>,
}

async fn topup(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<TopupBody>,
) -> (StatusCode, Json<Value>) {
    if body.amount <= 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Amount must be positive" })),
        );
    }

    // Upsert balance
    let result = sqlx::query_scalar::<_, i32>(
        r#"INSERT INTO coin_balances (user_id, balance, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (user_id) DO UPDATE
           SET balance = coin_balances.balance + $2, updated_at = NOW()
           RETURNING balance"#,
    )
    .bind(&user.id)
    .bind(body.amount)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(new_balance) => {
            // Record transaction
            let _ = sqlx::query(
                r#"INSERT INTO coin_transactions (user_id, type, amount, receipt_id, description)
                   VALUES ($1, 'topup', $2, $3, 'Coin top-up')"#,
            )
            .bind(&user.id)
            .bind(body.amount)
            .bind(&body.receipt_id)
            .execute(&state.db)
            .await;

            (
                StatusCode::OK,
                Json(json!({ "balance": new_balance })),
            )
        }
        Err(e) => {
            tracing::error!("Topup failed: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Top-up failed" })),
            )
        }
    }
}

// ---------- POST /api/apps/{id}/purchase ----------

async fn purchase(
    State(state): State<AppState>,
    user: AuthUser,
    Path(listing_id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // Fetch listing price and creator (outside tx — read-only)
    let listing = sqlx::query_as::<_, (Uuid, i32, String)>(
        "SELECT id, price, creator_id FROM agent_listings WHERE id = $1 AND status = 'active'",
    )
    .bind(listing_id)
    .fetch_optional(&state.db)
    .await;

    let (lid, price, creator_id) = match listing {
        Ok(Some(l)) => l,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Listing not found or not active" })),
            );
        }
        Err(e) => {
            tracing::error!("Fetch listing failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Internal error" })),
            );
        }
    };

    if price == 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "This agent is free, no purchase needed" })),
        );
    }

    // 70/30 split: 70% to creator, 30% platform fee (integer math)
    let creator_share = price * 7 / 10;

    // === Begin transaction — all mutations atomic ===
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

    // Atomic deduction: only succeeds if balance >= price
    let new_balance = match sqlx::query_scalar::<_, i32>(
        r#"UPDATE coin_balances
           SET balance = balance - $2, updated_at = NOW()
           WHERE user_id = $1 AND balance >= $2
           RETURNING balance"#,
    )
    .bind(&user.id)
    .bind(price)
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

    // Record purchase transaction (buyer)
    let purchase_id = match sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO coin_transactions (user_id, type, amount, related_app_id, description)
           VALUES ($1, 'purchase', $2, $3, 'Purchased agent listing')
           RETURNING id"#,
    )
    .bind(&user.id)
    .bind(-price)
    .bind(lid)
    .fetch_one(&mut *tx)
    .await
    {
        Ok(id) => id,
        Err(e) => {
            tracing::error!("Record purchase tx failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Failed to record purchase" })),
            );
        }
    };

    // Credit creator balance
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
        tracing::error!("Credit creator failed: {}", e);
        // tx drops → auto rollback
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    // Record earning transaction (creator)
    if let Err(e) = sqlx::query(
        r#"INSERT INTO coin_transactions (user_id, type, amount, related_app_id, description)
           VALUES ($1, 'earning', $2, $3, 'Marketplace earning: agent sale')"#,
    )
    .bind(&creator_id)
    .bind(creator_share)
    .bind(lid)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Record earning tx failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    // Increment sales_count
    if let Err(e) = sqlx::query(
        "UPDATE agent_listings SET sales_count = sales_count + 1, updated_at = NOW() WHERE id = $1",
    )
    .bind(lid)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Increment sales_count failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    // === Commit transaction ===
    if let Err(e) = tx.commit().await {
        tracing::error!("Commit failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Transaction failed" })),
        );
    }

    (
        StatusCode::OK,
        Json(json!({
            "purchaseId": purchase_id,
            "balance": new_balance,
            "price": price,
            "creatorShare": creator_share,
        })),
    )
}

// ---------- POST /api/purchases/{purchaseId}/refund ----------

async fn refund(
    State(state): State<AppState>,
    user: AuthUser,
    Path(purchase_id): Path<Uuid>,
) -> (StatusCode, Json<Value>) {
    // === Begin transaction ===
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

    // SELECT FOR UPDATE locks the row to prevent concurrent refunds
    let purchase = sqlx::query_as::<_, (Uuid, String, i32, String, NaiveDateTime)>(
        r#"SELECT id, user_id, amount, type::text, created_at
           FROM coin_transactions WHERE id = $1 FOR UPDATE"#,
    )
    .bind(purchase_id)
    .fetch_optional(&mut *tx)
    .await;

    let (pid, buyer_id, amount, tx_type, created_at) = match purchase {
        Ok(Some(p)) => p,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({ "error": "Purchase not found" })),
            );
        }
        Err(e) => {
            tracing::error!("Fetch purchase failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Internal error" })),
            );
        }
    };

    // Must be the buyer
    if buyer_id != user.id {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "error": "Not your purchase" })),
        );
    }

    if tx_type != "purchase" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Not a purchase transaction" })),
        );
    }

    // Check if already refunded (inside tx, row locked)
    let already_refunded = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*) FROM coin_transactions
           WHERE user_id = $1 AND type = 'refund' AND description = $2"#,
    )
    .bind(&user.id)
    .bind(format!("Refund for purchase:{}", pid))
    .fetch_one(&mut *tx)
    .await
    .unwrap_or(0);

    if already_refunded > 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Already refunded" })),
        );
    }

    // 24h refund window
    let now = chrono::Utc::now().naive_utc();
    let elapsed = now - created_at;
    if elapsed.num_hours() > 24 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "Refund window (24h) has expired" })),
        );
    }

    // The amount in purchase tx is negative; refund gives back the absolute value
    let refund_amount = amount.abs();

    // Refund to buyer
    if let Err(e) = sqlx::query(
        r#"UPDATE coin_balances SET balance = balance + $2, updated_at = NOW()
           WHERE user_id = $1"#,
    )
    .bind(&user.id)
    .bind(refund_amount)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Refund balance update failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    // Record refund transaction
    if let Err(e) = sqlx::query(
        r#"INSERT INTO coin_transactions (user_id, type, amount, description)
           VALUES ($1, 'refund', $2, $3)"#,
    )
    .bind(&user.id)
    .bind(refund_amount)
    .bind(format!("Refund for purchase:{}", pid))
    .execute(&mut *tx)
    .await
    {
        tracing::error!("Record refund tx failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Database error" })),
        );
    }

    // === Commit transaction ===
    if let Err(e) = tx.commit().await {
        tracing::error!("Refund commit failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": "Refund failed" })),
        );
    }

    (
        StatusCode::OK,
        Json(json!({ "refunded": true, "amount": refund_amount })),
    )
}
