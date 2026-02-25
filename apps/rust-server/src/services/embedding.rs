//! RAG embedding pipeline — text chunking + OpenAI embedding generation.

use anyhow::{anyhow, Context};
use pgvector::Vector;
use reqwest::Client;
use serde::Deserialize;
use sqlx::PgPool;
use uuid::Uuid;

use crate::config::Config;

// ---------------------------------------------------------------------------
// Text chunking
// ---------------------------------------------------------------------------

/// Split text into overlapping chunks, breaking at paragraph/sentence boundaries.
///
/// - `chunk_size`: target chunk size in characters (~2000 chars ≈ 500 tokens)
/// - `overlap`: number of characters to overlap between consecutive chunks (~200)
pub fn chunk_text(text: &str, chunk_size: usize, overlap: usize) -> Vec<String> {
    if text.is_empty() {
        return vec![];
    }
    if text.len() <= chunk_size {
        return vec![text.to_string()];
    }

    let mut chunks = Vec::new();
    let mut start = 0;

    while start < text.len() {
        let end = (start + chunk_size).min(text.len());

        // If we're not at the end, try to break at a paragraph or sentence boundary
        let actual_end = if end < text.len() {
            find_break_point(text, start, end)
        } else {
            end
        };

        let chunk = text[start..actual_end].trim();
        if !chunk.is_empty() {
            chunks.push(chunk.to_string());
        }

        // Advance by (actual_end - overlap), but at least 1 char forward
        let advance = if actual_end > start + overlap {
            actual_end - overlap
        } else {
            actual_end
        };
        if advance <= start {
            // Safety: always move forward
            start = actual_end;
        } else {
            start = advance;
        }
    }

    chunks
}

/// Find the best break point near `end`, preferring paragraph > sentence > word boundaries.
fn find_break_point(text: &str, start: usize, end: usize) -> usize {
    let search_from = if end > start + 200 { end - 200 } else { start };
    let window = &text[search_from..end];

    // Prefer double newline (paragraph break)
    if let Some(pos) = window.rfind("\n\n") {
        return search_from + pos + 2;
    }
    // Then single newline
    if let Some(pos) = window.rfind('\n') {
        return search_from + pos + 1;
    }
    // Then sentence-ending punctuation followed by space
    for pat in [". ", "! ", "? "] {
        if let Some(pos) = window.rfind(pat) {
            return search_from + pos + pat.len();
        }
    }
    // Fall back to last space (word boundary)
    if let Some(pos) = window.rfind(' ') {
        return search_from + pos + 1;
    }
    // No good break point — just cut at end
    end
}

// ---------------------------------------------------------------------------
// OpenAI Embedding API
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct EmbeddingResponse {
    data: Vec<EmbeddingData>,
}

#[derive(Deserialize)]
struct EmbeddingData {
    embedding: Vec<f32>,
}

/// Call OpenAI embeddings API for a batch of texts.
/// Returns one Vec<f32> (length 1536) per input text.
pub async fn generate_embeddings(
    client: &Client,
    api_key: &str,
    texts: &[String],
    model: &str,
) -> anyhow::Result<Vec<Vec<f32>>> {
    if texts.is_empty() {
        return Ok(vec![]);
    }

    let resp = client
        .post("https://api.openai.com/v1/embeddings")
        .bearer_auth(api_key)
        .json(&serde_json::json!({
            "input": texts,
            "model": model,
        }))
        .send()
        .await
        .context("Failed to call OpenAI embeddings API")?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(anyhow!(
            "OpenAI embeddings API returned {}: {}",
            status,
            body
        ));
    }

    let parsed: EmbeddingResponse = resp
        .json()
        .await
        .context("Failed to parse OpenAI embeddings response")?;

    // OpenAI returns data in order; collect directly
    let result: Vec<Vec<f32>> = parsed.data.into_iter().map(|d| d.embedding).collect();

    if result.len() != texts.len() {
        return Err(anyhow!(
            "Expected {} embeddings, got {}",
            texts.len(),
            result.len()
        ));
    }

    Ok(result)
}

// ---------------------------------------------------------------------------
// Full embedding pipeline
// ---------------------------------------------------------------------------

const CHUNK_SIZE: usize = 2000;
const CHUNK_OVERLAP: usize = 200;
const EMBEDDING_MODEL: &str = "text-embedding-3-small";
/// Max texts per OpenAI batch call
const BATCH_SIZE: usize = 100;

/// Process a knowledge base record: chunk → embed → store in knowledge_base_chunks.
/// Returns the total number of chunks created.
pub async fn process_embedding(
    db: PgPool,
    config: Config,
    kb_id: Uuid,
    raw_content: &str,
) -> anyhow::Result<usize> {
    let api_key = config
        .openai_api_key
        .as_deref()
        .ok_or_else(|| anyhow!("OPENAI_API_KEY not configured"))?;

    // 1. Chunk the text
    let chunks = chunk_text(raw_content, CHUNK_SIZE, CHUNK_OVERLAP);
    if chunks.is_empty() {
        return Ok(0);
    }

    let client = Client::new();
    let mut all_embeddings: Vec<Vec<f32>> = Vec::with_capacity(chunks.len());

    // 2. Generate embeddings in batches
    for batch in chunks.chunks(BATCH_SIZE) {
        let batch_vec: Vec<String> = batch.to_vec();
        let embeddings = generate_embeddings(&client, api_key, &batch_vec, EMBEDDING_MODEL).await?;
        all_embeddings.extend(embeddings);
    }

    // 3. Insert chunks + embeddings into DB in a transaction
    let mut tx = db.begin().await.context("Failed to begin transaction")?;

    for (i, (chunk, embedding)) in chunks.iter().zip(all_embeddings.iter()).enumerate() {
        let token_estimate = (chunk.len() / 4) as i32; // rough: 1 token ≈ 4 chars
        let vec = Vector::from(embedding.clone());

        sqlx::query(
            r#"INSERT INTO knowledge_base_chunks (kb_id, content, chunk_index, token_count, embedding)
               VALUES ($1, $2, $3, $4, $5::vector)"#,
        )
        .bind(kb_id)
        .bind(chunk)
        .bind(i as i32)
        .bind(token_estimate)
        .bind(vec)
        .execute(&mut *tx)
        .await
        .context("Failed to insert chunk")?;
    }

    tx.commit().await.context("Failed to commit chunks")?;

    Ok(chunks.len())
}
