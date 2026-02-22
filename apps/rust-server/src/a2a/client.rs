use tokio::sync::mpsc;

/// A2A Protocol client.
/// Sends a task to an A2A agent endpoint and streams the response via SSE.
pub async fn stream_a2a_response(
    endpoint: &str,
    content: &str,
    message_id: &str,
    cancel: tokio::sync::watch::Receiver<bool>,
) -> Result<(mpsc::Receiver<String>, tokio::task::JoinHandle<Result<String, String>>), String> {
    let (chunk_tx, chunk_rx) = mpsc::channel::<String>(100);

    let endpoint = endpoint.to_string();
    let content = content.to_string();
    let message_id = message_id.to_string();

    let handle = tokio::spawn(async move {
        let client = reqwest::Client::new();

        // Resolve the agent card to find the task endpoint
        let task_url = endpoint.replace("/.well-known/agent.json", "/tasks/send");

        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": message_id,
            "method": "tasks/sendSubscribe",
            "params": {
                "id": message_id,
                "message": {
                    "role": "user",
                    "parts": [{ "type": "text", "text": content }],
                },
            },
        });

        let resp = client
            .post(&task_url)
            .header("Content-Type", "application/json")
            .header("Accept", "text/event-stream")
            .body(body.to_string())
            .send()
            .await
            .map_err(|e| format!("Agent unreachable: {}", e))?;

        if !resp.status().is_success() {
            return Err(format!("A2A agent responded with {}", resp.status()));
        }

        let mut accumulated = String::new();
        let mut buffer = String::new();
        let mut stream = resp.bytes_stream();

        use futures::StreamExt;
        loop {
            if *cancel.borrow() {
                return Err("Stream cancelled".into());
            }

            tokio::select! {
                chunk = stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            buffer.push_str(&String::from_utf8_lossy(&bytes));
                            let lines: Vec<&str> = buffer.split('\n').collect();
                            let last = lines.last().cloned().unwrap_or("");
                            let complete_lines = &lines[..lines.len() - 1];

                            for line in complete_lines {
                                if let Some(data) = line.strip_prefix("data: ") {
                                    if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                                        let state = event["result"]["status"]["state"].as_str();
                                        match state {
                                            Some("working") => {
                                                let parts = event["result"]["status"]["message"]["parts"]
                                                    .as_array();
                                                if let Some(parts) = parts {
                                                    for part in parts {
                                                        if part["type"].as_str() == Some("text") {
                                                            if let Some(text) = part["text"].as_str() {
                                                                let new_content = &text[accumulated.len()..];
                                                                if !new_content.is_empty() {
                                                                    accumulated.push_str(new_content);
                                                                    let _ = chunk_tx.send(new_content.to_string()).await;
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                            Some("completed") => {
                                                let parts = event["result"]["status"]["message"]["parts"]
                                                    .as_array()
                                                    .or_else(|| {
                                                        event["result"]["artifacts"][0]["parts"].as_array()
                                                    });
                                                if let Some(parts) = parts {
                                                    for part in parts {
                                                        if part["type"].as_str() == Some("text") {
                                                            if let Some(text) = part["text"].as_str() {
                                                                let new_content = &text[accumulated.len()..];
                                                                if !new_content.is_empty() {
                                                                    accumulated.push_str(new_content);
                                                                    let _ = chunk_tx.send(new_content.to_string()).await;
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                                return Ok(accumulated);
                                            }
                                            _ => {}
                                        }
                                    }
                                }
                            }

                            buffer = last.to_string();
                        }
                        Some(Err(e)) => {
                            return Err(format!("Stream error: {}", e));
                        }
                        None => {
                            break;
                        }
                    }
                }
            }
        }

        Ok(accumulated)
    });

    Ok((chunk_rx, handle))
}
