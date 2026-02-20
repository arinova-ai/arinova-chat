use axum::{extract::State, http::StatusCode, response::Json, routing::get, Router};
use serde_json::{json, Value};

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/health", get(health_check))
}

async fn health_check(State(state): State<AppState>) -> (StatusCode, Json<Value>) {
    let mut db_status = "ok";
    let mut redis_status = "ok";

    // Check PostgreSQL
    if sqlx::query("SELECT 1")
        .execute(&state.db)
        .await
        .is_err()
    {
        db_status = "error";
    }

    // Check Redis
    match state.redis.get().await {
        Ok(mut conn) => {
            if deadpool_redis::redis::cmd("PING")
                .query_async::<String>(&mut conn)
                .await
                .is_err()
            {
                redis_status = "error";
            }
        }
        Err(_) => {
            redis_status = "error";
        }
    }

    let status = if db_status == "ok" && redis_status == "ok" {
        "ok"
    } else {
        "degraded"
    };
    let code = if status == "ok" {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    (
        code,
        Json(json!({
            "status": status,
            "db": db_status,
            "redis": redis_status,
            "timestamp": chrono::Utc::now().to_rfc3339(),
        })),
    )
}
