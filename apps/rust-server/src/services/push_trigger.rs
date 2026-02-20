use dashmap::DashMap;
use sqlx::PgPool;
use std::sync::LazyLock;
use std::time::Instant;

const DEDUP_WINDOW_MS: u128 = 30_000; // 30 seconds

/// Deduplication: suppress same-type notifications within a time window
/// Key: "userId:type" -> timestamp of last sent push
static LAST_PUSH_SENT: LazyLock<DashMap<String, Instant>> = LazyLock::new(DashMap::new);

/// Check whether a push notification should be sent to a user
/// based on their notification preferences, quiet hours, and deduplication.
pub async fn should_send_push(
    pool: &PgPool,
    user_id: &str,
    notification_type: &str,
) -> Result<bool, sqlx::Error> {
    let prefs = sqlx::query_as::<_, (
        bool,
        bool,
        bool,
        bool,
        bool,
        Option<String>,
        Option<String>,
    )>(
        r#"SELECT global_enabled, message_enabled, playground_invite_enabled,
                  playground_turn_enabled, playground_result_enabled,
                  quiet_hours_start, quiet_hours_end
           FROM notification_preferences WHERE user_id = $1"#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    let prefs = match prefs {
        Some(p) => p,
        None => {
            // No preferences saved yet - default is all enabled
            return Ok(check_dedup(user_id, notification_type));
        }
    };

    let (global_enabled, message_enabled, invite_enabled, turn_enabled, result_enabled, quiet_start, quiet_end) = prefs;

    // Global toggle
    if !global_enabled {
        return Ok(false);
    }

    // Per-type toggle
    let type_enabled = match notification_type {
        "message" => message_enabled,
        "playground_invite" => invite_enabled,
        "playground_turn" => turn_enabled,
        "playground_result" => result_enabled,
        _ => true,
    };
    if !type_enabled {
        return Ok(false);
    }

    // Quiet hours check
    if let (Some(start), Some(end)) = (&quiet_start, &quiet_end) {
        if is_in_quiet_hours(start, end) {
            return Ok(false);
        }
    }

    Ok(check_dedup(user_id, notification_type))
}

/// Deduplication check: suppress same-type pushes within DEDUP_WINDOW_MS.
fn check_dedup(user_id: &str, notification_type: &str) -> bool {
    let key = format!("{}:{}", user_id, notification_type);
    let now = Instant::now();

    if let Some(last) = LAST_PUSH_SENT.get(&key) {
        if now.duration_since(*last).as_millis() < DEDUP_WINDOW_MS {
            return false;
        }
    }

    LAST_PUSH_SENT.insert(key, now);
    true
}

/// Check if a conversation is muted for a user.
pub async fn is_conversation_muted(
    pool: &PgPool,
    user_id: &str,
    conversation_id: &str,
) -> Result<bool, sqlx::Error> {
    let row = sqlx::query_as::<_, (bool,)>(
        r#"SELECT muted FROM conversation_reads
           WHERE user_id = $1 AND conversation_id = $2
           LIMIT 1"#,
    )
    .bind(user_id)
    .bind(conversation_id)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| r.0).unwrap_or(false))
}

fn is_in_quiet_hours(start: &str, end: &str) -> bool {
    let now = chrono::Local::now();
    let current_minutes = now.hour() as i32 * 60 + now.minute() as i32;

    let parse_time = |t: &str| -> i32 {
        let parts: Vec<&str> = t.split(':').collect();
        if parts.len() == 2 {
            let h: i32 = parts[0].parse().unwrap_or(0);
            let m: i32 = parts[1].parse().unwrap_or(0);
            h * 60 + m
        } else {
            0
        }
    };

    let start_min = parse_time(start);
    let end_min = parse_time(end);

    if start_min <= end_min {
        current_minutes >= start_min && current_minutes < end_min
    } else {
        // Overnight range: e.g. 23:00 - 07:00
        current_minutes >= start_min || current_minutes < end_min
    }
}

use chrono::Timelike;
