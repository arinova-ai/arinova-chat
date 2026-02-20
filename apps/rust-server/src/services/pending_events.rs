use deadpool_redis::Pool;
use deadpool_redis::redis::AsyncCommands;
use serde_json::Value;

const KEY_PREFIX: &str = "pending_ws_events:";
const MAX_EVENTS_PER_USER: i64 = 1000;
const TTL_SECONDS: i64 = 86400; // 24 hours

fn key(user_id: &str) -> String {
    format!("{}{}", KEY_PREFIX, user_id)
}

/// Push a WS event to a user's pending queue.
/// Uses timestamp as score for ordering.
pub async fn push_event(redis: &Pool, user_id: &str, event: &Value) -> Result<(), anyhow::Error> {
    let mut conn = redis.get().await?;
    let k = key(user_id);
    let score = chrono::Utc::now().timestamp_millis() as f64;
    let event_str = serde_json::to_string(event)?;

    conn.zadd::<_, _, _, ()>(&k, &event_str, score).await?;

    // Cap at MAX_EVENTS_PER_USER (remove oldest)
    let count: i64 = conn.zcard(&k).await?;
    if count > MAX_EVENTS_PER_USER {
        conn.zremrangebyrank::<_, ()>(&k, 0, (count - MAX_EVENTS_PER_USER - 1) as isize).await?;
    }

    // Reset TTL
    conn.expire::<_, ()>(&k, TTL_SECONDS).await?;

    Ok(())
}

/// Get all pending events for a user.
pub async fn get_pending_events(redis: &Pool, user_id: &str) -> Result<Vec<Value>, anyhow::Error> {
    let mut conn = redis.get().await?;
    let k = key(user_id);
    let items: Vec<String> = conn.zrange(&k, 0, -1).await?;
    let events: Vec<Value> = items
        .iter()
        .filter_map(|item| serde_json::from_str(item).ok())
        .collect();
    Ok(events)
}

/// Clear all pending events for a user (after successful delivery).
pub async fn clear_pending_events(redis: &Pool, user_id: &str) -> Result<(), anyhow::Error> {
    let mut conn = redis.get().await?;
    conn.del::<_, ()>(&key(user_id)).await?;
    Ok(())
}
