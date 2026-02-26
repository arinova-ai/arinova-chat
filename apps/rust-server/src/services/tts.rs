/// OpenAI TTS (Text-to-Speech) service.
///
/// Converts text to MP3 audio using the OpenAI `/v1/audio/speech` endpoint.
/// Available voices: alloy, echo, fable, onyx, nova, shimmer.

/// Generate speech from text using OpenAI TTS API.
/// Returns MP3 audio bytes on success.
pub async fn text_to_speech(
    api_key: &str,
    text: &str,
    voice: &str,
) -> Result<Vec<u8>, String> {
    // OpenAI TTS max input is 4096 chars — truncate at a safe char boundary
    let input = if text.len() > 4096 {
        let mut end = 4096;
        while !text.is_char_boundary(end) && end > 0 {
            end -= 1;
        }
        &text[..end]
    } else {
        text
    };

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
    let res = client
        .post("https://api.openai.com/v1/audio/speech")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&serde_json::json!({
            "model": "tts-1",
            "input": input,
            "voice": voice,
            "response_format": "mp3"
        }))
        .send()
        .await
        .map_err(|e| format!("TTS request failed: {}", e))?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!("TTS API error {}: {}", status, body));
    }

    let bytes = res
        .bytes()
        .await
        .map_err(|e| format!("TTS response read failed: {}", e))?;

    Ok(bytes.to_vec())
}
