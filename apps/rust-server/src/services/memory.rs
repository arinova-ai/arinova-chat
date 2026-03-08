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
Output each memory as a separate line, prefixed with an importance score from 0.0 to 1.0. \
Format: [importance:0.8] memory content here \
Focus on: user preferences, decisions made, important facts mentioned, action items, and relationship context. \
Be concise — each line should be one self-contained memory. \
Importance guide: 0.9-1.0 = critical decisions/strong preferences, 0.6-0.8 = useful facts/context, 0.3-0.5 = minor details.";

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

    // Parse entries with importance: "[importance:0.8] content" or plain text
    let parsed_entries: Vec<(String, f64)> = full_text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .map(|line| parse_importance_line(line))
        .collect();

    if parsed_entries.is_empty() {
        return Ok((0, new_watermark_utc));
    }

    let entry_texts: Vec<String> = parsed_entries.iter().map(|(t, _)| t.clone()).collect();

    // 7. Generate embeddings
    let openai_key = config
        .openai_api_key
        .as_deref()
        .ok_or_else(|| anyhow!("OPENAI_API_KEY not configured"))?;

    let mut all_embeddings: Vec<Vec<f32>> = Vec::with_capacity(entry_texts.len());
    for batch in entry_texts.chunks(EMBEDDING_BATCH_SIZE) {
        let batch_vec: Vec<String> = batch.to_vec();
        let embeddings = generate_embeddings(&client, openai_key, &batch_vec, EMBEDDING_MODEL).await?;
        all_embeddings.extend(embeddings);
    }

    // 8. Insert into memory_entries with importance
    let mut tx = db.begin().await.context("Failed to begin transaction")?;

    for ((content, importance), embedding) in parsed_entries.iter().zip(all_embeddings.iter()) {
        let vec = Vector::from(embedding.clone());
        sqlx::query(
            r#"INSERT INTO memory_entries (capsule_id, content, embedding, importance)
               VALUES ($1, $2, $3::vector, $4)"#,
        )
        .bind(capsule_id)
        .bind(content)
        .bind(vec)
        .bind(*importance)
        .execute(&mut *tx)
        .await
        .context("Failed to insert memory entry")?;
    }

    tx.commit().await.context("Failed to commit memory entries")?;

    Ok((parsed_entries.len(), new_watermark_utc))
}

/// Parse a line like "[importance:0.8] memory content" into (content, importance).
/// Falls back to 0.5 importance if prefix is missing or malformed.
fn parse_importance_line(line: &str) -> (String, f64) {
    if let Some(rest) = line.strip_prefix("[importance:") {
        if let Some(bracket_end) = rest.find(']') {
            let score_str = &rest[..bracket_end];
            let content = rest[bracket_end + 1..].trim().to_string();
            if let Ok(score) = score_str.parse::<f64>() {
                let clamped = score.clamp(0.0, 1.0);
                if !content.is_empty() {
                    return (content, clamped);
                }
            }
        }
    }
    // Fallback: no importance prefix
    (line.to_string(), 0.5)
}

// ---------------------------------------------------------------------------
// Hybrid memory search
// ---------------------------------------------------------------------------

/// A single memory search result with scoring breakdown.
#[derive(Debug)]
pub struct MemorySearchResult {
    pub content: String,
    pub capsule_name: String,
    pub score: f64,
}

/// Hybrid search: vector similarity + BM25 full-text + time decay + importance.
/// Requires the query to already be embedded.
pub async fn hybrid_search(
    db: &PgPool,
    capsule_ids: &[Uuid],
    query_embedding: Vec<f32>,
    query_text: &str,
    limit: i32,
) -> anyhow::Result<Vec<MemorySearchResult>> {
    if capsule_ids.is_empty() {
        return Ok(vec![]);
    }

    let query_vec = Vector::from(query_embedding);

    let rows = sqlx::query_as::<_, (String, String, f64)>(
        r#"WITH vector_search AS (
               SELECT me.id, me.content, me.capsule_id, me.created_at, me.importance,
                      1.0 - (me.embedding <=> $1::vector) AS vector_score
               FROM memory_entries me
               WHERE me.capsule_id = ANY($2)
               ORDER BY me.embedding <=> $1::vector
               LIMIT 50
           ),
           text_search AS (
               SELECT me.id,
                      ts_rank(me.search_vector, plainto_tsquery('english', $3)) AS text_score
               FROM memory_entries me
               WHERE me.capsule_id = ANY($2)
                 AND me.search_vector @@ plainto_tsquery('english', $3)
           )
           SELECT v.content,
                  mc.name AS capsule_name,
                  (0.5 * v.vector_score
                   + 0.2 * COALESCE(t.text_score, 0)
                   + 0.15 * EXP(-0.693 * EXTRACT(EPOCH FROM (NOW() - v.created_at)) / (30.0 * 86400.0))
                   + 0.15 * v.importance
                  ) AS final_score
           FROM vector_search v
           JOIN memory_capsules mc ON mc.id = v.capsule_id
           LEFT JOIN text_search t ON v.id = t.id
           ORDER BY final_score DESC
           LIMIT $4"#,
    )
    .bind(query_vec)
    .bind(capsule_ids)
    .bind(query_text)
    .bind(limit)
    .fetch_all(db)
    .await
    .context("Hybrid memory search failed")?;

    Ok(rows
        .into_iter()
        .map(|(content, capsule_name, score)| MemorySearchResult {
            content,
            capsule_name,
            score,
        })
        .collect())
}
