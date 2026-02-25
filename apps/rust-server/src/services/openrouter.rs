//! OpenRouter proxy service — platform-managed LLM calls via OpenRouter.
//!
//! All marketplace chat requests are routed through OpenRouter using the
//! platform's API key. The API is OpenAI-compatible; SSE chunk parsing
//! reuses `llm::parse_openai_chunk`.

use reqwest::Client;
use std::time::Duration;

use crate::services::llm::{ChatMessage, SseStream};

const OPENROUTER_URL: &str = "https://openrouter.ai/api/v1/chat/completions";

/// Options for an OpenRouter streaming call.
pub struct OpenRouterCallOptions {
    /// OpenRouter model ID, e.g. "openai/gpt-4o", "anthropic/claude-3-sonnet".
    pub model: String,
    /// Chat messages (system + history).
    pub messages: Vec<ChatMessage>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

/// Start a streaming chat completion via OpenRouter.
///
/// Returns an SSE byte stream. Chunks follow OpenAI format and can be
/// parsed with `llm::parse_openai_chunk`.
pub async fn call_stream(
    api_key: &str,
    opts: &OpenRouterCallOptions,
) -> Result<SseStream, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(60))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let body = serde_json::json!({
        "model": opts.model,
        "messages": opts.messages,
        "stream": true,
        "max_tokens": opts.max_tokens.unwrap_or(4096),
        "temperature": opts.temperature.unwrap_or(0.7),
    });

    let resp = client
        .post(OPENROUTER_URL)
        .bearer_auth(api_key)
        .header("content-type", "application/json")
        .header("HTTP-Referer", "https://arinova.ai")
        .header("X-Title", "Arinova Chat")
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| {
            tracing::error!("OpenRouter request failed: {}", e);
            "LLM request failed".to_string()
        })?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let err_body = resp.text().await.unwrap_or_default();
        tracing::error!("OpenRouter returned {}: {}", status, err_body);
        return Err("LLM request failed".into());
    }

    Ok(Box::pin(resp.bytes_stream()))
}
