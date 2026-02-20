use sqlx::PgPool;

/// Get the next sequence number for a conversation.
/// Uses MAX(seq) + 1 to ensure monotonically increasing per-conversation.
pub async fn get_next_seq(pool: &PgPool, conversation_id: &str) -> Result<i32, sqlx::Error> {
    let row = sqlx::query_as::<_, (Option<i32>,)>(
        r#"SELECT MAX(seq) FROM messages WHERE conversation_id = $1"#,
    )
    .bind(conversation_id)
    .fetch_one(pool)
    .await?;

    Ok(row.0.unwrap_or(0) + 1)
}
