use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/office/dashboard/summary", get(summary))
        .route("/api/office/dashboard/usage", get(usage_trend))
        .route("/api/office/dashboard/agents", get(agent_ranking))
}

// ── Types ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PeriodQuery {
    period: Option<String>,
    sort: Option<String>,
}

fn period_days(period: &str) -> i32 {
    match period {
        "30d" => 30,
        "90d" => 90,
        _ => 7,
    }
}

// ── Summary ───────────────────────────────────────────────────

/// GET /api/office/dashboard/summary — today's snapshot
async fn summary(State(state): State<AppState>, user: AuthUser) -> Response {
    let today_row = sqlx::query_as::<_, (i64, i64, f64)>(
        r#"SELECT COALESCE(SUM(input_tokens), 0)::bigint,
                  COALESCE(SUM(output_tokens), 0)::bigint,
                  COALESCE(SUM(estimated_cost_usd)::float8, 0)
           FROM agent_usage_hourly
           WHERE owner_id = $1 AND hour >= date_trunc('day', NOW())"#,
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    let (today_input, today_output, today_cost) = today_row.unwrap_or((0, 0, 0.0));

    let active_agents = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(DISTINCT agent_id)
           FROM agent_usage_hourly
           WHERE owner_id = $1 AND hour >= date_trunc('day', NOW())"#,
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    let tasks_done = sqlx::query_scalar::<_, i64>(
        r#"SELECT COUNT(*)
           FROM kanban_cards c
           JOIN kanban_columns col ON col.id = c.column_id AND col.name = 'Done'
           JOIN kanban_boards b ON b.id = col.board_id AND b.owner_id = $1
           WHERE c.updated_at >= date_trunc('day', NOW())"#,
    )
    .bind(&user.id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    Json(json!({
        "todayTokens": today_input + today_output,
        "todayInputTokens": today_input,
        "todayOutputTokens": today_output,
        "todayCostUsd": format!("{:.4}", today_cost),
        "activeAgents": active_agents,
        "tasksDone": tasks_done,
    }))
    .into_response()
}

// ── Usage Trend ───────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct UsageTrendRow {
    date: String,
    agent_id: String,
    agent_name: Option<String>,
    input_tokens: i64,
    output_tokens: i64,
}

/// GET /api/office/dashboard/usage — daily usage breakdown
async fn usage_trend(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Response {
    let days = period_days(q.period.as_deref().unwrap_or("7d"));

    let rows = sqlx::query_as::<_, UsageTrendRow>(
        r#"SELECT to_char(date_trunc('day', hour), 'YYYY-MM-DD') AS date,
                  agent_id,
                  MAX(agent_name) AS agent_name,
                  SUM(input_tokens)::bigint AS input_tokens,
                  SUM(output_tokens)::bigint AS output_tokens
           FROM agent_usage_hourly
           WHERE owner_id = $1 AND hour >= NOW() - make_interval(days => $2)
           GROUP BY date, agent_id
           ORDER BY date"#,
    )
    .bind(&user.id)
    .bind(days)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(data) => Json(json!(data)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

// ── Agent Ranking ─────────────────────────────────────────────

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct AgentRankRow {
    agent_id: String,
    agent_name: Option<String>,
    total_tokens: i64,
    session_duration_ms: i64,
    request_count: i64,
}

/// GET /api/office/dashboard/agents — agent leaderboard
async fn agent_ranking(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<PeriodQuery>,
) -> Response {
    let days = period_days(q.period.as_deref().unwrap_or("7d"));
    let sort_col = match q.sort.as_deref() {
        Some("sessions") => "session_duration_ms",
        Some("requests") => "request_count",
        _ => "total_tokens",
    };

    let sql = format!(
        r#"SELECT agent_id,
                  MAX(agent_name) AS agent_name,
                  (SUM(input_tokens) + SUM(output_tokens))::bigint AS total_tokens,
                  SUM(session_duration_ms)::bigint AS session_duration_ms,
                  SUM(request_count)::bigint AS request_count
           FROM agent_usage_hourly
           WHERE owner_id = $1 AND hour >= NOW() - make_interval(days => $2)
           GROUP BY agent_id
           ORDER BY {sort_col} DESC
           LIMIT 20"#,
    );

    let rows = sqlx::query_as::<_, AgentRankRow>(&sql)
        .bind(&user.id)
        .bind(days)
        .fetch_all(&state.db)
        .await;

    match rows {
        Ok(data) => Json(json!(data)).into_response(),
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// Helper: upsert hourly usage (called from office SSE handler).
pub async fn upsert_usage(
    db: &sqlx::PgPool,
    owner_id: &str,
    agent_id: &str,
    agent_name: Option<&str>,
    model: &str,
    input_tokens: i64,
    output_tokens: i64,
    cache_read: i64,
    cache_write: i64,
) {
    let hour = chrono::Utc::now().format("%Y-%m-%d %H:00:00+00").to_string();

    // Look up pricing
    let pricing = sqlx::query_as::<_, (f64, f64, f64, f64)>(
        r#"SELECT input_per_mtok::float8, output_per_mtok::float8,
                  cache_read_per_mtok::float8, cache_write_per_mtok::float8
           FROM model_pricing WHERE model = $1"#,
    )
    .bind(model)
    .fetch_optional(db)
    .await
    .ok()
    .flatten();

    let cost = if let Some((ip, op, crp, cwp)) = pricing {
        let m = 1_000_000.0f64;
        (input_tokens as f64) * ip / m
            + (output_tokens as f64) * op / m
            + (cache_read as f64) * crp / m
            + (cache_write as f64) * cwp / m
    } else {
        0.0
    };

    if let Err(e) = sqlx::query(
        r#"INSERT INTO agent_usage_hourly
             (owner_id, agent_id, agent_name, model, hour, input_tokens, output_tokens,
              cache_read_tokens, cache_write_tokens, request_count, estimated_cost_usd)
           VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7, $8, $9, 1, $10)
           ON CONFLICT (owner_id, agent_id, model, hour) DO UPDATE SET
             input_tokens = agent_usage_hourly.input_tokens + EXCLUDED.input_tokens,
             output_tokens = agent_usage_hourly.output_tokens + EXCLUDED.output_tokens,
             cache_read_tokens = agent_usage_hourly.cache_read_tokens + EXCLUDED.cache_read_tokens,
             cache_write_tokens = agent_usage_hourly.cache_write_tokens + EXCLUDED.cache_write_tokens,
             request_count = agent_usage_hourly.request_count + 1,
             estimated_cost_usd = agent_usage_hourly.estimated_cost_usd + EXCLUDED.estimated_cost_usd,
             agent_name = COALESCE(EXCLUDED.agent_name, agent_usage_hourly.agent_name)"#,
    )
    .bind(owner_id)
    .bind(agent_id)
    .bind(agent_name)
    .bind(model)
    .bind(&hour)
    .bind(input_tokens)
    .bind(output_tokens)
    .bind(cache_read)
    .bind(cache_write)
    .bind(cost)
    .execute(db)
    .await
    {
        tracing::warn!("Failed to upsert agent usage: {}", e);
    }
}
