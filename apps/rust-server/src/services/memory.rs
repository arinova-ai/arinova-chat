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

const GEMINI_MODEL_URL: &str =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const EXTRACTION_SYSTEM_PROMPT: &str = "\
Extract key facts, preferences, and important information from this conversation. \
Output each memory as a separate line. Focus on: user preferences, decisions made, \
important facts mentioned, action items, and relationship context. \
Be concise — each line should be one self-contained memory.";

/// Max texts per OpenAI embedding batch call
const EMBEDDING_BATCH_SIZE: usize = 100;

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
}
#[derive(Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiContent>,
}
#[derive(Deserialize)]
struct GeminiContent {
    parts: Option<Vec<GeminiPart>>,
}
#[derive(Deserialize)]
struct GeminiPart {
    text: Option<String>,
}

/// Extract memories from a capsule's source conversation using Gemini,
/// generate embeddings, and store in memory_entries.
/// Supports incremental extraction via `extracted_through` watermark.
/// Returns the number of memory entries created.
pub async fn extract_capsule(
    db: PgPool,
    config: Config,
    capsule_id: Uuid,
) -> anyhow::Result<usize> {
    // 1. Fetch capsule metadata
    let (conv_id, owner_id, capsule_name, extracted_through) = sqlx::query_as::<_, (Uuid, String, String, Option<chrono::DateTime<chrono::Utc>>)>(
        "SELECT source_conversation_id, owner_id, name, extracted_through FROM memory_capsules WHERE id = $1",
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

    let extracted_through_naive = extracted_through.map(|dt| dt.naive_utc());

    // Run extraction, and on any error mark as 'failed'
    match do_extraction(&db, &config, capsule_id, conv_id, extracted_through_naive).await {
        Ok((count, new_watermark)) => {
            sqlx::query(
                "UPDATE memory_capsules SET status = 'ready', extracted_through = $2, entry_count = entry_count + $3 WHERE id = $1",
            )
            .bind(capsule_id)
            .bind(new_watermark)
            .bind(count as i32)
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
    extracted_through: Option<chrono::NaiveDateTime>,
) -> anyhow::Result<(usize, chrono::DateTime<chrono::Utc>)> {
    // 3. Fetch messages (incremental: only after extracted_through if set)
    let messages = if let Some(watermark) = extracted_through {
        sqlx::query_as::<_, (String, String, chrono::NaiveDateTime)>(
            r#"SELECT role::text, content, created_at
               FROM messages
               WHERE conversation_id = $1 AND status = 'completed' AND created_at > $2
               ORDER BY seq ASC"#,
        )
        .bind(conversation_id)
        .bind(watermark)
        .fetch_all(db)
        .await
        .context("Failed to fetch messages")?
    } else {
        sqlx::query_as::<_, (String, String, chrono::NaiveDateTime)>(
            r#"SELECT role::text, content, created_at
               FROM messages
               WHERE conversation_id = $1 AND status = 'completed'
               ORDER BY seq ASC"#,
        )
        .bind(conversation_id)
        .fetch_all(db)
        .await
        .context("Failed to fetch messages")?
    };

    if messages.is_empty() {
        // No new messages — return 0 entries, keep existing watermark
        let now = chrono::Utc::now();
        return Ok((0, extracted_through.map(|w| chrono::DateTime::from_naive_utc_and_offset(w, chrono::Utc)).unwrap_or(now)));
    }

    // New watermark = MAX created_at from fetched messages
    let new_watermark = messages
        .iter()
        .map(|(_, _, ts)| *ts)
        .max()
        .unwrap(); // safe: messages is non-empty
    let new_watermark_utc = chrono::DateTime::from_naive_utc_and_offset(new_watermark, chrono::Utc);

    // 4. Concatenate messages into a text block
    let transcript: String = messages
        .iter()
        .map(|(role, content, ts)| format!("[{}] {}: {}", role, ts.format("%Y-%m-%d %H:%M"), content))
        .collect::<Vec<_>>()
        .join("\n");

    // 5. Call Gemini to extract key memories
    let gemini_key = config
        .gemini_api_key
        .as_deref()
        .ok_or_else(|| anyhow!("GEMINI_API_KEY not configured"))?;

    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .context("Failed to build HTTP client")?;

    let url = format!("{}?key={}", GEMINI_MODEL_URL, gemini_key);
    let resp = client
        .post(&url)
        .json(&serde_json::json!({
            "systemInstruction": {"parts": [{"text": EXTRACTION_SYSTEM_PROMPT}]},
            "contents": [{"parts": [{"text": transcript}]}],
            "generationConfig": {"maxOutputTokens": 4096}
        }))
        .send()
        .await
        .context("Failed to call Gemini API")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!("Gemini API returned {}: {}", status, body));
    }

    let parsed: GeminiResponse = resp.json().await.context("Failed to parse Gemini response")?;

    // 6. Split response into individual memory entries
    let full_text = parsed
        .candidates
        .and_then(|c| c.into_iter().next())
        .and_then(|c| c.content)
        .and_then(|c| c.parts)
        .map(|parts| parts.into_iter().filter_map(|p| p.text).collect::<Vec<_>>().join("\n"))
        .unwrap_or_default();

    let entries: Vec<String> = full_text
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();

    if entries.is_empty() {
        return Ok((0, new_watermark_utc));
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

    Ok((entries.len(), new_watermark_utc))
}
