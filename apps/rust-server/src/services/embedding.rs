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
/// All indexing uses char_indices for UTF-8 safety (CJK, emoji, etc.).
///
/// - `chunk_size`: target chunk size in **characters** (~2000 chars ≈ 500 tokens)
/// - `overlap`: number of characters to overlap between consecutive chunks (~200)
pub fn chunk_text(text: &str, chunk_size: usize, overlap: usize) -> Vec<String> {
    if text.is_empty() {
        return vec![];
    }

    // Build a vec of byte offsets at char boundaries for safe slicing
    let char_offsets: Vec<usize> = text.char_indices().map(|(i, _)| i).collect();
    let char_count = char_offsets.len();

    if char_count <= chunk_size {
        return vec![text.to_string()];
    }

    // Helper: convert char index to byte offset (clamped to text.len())
    let byte_at = |ci: usize| -> usize {
        if ci >= char_count {
            text.len()
        } else {
            char_offsets[ci]
        }
    };

    let mut chunks = Vec::new();
    let mut start_ci: usize = 0; // char index

    while start_ci < char_count {
        let end_ci = (start_ci + chunk_size).min(char_count);
        let start_byte = byte_at(start_ci);
        let end_byte = byte_at(end_ci);

        // Try to find a nice break point near end_byte
        let actual_end_byte = if end_ci < char_count {
            find_break_point(text, start_byte, end_byte)
        } else {
            end_byte
        };

        let chunk = text[start_byte..actual_end_byte].trim();
        if !chunk.is_empty() {
            chunks.push(chunk.to_string());
        }

        // Convert actual_end_byte back to a char index for advancing
        let actual_end_ci = match char_offsets.binary_search(&actual_end_byte) {
            Ok(ci) => ci,
            Err(ci) => ci, // next char boundary after actual_end_byte
        };

        // Advance by (chars consumed - overlap), at least 1 char forward
        let consumed = actual_end_ci.saturating_sub(start_ci);
        let advance = if consumed > overlap {
            consumed - overlap
        } else {
            consumed.max(1)
        };
        start_ci += advance;
    }

    chunks
}

/// Find the best break point near `end` byte offset, preferring
/// paragraph > newline > sentence > word boundaries.
/// All rfind operations return byte offsets that are inherently valid
/// UTF-8 boundaries (they search for ASCII patterns).
fn find_break_point(text: &str, start: usize, end: usize) -> usize {
    let mut search_from = if end > start + 800 { end - 800 } else { start };
    // Align to a valid UTF-8 char boundary
    while !text.is_char_boundary(search_from) && search_from > start {
        search_from -= 1;
    }
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
    // No good break point — cut at end (already a valid boundary)
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

    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .context("Failed to build HTTP client")?;
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
