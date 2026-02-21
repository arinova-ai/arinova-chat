use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use deadpool_redis::redis::AsyncCommands;
use serde_json::json;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/agents/{id}/health", get(check_agent_health))
        .route("/api/agents/health", get(check_all_agents_health))
}

async fn check_agent_health(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> Response {
    let agent = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT id::text, a2a_endpoint FROM agents WHERE id = $1::uuid AND owner_id = $2",
    )
    .bind(&id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    let (agent_id, a2a_endpoint) = match agent {
        Ok(Some(a)) => a,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Agent not found"})),
            )
                .into_response();
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    let health = get_agent_health_status(&state, &agent_id, a2a_endpoint.as_deref()).await;
    Json(json!(health)).into_response()
}

async fn check_all_agents_health(
    State(state): State<AppState>,
    user: AuthUser,
) -> Response {
    let agents = sqlx::query_as::<_, (String, String, Option<String>)>(
        "SELECT id::text, name, a2a_endpoint FROM agents WHERE owner_id = $1 ORDER BY created_at",
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    let agents = match agents {
        Ok(a) => a,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    let mut results = Vec::new();
    for (agent_id, agent_name, a2a_endpoint) in &agents {
        let health = get_agent_health_status(&state, agent_id, a2a_endpoint.as_deref()).await;
        results.push(json!({
            "agentId": agent_id,
            "agentName": agent_name,
            "status": health["status"],
            "wsConnected": health["wsConnected"],
            "a2aReachable": health["a2aReachable"],
            "latencyMs": health["latencyMs"],
            "checkedAt": health["checkedAt"],
        }));
    }

    Json(json!(results)).into_response()
}

async fn get_agent_health_status(
    state: &AppState,
    agent_id: &str,
    a2a_endpoint: Option<&str>,
) -> serde_json::Value {
    let ws_connected = state.ws.is_agent_connected(agent_id);

    if ws_connected {
        return json!({
            "status": "online",
            "wsConnected": true,
            "a2aReachable": null,
            "latencyMs": null,
            "checkedAt": chrono::Utc::now().to_rfc3339(),
        });
    }

    let (a2a_reachable, latency_ms) = if let Some(endpoint) = a2a_endpoint {
        check_a2a_health_cached(state, agent_id, endpoint).await
    } else {
        (None, None)
    };

    let status = match a2a_reachable {
        Some(true) => "reachable",
        Some(false) => "unreachable",
        None => "unknown",
    };

    json!({
        "status": status,
        "wsConnected": false,
        "a2aReachable": a2a_reachable,
        "latencyMs": latency_ms,
        "checkedAt": chrono::Utc::now().to_rfc3339(),
    })
}

async fn check_a2a_health_cached(
    state: &AppState,
    agent_id: &str,
    endpoint: &str,
) -> (Option<bool>, Option<u64>) {
    let cache_key = format!("agent:health:{}", agent_id);

    // Try reading from Redis cache
    if let Ok(mut conn) = state.redis.get().await {
        if let Ok(Some(cached_value)) = conn.get::<_, Option<String>>(&cache_key).await {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&cached_value) {
                let reachable = parsed["reachable"].as_bool();
                let latency = parsed["latencyMs"].as_u64();
                return (reachable, latency);
            }
        }
    }

    // Cache miss: perform the actual health check
    let start = std::time::Instant::now();
    let result = reqwest::Client::new()
        .get(endpoint)
        .header("Accept", "application/json")
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await;

    let elapsed = start.elapsed().as_millis() as u64;
    let reachable = result.map(|r| r.status().is_success()).unwrap_or(false);

    // Store in Redis with 60s TTL
    if let Ok(mut conn) = state.redis.get().await {
        let cache_value = json!({
            "reachable": reachable,
            "latencyMs": elapsed,
        })
        .to_string();

        let _: Result<(), _> = conn.set_ex::<_, _, ()>(&cache_key, &cache_value, 60).await;
    }

    (Some(reachable), Some(elapsed))
}
