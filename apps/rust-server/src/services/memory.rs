//! Memory capsule extraction pipeline — conversation → LLM extraction → embeddings → storage.

use anyhow::{anyhow, Context};
use pgvector::Vector;
use reqwest::Client;
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Config;
use crate::services::embedding::{generate_embeddings, EMBEDDING_MODEL};
use crate::services::push::{send_push_to_user, PushPayload};

const HAIKU_MODEL: &str = "claude-haiku-4-5-20241022";
const EXTRACTION_SYSTEM_PROMPT: &str = "\
Extract key facts, preferences, and important information from this conversation. \
Output each memory as a separate line. Focus on: user preferences, decisions made, \
important facts mentioned, action items, and relationship context. \
Be concise — each line should be one self-contained memory.";

/// Max texts per OpenAI embedding batch call
const EMBEDDING_BATCH_SIZE: usize = 100;

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<ContentBlock>,
}

#[derive(Deserialize)]
struct ContentBlock {
    text: Option<String>,
}

/// Extract memories from a capsule's source conversation using Haiku,
/// generate embeddings, and store in memory_entries.
/// Returns the number of memory entries created.
pub async fn extract_capsule(
    db: PgPool,
    config: Config,
    capsule_id: Uuid,
) -> anyhow::Result<usize> {
    // 1. Fetch capsule to get source_conversation_id, owner, and name
    let (conv_id, owner_id, capsule_name) = sqlx::query_as::<_, (Uuid, String, String)>(
        "SELECT source_conversation_id, owner_id, name FROM memory_capsules WHERE id = $1",
    )
    .bind(capsule_id)
    .fetch_optional(&db)
    .await?
    .ok_or_else(|| anyhow!("Capsule {} not found", capsule_id))?;

    // 2. Update status to 'extracting'
    sqlx::query("UPDATE memory_capsules SET status = 'extracting' WHERE id = $1")
        .bind(capsule_id)
        .execute(&db)
        .await?;

    // Run extraction, and on any error mark as 'failed'
    match do_extraction(&db, &config, capsule_id, conv_id).await {
        Ok(count) => {
            sqlx::query("UPDATE memory_capsules SET status = 'ready' WHERE id = $1")
                .bind(capsule_id)
                .execute(&db)
                .await?;
            tracing::info!(
                "Memory extraction complete for capsule {} (owner={}): {} entries",
                capsule_id, owner_id, count
            );
            let _ = send_push_to_user(
                &db,
                &config,
                &owner_id,
                &PushPayload {
                    notification_type: "memory_capsule".into(),
                    title: "Memory Capsule Ready".into(),
                    body: format!("{} extraction complete", capsule_name),
                    url: None,
                    message_id: None,
                },
            )
            .await;
            Ok(count)
        }
        Err(e) => {
            let _ = sqlx::query("UPDATE memory_capsules SET status = 'failed' WHERE id = $1")
                .bind(capsule_id)
                .execute(&db)
                .await;
            let _ = send_push_to_user(
                &db,
                &config,
                &owner_id,
                &PushPayload {
                    notification_type: "memory_capsule".into(),
                    title: "Memory Capsule Failed".into(),
                    body: format!("{} extraction failed", capsule_name),
                    url: None,
                    message_id: None,
                },
            )
            .await;
            Err(e)
        }
    }
}

async fn do_extraction(
    db: &PgPool,
    config: &Config,
    capsule_id: Uuid,
    conversation_id: Uuid,
) -> anyhow::Result<usize> {
    // 3. Fetch all completed messages from the conversation
    let messages = sqlx::query_as::<_, (String, String, chrono::NaiveDateTime)>(
        r#"SELECT role::text, content, created_at
           FROM messages
           WHERE conversation_id = $1 AND status = 'completed'
           ORDER BY seq ASC"#,
    )
    .bind(conversation_id)
    .fetch_all(db)
    .await
    .context("Failed to fetch messages")?;

    if messages.is_empty() {
        return Ok(0);
    }

    // 4. Concatenate messages into a text block
    let transcript: String = messages
        .iter()
        .map(|(role, content, ts)| format!("[{}] {}: {}", role, ts.format("%Y-%m-%d %H:%M"), content))
        .collect::<Vec<_>>()
        .join("\n");

    // 5. Call Haiku to extract key memories
    let anthropic_key = config
        .anthropic_api_key
        .as_deref()
        .ok_or_else(|| anyhow!("ANTHROPIC_API_KEY not configured"))?;

    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .context("Failed to build HTTP client")?;

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", anthropic_key)
        .header("anthropic-version", "2023-06-01")
        .json(&serde_json::json!({
            "model": HAIKU_MODEL,
            "max_tokens": 4096,
            "system": EXTRACTION_SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": transcript}]
        }))
        .send()
        .await
        .context("Failed to call Anthropic API")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Anthropic API returned {}: {}", status, body));
    }

    let parsed: AnthropicResponse = resp.json().await.context("Failed to parse Anthropic response")?;

    // 6. Split response into individual memory entries
    let full_text = parsed
        .content
        .into_iter()
        .filter_map(|b| b.text)
        .collect::<Vec<_>>()
        .join("\n");

    let entries: Vec<String> = full_text
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    if entries.is_empty() {
        return Ok(0);
    }

    // 7. Generate embeddings
    let openai_key = config
        .openai_api_key
        .as_deref()
        .ok_or_else(|| anyhow!("OPENAI_API_KEY not configured"))?;

    let mut all_embeddings: Vec<Vec<f32>> = Vec::with_capacity(entries.len());
    for batch in entries.chunks(EMBEDDING_BATCH_SIZE) {
        let batch_vec: Vec<String> = batch.to_vec();
        let embeddings = generate_embeddings(&client, openai_key, &batch_vec, EMBEDDING_MODEL).await?;
        all_embeddings.extend(embeddings);
    }

    // 8. Insert into memory_entries
    let mut tx = db.begin().await.context("Failed to begin transaction")?;

    for (entry, embedding) in entries.iter().zip(all_embeddings.iter()) {
        let vec = Vector::from(embedding.clone());
        sqlx::query(
            r#"INSERT INTO memory_entries (capsule_id, content, embedding)
               VALUES ($1, $2, $3::vector)"#,
        )
        .bind(capsule_id)
        .bind(entry)
        .bind(vec)
        .execute(&mut *tx)
        .await
        .context("Failed to insert memory entry")?;
    }

    tx.commit().await.context("Failed to commit memory entries")?;

    Ok(entries.len())
}
