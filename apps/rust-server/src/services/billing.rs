//! Billing engine for marketplace per-message pricing.
//!
//! Provides:
//! - `check_billing()` — determine if user can send a message (free trial or paid)
//! - `deduct_coins()` — atomic coin deduction with 70/30 creator split
//! - `record_message()` — increment counters after a message is processed

use sqlx::PgPool;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct BillingResult {
    /// Whether the user is allowed to send the message.
    pub allowed: bool,
    /// Cost in coins for this message (0 if free trial).
    pub cost: i32,
    /// Whether this message is within the free trial quota.
    pub is_free_trial: bool,
    /// User-safe reason if `allowed == false`.
    pub reason: Option<String>,
}

// ---------------------------------------------------------------------------
// check_billing
// ---------------------------------------------------------------------------

/// Check whether the user can send a message to the given marketplace listing.
///
/// Logic:
/// 1. Fetch `price_per_message` and `free_trial_messages` from `agent_listings`.
/// 2. Fetch `message_count` from `marketplace_conversations`.
/// 3. If `price_per_message == 0` → free listing, always allowed.
/// 4. If `message_count < free_trial_messages` → free trial, allowed at cost 0.
/// 5. Otherwise check `coin_balances.balance >= price_per_message`.
///
/// `conversation_id` is `None` for new users who haven't started a conversation yet.
/// In that case message_count = 0 (correct free trial start).
/// When `Some`, the conversation must match `user_id` + `listing_id` or it's rejected.
pub async fn check_billing(
    db: &PgPool,
    user_id: &str,
    listing_id: Uuid,
    conversation_id: Option<Uuid>,
) -> Result<BillingResult, String> {
    // 1. Fetch listing pricing
    let listing = sqlx::query_as::<_, (i32, i32)>(
        "SELECT price_per_message, free_trial_messages FROM agent_listings WHERE id = $1",
    )
    .bind(listing_id)
    .fetch_optional(db)
    .await
    .map_err(|e| {
        tracing::error!("check_billing: fetch listing failed: {}", e);
        "Database error".to_string()
    })?;

    let (price_per_message, free_trial_messages) = match listing {
        Some(l) => l,
        None => {
            return Ok(BillingResult {
                allowed: false,
                cost: 0,
                is_free_trial: false,
                reason: Some("Listing not found".into()),
            });
        }
    };

    // Free listing — no billing needed
    if price_per_message == 0 {
        return Ok(BillingResult {
            allowed: true,
            cost: 0,
            is_free_trial: false,
            reason: None,
        });
    }

    // 2. Fetch conversation message count
    let message_count = match conversation_id {
        Some(cid) => {
            // Existing conversation — must match user_id AND listing_id
            let row = sqlx::query_scalar::<_, i32>(
                "SELECT message_count FROM marketplace_conversations WHERE id = $1 AND user_id = $2 AND listing_id = $3",
            )
            .bind(cid)
            .bind(user_id)
            .bind(listing_id)
            .fetch_optional(db)
            .await
            .map_err(|e| {
                tracing::error!("check_billing: fetch message_count failed: {}", e);
                "Database error".to_string()
            })?;

            match row {
                Some(count) => count,
                None => {
                    // conversation_id provided but doesn't match user+listing → reject
                    return Ok(BillingResult {
                        allowed: false,
                        cost: 0,
                        is_free_trial: false,
                        reason: Some("Conversation not found".into()),
                    });
                }
            }
        }
        None => {
            // New user, no conversation yet → message_count = 0 (free trial start)
            0
        }
    };

    // 3. Free trial check
    if message_count < free_trial_messages {
        return Ok(BillingResult {
            allowed: true,
            cost: 0,
            is_free_trial: true,
            reason: None,
        });
    }

    // 4. Check balance
    let balance = sqlx::query_scalar::<_, i32>(
        "SELECT balance FROM coin_balances WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|e| {
        tracing::error!("check_billing: fetch balance failed: {}", e);
        "Database error".to_string()
    })?
    .unwrap_or(0);

    if balance < price_per_message {
        return Ok(BillingResult {
            allowed: false,
            cost: price_per_message,
            is_free_trial: false,
            reason: Some("Insufficient balance".into()),
        });
    }

    Ok(BillingResult {
        allowed: true,
        cost: price_per_message,
        is_free_trial: false,
        reason: None,
    })
}

// ---------------------------------------------------------------------------
// deduct_coins
// ---------------------------------------------------------------------------

/// Atomically deduct coins from the user and credit the creator (70/30 split).
///
/// Uses a DB transaction:
/// 1. Deduct `price` from buyer balance (fails if insufficient).
/// 2. Record purchase transaction.
/// 3. Credit creator balance with 70% share.
/// 4. Record earning transaction for creator.
///
/// Returns the buyer's new balance on success.
pub async fn deduct_coins(
    db: &PgPool,
    user_id: &str,
    listing_id: Uuid,
    price: i32,
) -> Result<i32, String> {
    if price <= 0 {
        return Err("Price must be positive".into());
    }

    // Fetch creator_id
    let creator_id = sqlx::query_scalar::<_, String>(
        "SELECT creator_id FROM agent_listings WHERE id = $1",
    )
    .bind(listing_id)
    .fetch_optional(db)
    .await
    .map_err(|e| {
        tracing::error!("deduct_coins: fetch creator_id failed: {}", e);
        "Database error".to_string()
    })?
    .ok_or_else(|| "Listing not found".to_string())?;

    let creator_share = price * 7 / 10;

    // === Begin transaction ===
    let mut tx = db.begin().await.map_err(|e| {
        tracing::error!("deduct_coins: begin tx failed: {}", e);
        "Database error".to_string()
    })?;

    // 1. Atomic deduction — only succeeds if balance >= price
    let new_balance = sqlx::query_scalar::<_, i32>(
        r#"UPDATE coin_balances
           SET balance = balance - $2, updated_at = NOW()
           WHERE user_id = $1 AND balance >= $2
           RETURNING balance"#,
    )
    .bind(user_id)
    .bind(price)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| {
        tracing::error!("deduct_coins: deduction failed: {}", e);
        "Payment failed".to_string()
    })?
    .ok_or_else(|| "Insufficient balance".to_string())?;

    // 2. Record purchase transaction (buyer, negative amount)
    if let Err(e) = sqlx::query(
        r#"INSERT INTO coin_transactions (user_id, type, amount, related_app_id, description)
           VALUES ($1, 'purchase', $2, $3, 'Marketplace message payment')"#,
    )
    .bind(user_id)
    .bind(-price)
    .bind(listing_id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("deduct_coins: record purchase tx failed: {}", e);
        return Err("Payment failed".into());
    }

    // 3. Credit creator balance
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
        tracing::error!("deduct_coins: credit creator failed: {}", e);
        return Err("Payment failed".into());
    }

    // 4. Record earning transaction (creator, positive amount)
    if let Err(e) = sqlx::query(
        r#"INSERT INTO coin_transactions (user_id, type, amount, related_app_id, description)
           VALUES ($1, 'earning', $2, $3, 'Marketplace message earning')"#,
    )
    .bind(&creator_id)
    .bind(creator_share)
    .bind(listing_id)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("deduct_coins: record earning tx failed: {}", e);
        return Err("Payment failed".into());
    }

    // === Commit ===
    tx.commit().await.map_err(|e| {
        tracing::error!("deduct_coins: commit failed: {}", e);
        "Payment failed".to_string()
    })?;

    Ok(new_balance)
}

// ---------------------------------------------------------------------------
// record_message
// ---------------------------------------------------------------------------

/// Increment message counters after a message is processed.
///
/// Updates:
/// - `marketplace_conversations.message_count += 1`
/// - `agent_listings.total_messages += 1`
/// - `agent_listings.total_revenue += price` (if price > 0)
pub async fn record_message(
    db: &PgPool,
    conversation_id: Uuid,
    listing_id: Uuid,
    price: i32,
) -> Result<(), String> {
    // Increment conversation message count
    let conv_result = sqlx::query(
        "UPDATE marketplace_conversations SET message_count = message_count + 1, updated_at = NOW() WHERE id = $1",
    )
    .bind(conversation_id)
    .execute(db)
    .await;

    match conv_result {
        Ok(r) if r.rows_affected() == 0 => {
            tracing::error!("record_message: conversation {} not found (0 rows affected)", conversation_id);
            return Err("Conversation not found".into());
        }
        Err(e) => {
            tracing::error!("record_message: update conversation count failed: {}", e);
            return Err("Database error".into());
        }
        _ => {}
    }

    // Increment listing total_messages and total_revenue
    let listing_result = sqlx::query(
        r#"UPDATE agent_listings
           SET total_messages = total_messages + 1,
               total_revenue = total_revenue + $2,
               updated_at = NOW()
           WHERE id = $1"#,
    )
    .bind(listing_id)
    .bind(price)
    .execute(db)
    .await;

    match listing_result {
        Ok(r) if r.rows_affected() == 0 => {
            tracing::error!("record_message: listing {} not found (0 rows affected)", listing_id);
            return Err("Listing not found".into());
        }
        Err(e) => {
            tracing::error!("record_message: update listing stats failed: {}", e);
            return Err("Database error".into());
        }
        _ => {}
    }

    Ok(())
}
