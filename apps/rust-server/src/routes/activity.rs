use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/office/activity", get(list_activity))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivityQuery {
    agent_id: Option<String>,
    #[serde(rename = "type")]
    activity_type: Option<String>,
    cursor: Option<String>,
    limit: Option<i32>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ActivityRow {
    id: Uuid,
    agent_id: String,
    agent_name: Option<String>,
    activity_type: String,
    title: String,
    detail: Option<String>,
    metadata: Option<serde_json::Value>,
    created_at: chrono::DateTime<chrono::Utc>,
}

/// GET /api/office/activity — cursor-based activity log
async fn list_activity(
    State(state): State<AppState>,
    user: AuthUser,
    Query(q): Query<ActivityQuery>,
) -> Response {
    let limit = q.limit.unwrap_or(50).min(100);
    let cursor_ts = q.cursor.as_ref().and_then(|c| {
        chrono::DateTime::parse_from_rfc3339(c).ok().map(|dt| dt.with_timezone(&chrono::Utc))
    });

    // Build query dynamically
    let mut sql = String::from(
        r#"SELECT id, agent_id, agent_name, activity_type, title, detail, metadata, created_at
           FROM activity_logs
           WHERE owner_id = $1"#,
    );
    let mut param_idx = 2u32;

    if q.agent_id.is_some() {
        sql.push_str(&format!(" AND agent_id = ${param_idx}"));
        param_idx += 1;
    }
    if q.activity_type.is_some() {
        sql.push_str(&format!(" AND activity_type = ${param_idx}"));
        param_idx += 1;
    }
    if cursor_ts.is_some() {
        sql.push_str(&format!(" AND created_at < ${param_idx}"));
        param_idx += 1;
    }
    let _ = param_idx; // suppress unused warning

    sql.push_str(" ORDER BY created_at DESC LIMIT ");
    sql.push_str(&(limit + 1).to_string());

    // Build query with bind params
    let mut query = sqlx::query_as::<_, ActivityRow>(&sql).bind(&user.id);

    if let Some(ref agent_id) = q.agent_id {
        query = query.bind(agent_id);
    }
    if let Some(ref activity_type) = q.activity_type {
        query = query.bind(activity_type);
    }
    if let Some(cursor) = cursor_ts {
        query = query.bind(cursor);
    }

    match query.fetch_all(&state.db).await {
        Ok(mut rows) => {
            let has_more = rows.len() > limit as usize;
            if has_more {
                rows.truncate(limit as usize);
            }
            let next_cursor = if has_more {
                rows.last().map(|r| r.created_at.to_rfc3339())
            } else {
                None
            };

            Json(json!({
                "items": rows,
                "nextCursor": next_cursor,
            }))
            .into_response()
        }
        Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({ "error": e.to_string() })))
            .into_response(),
    }
}

/// Helper: insert an activity log entry (used by office SSE handler).
pub async fn insert_activity(
    db: &sqlx::PgPool,
    owner_id: &str,
    agent_id: &str,
    agent_name: Option<&str>,
    activity_type: &str,
    title: &str,
    detail: Option<&str>,
) {
    if let Err(e) = sqlx::query(
        r#"INSERT INTO activity_logs (owner_id, agent_id, agent_name, activity_type, title, detail)
           VALUES ($1, $2, $3, $4, $5, $6)"#,
    )
    .bind(owner_id)
    .bind(agent_id)
    .bind(agent_name)
    .bind(activity_type)
    .bind(title)
    .bind(detail)
    .execute(db)
    .await
    {
        tracing::warn!("Failed to insert activity log: {}", e);
    }
}
