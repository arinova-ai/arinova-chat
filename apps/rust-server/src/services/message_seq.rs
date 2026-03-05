/// Get the next sequence number for a conversation.
/// Uses MAX(seq) + 1 to ensure monotonically increasing per-conversation.
/// Accepts any sqlx executor (pool or transaction).
pub async fn get_next_seq<'e, E>(executor: E, conversation_id: &str) -> Result<i32, sqlx::Error>
where
    E: sqlx::Executor<'e, Database = sqlx::Postgres>,
{
    let row = sqlx::query_as::<_, (Option<i32>,)>(
        r#"SELECT MAX(seq) FROM messages WHERE conversation_id = $1::uuid"#,
    )
    .bind(conversation_id)
    .fetch_one(executor)
    .await?;

    Ok(row.0.unwrap_or(0) + 1)
}
