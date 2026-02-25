//! LLM provider service — streaming calls to OpenAI and Anthropic.
//!
//! Provides:
//! - `validate_api_key()` — quick HEAD/GET check per provider
//! - `call_llm_stream()` — SSE streaming chat completion

use bytes::Bytes;
use futures::stream::{Stream, StreamExt};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::pin::Pin;
use std::time::Duration;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct LlmCallOptions {
    pub provider: LlmProvider,
    pub model: String,
    pub api_key: String,
    pub messages: Vec<ChatMessage>,
    pub max_tokens: Option<u32>,
    pub temperature: Option<f32>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LlmProvider {
    OpenAI,
    Anthropic,
}

impl LlmProvider {
    /// Infer provider from a model ID string.
    pub fn from_model(model: &str) -> Self {
        if model.starts_with("claude") {
            Self::Anthropic
        } else {
            Self::OpenAI
        }
    }
}

/// A boxed byte-stream that yields SSE chunks.
pub type SseStream = Pin<Box<dyn Stream<Item = Result<Bytes, reqwest::Error>> + Send>>;

// ---------------------------------------------------------------------------
// validate_api_key
// ---------------------------------------------------------------------------

/// Validate an API key by making a lightweight request to the provider.
/// Returns `Ok(())` on success, or a user-safe error message on failure.
pub async fn validate_api_key(provider: &LlmProvider, api_key: &str) -> Result<(), String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    match provider {
        LlmProvider::OpenAI => {
            let resp = client
                .get("https://api.openai.com/v1/models")
                .bearer_auth(api_key)
                .send()
                .await
                .map_err(|_| "Failed to reach OpenAI API".to_string())?;

            if resp.status().is_success() {
                Ok(())
            } else if resp.status().as_u16() == 401 {
                Err("Invalid OpenAI API key".into())
            } else {
                Err("OpenAI API key validation failed".into())
            }
        }
        LlmProvider::Anthropic => {
            // Anthropic doesn't have a /models endpoint; send a minimal
            // completion request and check for auth errors.
            let resp = client
                .post("https://api.anthropic.com/v1/messages")
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .body(r#"{"model":"claude-haiku-4-5-20251001","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}"#)
                .send()
                .await
                .map_err(|_| "Failed to reach Anthropic API".to_string())?;

            let status = resp.status().as_u16();
            if status == 200 || status == 201 {
                Ok(())
            } else if status == 401 || status == 403 {
                Err("Invalid Anthropic API key".into())
            } else {
                Err("Anthropic API key validation failed".into())
            }
        }
    }
}

// ---------------------------------------------------------------------------
// call_llm_stream
// ---------------------------------------------------------------------------

/// Start a streaming LLM call. Returns an SSE byte stream.
///
/// The caller is responsible for forwarding the stream chunks to the client.
/// Provider-specific errors are logged internally; the stream will simply end.
pub async fn call_llm_stream(opts: &LlmCallOptions) -> Result<SseStream, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    match opts.provider {
        LlmProvider::OpenAI => call_openai_stream(&client, opts).await,
        LlmProvider::Anthropic => call_anthropic_stream(&client, opts).await,
    }
}

// ---------------------------------------------------------------------------
// OpenAI streaming
// ---------------------------------------------------------------------------

async fn call_openai_stream(client: &Client, opts: &LlmCallOptions) -> Result<SseStream, String> {
    let body = serde_json::json!({
        "model": opts.model,
        "messages": opts.messages,
        "stream": true,
        "max_tokens": opts.max_tokens.unwrap_or(4096),
        "temperature": opts.temperature.unwrap_or(0.7),
    });

    let resp = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(&opts.api_key)
        .header("content-type", "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| {
            tracing::error!("OpenAI request failed: {}", e);
            "LLM request failed".to_string()
        })?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let _body = resp.text().await.unwrap_or_default();
        tracing::error!("OpenAI returned {}: {}", status, _body);
        return Err("LLM request failed".into());
    }

    // Return the raw byte stream — caller parses SSE lines.
    Ok(Box::pin(resp.bytes_stream()))
}

// ---------------------------------------------------------------------------
// Anthropic streaming
// ---------------------------------------------------------------------------

async fn call_anthropic_stream(
    client: &Client,
    opts: &LlmCallOptions,
) -> Result<SseStream, String> {
    // Anthropic requires system messages as a top-level parameter, not in messages array
    let system_content: String = opts
        .messages
        .iter()
        .filter(|m| m.role == "system")
        .map(|m| m.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n");

    let non_system_messages: Vec<&ChatMessage> =
        opts.messages.iter().filter(|m| m.role != "system").collect();

    let mut body = serde_json::json!({
        "model": opts.model,
        "messages": non_system_messages,
        "stream": true,
        "max_tokens": opts.max_tokens.unwrap_or(4096),
        "temperature": opts.temperature.unwrap_or(0.7),
    });

    if !system_content.is_empty() {
        body["system"] = serde_json::Value::String(system_content);
    }

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &opts.api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| {
            tracing::error!("Anthropic request failed: {}", e);
            "LLM request failed".to_string()
        })?;

    if !resp.status().is_success() {
        let status = resp.status().as_u16();
        let _body = resp.text().await.unwrap_or_default();
        tracing::error!("Anthropic returned {}: {}", status, _body);
        return Err("LLM request failed".into());
    }

    Ok(Box::pin(resp.bytes_stream()))
}

// ---------------------------------------------------------------------------
// SSE parsing helpers
// ---------------------------------------------------------------------------

/// Extract the text delta from an OpenAI SSE `data:` line.
/// Returns `None` for `[DONE]` or non-content chunks.
pub fn parse_openai_chunk(data: &str) -> Option<String> {
    if data.trim() == "[DONE]" {
        return None;
    }
    let v: serde_json::Value = serde_json::from_str(data).ok()?;
    v["choices"][0]["delta"]["content"].as_str().map(String::from)
}

/// Extract the text delta from an Anthropic SSE `data:` line.
/// Returns `None` for non-content_block_delta events.
pub fn parse_anthropic_chunk(data: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(data).ok()?;
    if v["type"].as_str() == Some("content_block_delta") {
        v["delta"]["text"].as_str().map(String::from)
    } else {
        None
    }
}
