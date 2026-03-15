//! Memory capsule extraction pipeline — conversation → LLM extraction → embeddings → storage.

use anyhow::{anyhow, Context};
use pgvector::Vector;
use reqwest::Client;
use sqlx::PgPool;
use uuid::Uuid;

use tokio_util::sync::CancellationToken;

use crate::config::Config;
use crate::services::embedding::{generate_embeddings, EMBEDDING_MODEL};
use crate::services::push::{send_push_to_user, PushPayload};

const EXTRACTION_SYSTEM_PROMPT: &str = "\
Extract key facts, preferences, and important information from this conversation. \
Output each memory as a separate line with importance score and 1-3 tags. \
Format: [importance:0.8][tag1][tag2] memory content here \
Tags should be short lowercase words describing the category (e.g. preference, decision, fact, action, relationship, technical, workflow, tool, goal). \
Focus on: user preferences, decisions made, important facts mentioned, action items, and relationship context. \
Be concise — each line should be one self-contained memory. \
Importance guide: 0.9-1.0 = critical decisions/strong preferences, 0.6-0.8 = useful facts/context, 0.3-0.5 = minor details. \
Do NOT use chain-of-thought or reasoning tags. Output strictly in the line-based tagged format above. \
IMPORTANT: Extract memories in the SAME LANGUAGE as the original conversation. If the user speaks Chinese, write Chinese. If English, write English. Never translate.";

/// Max texts per OpenAI embedding batch call
const EMBEDDING_BATCH_SIZE: usize = 100;

/// Max characters per chunk sent to Claude CLI (~30k tokens)
const CHUNK_CHAR_LIMIT: usize = 120_000;

/// Path to the claude CLI binary on the staging server
const CLAUDE_CLI_PATH: &str = "/root/.cargo/bin/claude";

/// Truncate a string to at most `max_bytes` without splitting a UTF-8 character.
fn safe_truncate(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// Extract memories from a capsule's source conversation using Claude CLI,
/// generate embeddings, and store in memory_entries.
/// Supports incremental extraction via `extracted_through` watermark.
/// Returns the number of memory entries created.
pub async fn extract_capsule(
    db: PgPool,
    config: Config,
    capsule_id: Uuid,
    cancel: CancellationToken,
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
    match do_extraction(&db, &config, capsule_id, conv_id, extracted_through_naive, &cancel).await {
        Ok((count, msg_count, first_msg_time, new_watermark)) => {
            // Update note_count from linked conversation notes
            let note_count = sqlx::query_scalar::<_, i64>(
                r#"SELECT COUNT(*) FROM conversation_notes n
                   JOIN note_conversation_links ncl ON ncl.note_id = n.id
                   WHERE ncl.conversation_id = $1 AND n.content != ''"#,
            )
            .bind(conv_id)
            .fetch_one(&db)
            .await
            .unwrap_or(0);

            // Only finalize if not cancelled (abort handler may have changed status)
            let result = sqlx::query(
                "UPDATE memory_capsules SET status = 'ready', progress = NULL, created_at = LEAST(created_at, $2), extracted_through = $3, entry_count = entry_count + $4, message_count = message_count + $5, note_count = $6 WHERE id = $1 AND status = 'extracting'",
            )
            .bind(capsule_id)
            .bind(first_msg_time)
            .bind(new_watermark)
            .bind(count as i32)
            .bind(msg_count as i32)
            .bind(note_count as i32)
            .execute(&db)
            .await?;

            if result.rows_affected() == 0 {
                // Capsule was cancelled/deleted while we were finishing
                tracing::info!("Extraction for capsule {} completed but capsule was already cancelled", capsule_id);
                return Ok(count);
            }
            // Auto-grant capsule to all agents in the conversation
            let _ = sqlx::query(
                r#"INSERT INTO memory_capsule_grants (capsule_id, agent_id, granted_by)
                   SELECT $1, agent_id, $3
                   FROM conversation_agent_members
                   WHERE conversation_id = $2
                   ON CONFLICT (capsule_id, agent_id) DO NOTHING"#,
            )
            .bind(capsule_id)
            .bind(conv_id)
            .bind(&owner_id)
            .execute(&db)
            .await;

            tracing::info!(
                "Memory extraction complete for capsule {} (owner={}): {} entries from {} messages",
                capsule_id, owner_id, count, msg_count
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
            if cancel.is_cancelled() {
                // Cancelled by user — abort handler already handled DB state
                tracing::info!("Extraction cancelled for capsule {}", capsule_id);
            } else {
                let _ = sqlx::query("UPDATE memory_capsules SET status = 'failed', progress = NULL WHERE id = $1")
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
            }
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
    cancel: &CancellationToken,
) -> anyhow::Result<(usize, usize, chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>)> {
    // Returns (entry_count, message_count, first_message_time, new_watermark)
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

    let msg_count = messages.len();

    // 3b. Fetch linked notes to include as context (via note_conversation_links)
    let notes: Vec<(String, String)> = sqlx::query_as(
        r#"SELECT n.title, n.content
           FROM conversation_notes n
           JOIN note_conversation_links ncl ON ncl.note_id = n.id
           WHERE ncl.conversation_id = $1 AND n.content != ''
           ORDER BY n.created_at ASC"#,
    )
    .bind(conversation_id)
    .fetch_all(db)
    .await
    .unwrap_or_default();

    if messages.is_empty() && notes.is_empty() {
        // No new messages and no linked notes — return 0 entries
        let now = chrono::Utc::now();
        let wm = extracted_through.map(|w| chrono::DateTime::from_naive_utc_and_offset(w, chrono::Utc)).unwrap_or(now);
        return Ok((0, 0, wm, wm));
    }

    // Time range from fetched messages
    let first_msg_time = messages
        .iter()
        .map(|(_, _, ts)| *ts)
        .min();
    let first_msg_utc = first_msg_time
        .map(|t| chrono::DateTime::from_naive_utc_and_offset(t, chrono::Utc))
        .unwrap_or_else(chrono::Utc::now);

    // New watermark = MAX created_at from fetched messages (or now if notes-only)
    let new_watermark = messages
        .iter()
        .map(|(_, _, ts)| *ts)
        .max();
    let new_watermark_utc = new_watermark
        .map(|t| chrono::DateTime::from_naive_utc_and_offset(t, chrono::Utc))
        .unwrap_or_else(chrono::Utc::now);

    // Initialize progress tracking
    let total_notes = notes.len();
    sqlx::query("UPDATE memory_capsules SET progress = $2 WHERE id = $1")
        .bind(capsule_id)
        .bind(serde_json::json!({
            "totalMessages": msg_count,
            "processedMessages": 0,
            "totalNotes": total_notes,
            "processedNotes": 0,
            "extractedEntries": 0
        }))
        .execute(db)
        .await?;

    // 4. Build chunks from messages (each chunk ≤ CHUNK_CHAR_LIMIT chars)
    let mut chunks: Vec<String> = Vec::new();
    let mut chunk_time_ranges: Vec<(chrono::NaiveDateTime, chrono::NaiveDateTime)> = Vec::new();
    let mut chunk_msg_counts: Vec<usize> = Vec::new();
    let mut current_chunk = String::new();
    let mut current_chunk_msgs: usize = 0;
    let mut chunk_start: Option<chrono::NaiveDateTime> = None;
    let mut chunk_end: Option<chrono::NaiveDateTime> = None;

    // Prepend notes as context in the first chunk
    if !notes.is_empty() {
        current_chunk.push_str("=== Conversation Notes ===\n");
        for (title, content) in &notes {
            let note_line = format!("[note] {}: {}\n", title, safe_truncate(content, 2000));
            current_chunk.push_str(&note_line);
        }
        current_chunk.push_str("=== Messages ===\n");
    }

    for (role, content, ts) in &messages {
        let line = format!("[{}] {}: {}\n", role, ts.format("%Y-%m-%d %H:%M"), content);
        if !current_chunk.is_empty() && current_chunk.len() + line.len() > CHUNK_CHAR_LIMIT {
            chunks.push(std::mem::take(&mut current_chunk));
            chunk_msg_counts.push(current_chunk_msgs);
            current_chunk_msgs = 0;
            if let (Some(s), Some(e)) = (chunk_start.take(), chunk_end.take()) {
                chunk_time_ranges.push((s, e));
            }
        }
        if chunk_start.is_none() {
            chunk_start = Some(*ts);
        }
        chunk_end = Some(*ts);
        current_chunk.push_str(&line);
        current_chunk_msgs += 1;
    }
    if !current_chunk.is_empty() {
        chunks.push(current_chunk);
        chunk_msg_counts.push(current_chunk_msgs);
        if let (Some(s), Some(e)) = (chunk_start, chunk_end) {
            chunk_time_ranges.push((s, e));
        }
    }

    tracing::info!(
        "Memory extraction: {} messages split into {} chunk(s) for capsule {}",
        messages.len(), chunks.len(), capsule_id
    );

    // 5. Call Claude CLI per chunk to extract key memories (with 1 retry on failure)
    let client = Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .context("Failed to build HTTP client")?;

    let mut parsed_entries: Vec<(String, f64, Vec<String>, usize)> = Vec::new(); // (content, importance, tags, chunk_idx)
    let mut chunks_succeeded = 0usize;
    let mut processed_messages: usize = 0;

    for (chunk_idx, chunk_text) in chunks.iter().enumerate() {
        if cancel.is_cancelled() {
            return Err(anyhow!("Extraction cancelled"));
        }

        let chunk_result = call_claude_cli_with_retry(chunk_text, chunk_idx).await;

        let chunk_msgs = chunk_msg_counts.get(chunk_idx).copied().unwrap_or(0);
        processed_messages += chunk_msgs;

        match chunk_result {
            Ok(text) => {
                let entries: Vec<(String, f64, Vec<String>, usize)> = text
                    .lines()
                    .map(|l| l.trim())
                    .filter(|l| !l.is_empty())
                    .map(|line| {
                        let (content, importance, tags) = parse_tagged_line(line);
                        (content, importance, tags, chunk_idx)
                    })
                    .collect();
                tracing::info!(
                    "Chunk {}/{}: extracted {} entries",
                    chunk_idx + 1, chunks.len(), entries.len()
                );
                parsed_entries.extend(entries);
                chunks_succeeded += 1;
            }
            Err(e) => {
                tracing::warn!(
                    "Chunk {}/{} failed after retry, skipping: {}",
                    chunk_idx + 1, chunks.len(), e
                );
            }
        }

        // Update progress after each chunk
        let notes_done = if chunk_idx == 0 { total_notes } else { total_notes };
        let _ = sqlx::query("UPDATE memory_capsules SET progress = $2 WHERE id = $1")
            .bind(capsule_id)
            .bind(serde_json::json!({
                "totalMessages": msg_count,
                "processedMessages": processed_messages,
                "totalNotes": total_notes,
                "processedNotes": notes_done,
                "extractedEntries": parsed_entries.len()
            }))
            .execute(db)
            .await;
    }

    if chunks_succeeded == 0 {
        return Err(anyhow!("All {} chunk(s) failed during Claude CLI extraction", chunks.len()));
    }

    // Only advance watermark if ALL chunks succeeded to avoid permanently skipping failed chunks
    let effective_watermark = if chunks_succeeded == chunks.len() {
        new_watermark_utc
    } else {
        tracing::warn!(
            "Partial extraction: {}/{} chunks succeeded — watermark NOT advanced so failed chunks can be retried",
            chunks_succeeded, chunks.len()
        );
        // Keep existing watermark (or epoch if first extraction)
        extracted_through
            .map(|dt| chrono::DateTime::from_naive_utc_and_offset(dt, chrono::Utc))
            .unwrap_or_else(|| chrono::DateTime::from_naive_utc_and_offset(
                chrono::NaiveDateTime::from_timestamp_opt(0, 0).unwrap(),
                chrono::Utc,
            ))
    };

    if parsed_entries.is_empty() {
        return Ok((0, msg_count, first_msg_utc, effective_watermark));
    }

    let entry_texts: Vec<String> = parsed_entries.iter().map(|(t, _, _, _)| t.clone()).collect();

    // 7. Generate embeddings
    let openai_key = config
        .openai_api_key
        .as_deref()
        .ok_or_else(|| anyhow!("OPENAI_API_KEY not configured"))?;

    let mut all_embeddings: Vec<Vec<f32>> = Vec::with_capacity(entry_texts.len());
    for batch in entry_texts.chunks(EMBEDDING_BATCH_SIZE) {
        if cancel.is_cancelled() {
            return Err(anyhow!("Extraction cancelled"));
        }
        let batch_vec: Vec<String> = batch.to_vec();
        let embeddings = generate_embeddings(&client, openai_key, &batch_vec, EMBEDDING_MODEL).await?;
        all_embeddings.extend(embeddings);
    }

    // 8. Insert into memory_entries with importance
    let mut tx = db.begin().await.context("Failed to begin transaction")?;

    for ((content, importance, tags, chunk_idx), embedding) in parsed_entries.iter().zip(all_embeddings.iter()) {
        let vec = Vector::from(embedding.clone());
        let (source_start, source_end) = if *chunk_idx < chunk_time_ranges.len() {
            let (s, e) = chunk_time_ranges[*chunk_idx];
            (
                Some(chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(s, chrono::Utc)),
                Some(chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(e, chrono::Utc)),
            )
        } else {
            (None, None)
        };
        sqlx::query(
            r#"INSERT INTO memory_entries (capsule_id, content, embedding, importance, tags, source_start, source_end)
               VALUES ($1, $2, $3::vector, $4, $5, $6, $7)"#,
        )
        .bind(capsule_id)
        .bind(content)
        .bind(vec)
        .bind(*importance)
        .bind(tags)
        .bind(source_start)
        .bind(source_end)
        .execute(&mut *tx)
        .await
        .context("Failed to insert memory entry")?;
    }

    tx.commit().await.context("Failed to commit memory entries")?;

    Ok((parsed_entries.len(), msg_count, first_msg_utc, effective_watermark))
}

/// Call `claude -p` CLI to extract memories from a chunk, retry once on failure.
async fn call_claude_cli_with_retry(
    chunk_text: &str,
    chunk_idx: usize,
) -> anyhow::Result<String> {
    for attempt in 0..2u8 {
        let mut cmd = tokio::process::Command::new(CLAUDE_CLI_PATH);
        cmd.arg("-p")
            .arg("--model")
            .arg("sonnet")
            .arg("--output-format")
            .arg("text")
            .arg("--system-prompt")
            .arg(EXTRACTION_SYSTEM_PROMPT)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn().context("Failed to spawn claude CLI")?;

        // Write chunk_text via stdin (avoids command line argument length limits)
        if let Some(mut stdin) = child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            stdin.write_all(chunk_text.as_bytes()).await.context("Failed to write chunk to claude CLI stdin")?;
            drop(stdin); // close stdin to signal EOF
        }

        // 5-minute timeout to prevent hanging if claude CLI stalls
        let output = match tokio::time::timeout(
            std::time::Duration::from_secs(300),
            child.wait_with_output(),
        ).await {
            Ok(result) => result.context("claude CLI process failed")?,
            Err(_) => {
                if attempt == 0 {
                    tracing::warn!("Chunk {} attempt 1: claude CLI timed out after 5 min, retrying...", chunk_idx);
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    continue;
                }
                return Err(anyhow!("claude CLI timed out after 5 min (chunk {})", chunk_idx));
            }
        };

        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout).to_string();
            if !text.trim().is_empty() {
                return Ok(text);
            }
            if attempt == 0 {
                tracing::warn!("Chunk {} attempt 1: empty output from claude CLI, retrying...", chunk_idx);
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue;
            }
            return Err(anyhow!("claude CLI returned empty output after retry (chunk {})", chunk_idx));
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            if attempt == 0 {
                tracing::warn!(
                    "Chunk {} attempt 1: claude CLI exited with {}, retrying... stderr: {}",
                    chunk_idx, output.status, stderr
                );
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                continue;
            }
            return Err(anyhow!(
                "claude CLI failed with exit code {} (chunk {}): {}",
                output.status, chunk_idx, stderr
            ));
        }
    }
    unreachable!()
}

/// Parse a line like "[importance:0.8][tag1][tag2] content" into (content, importance, tags).
/// Falls back to 0.5 importance and empty tags if prefixes are missing.
fn parse_tagged_line(line: &str) -> (String, f64, Vec<String>) {
    let mut remaining = line;
    let mut importance = 0.5;
    let mut tags: Vec<String> = Vec::new();

    // Parse [importance:X] prefix
    if let Some(rest) = remaining.strip_prefix("[importance:") {
        if let Some(bracket_end) = rest.find(']') {
            if let Ok(score) = rest[..bracket_end].parse::<f64>() {
                importance = score.clamp(0.0, 1.0);
            }
            remaining = &rest[bracket_end + 1..];
        }
    }

    // Parse [tag] prefixes (1-3 tags)
    while remaining.starts_with('[') {
        if let Some(bracket_end) = remaining.find(']') {
            let tag = remaining[1..bracket_end].trim().to_lowercase();
            if !tag.is_empty() && !tag.starts_with("importance:") && tag.len() <= 30 {
                tags.push(tag);
            }
            remaining = &remaining[bracket_end + 1..];
        } else {
            break;
        }
    }

    let content = remaining.trim().to_string();
    if content.is_empty() {
        return (line.to_string(), 0.5, vec![]);
    }

    (content, importance, tags)
}

// ---------------------------------------------------------------------------
// Hybrid memory search
// ---------------------------------------------------------------------------

/// A single memory search result with scoring breakdown.
#[derive(Debug)]
pub struct MemorySearchResult {
    pub content: String,
    pub capsule_name: String,
    pub capsule_id: Uuid,
    pub score: f64,
    pub importance: f64,
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

    let rows = sqlx::query_as::<_, (String, String, Uuid, f64, f64)>(
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
                  v.capsule_id,
                  v.importance,
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
        .map(|(content, capsule_name, capsule_id, importance, score)| MemorySearchResult {
            content,
            capsule_name,
            capsule_id,
            score,
            importance,
        })
        .collect())
}
