use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, patch, post},
    Router,
};
use serde::Deserialize;
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::middleware::{AuthAdmin, AuthUser};
use crate::AppState;

#[derive(FromRow)]
struct ReportRow {
    id: Uuid,
    message_id: Uuid,
    reporter_user_id: String,
    reason: String,
    description: Option<String>,
    status: String,
    admin_notes: Option<String>,
    created_at: chrono::NaiveDateTime,
    reviewed_at: Option<chrono::NaiveDateTime>,
    reviewed_by: Option<String>,
    message_content: String,
    reporter_name: Option<String>,
    reporter_username: Option<String>,
    sender_user_id: Option<String>,
    sender_agent_id: Option<Uuid>,
    sender_name: Option<String>,
    sender_username: Option<String>,
    sender_image: Option<String>,
    sender_is_verified: Option<bool>,
    sender_agent_name: Option<String>,
}

fn report_to_json(r: &ReportRow) -> serde_json::Value {
    json!({
        "id": r.id,
        "messageId": r.message_id,
        "reporterUserId": r.reporter_user_id,
        "reason": r.reason,
        "description": r.description,
        "status": r.status,
        "adminNotes": r.admin_notes,
        "createdAt": r.created_at.and_utc().to_rfc3339(),
        "reviewedAt": r.reviewed_at.map(|t| t.and_utc().to_rfc3339()),
        "reviewedBy": r.reviewed_by,
        "messageContent": r.message_content,
        "reporterName": r.reporter_name,
        "reporterUsername": r.reporter_username,
        "senderUserId": r.sender_user_id,
        "senderAgentId": r.sender_agent_id,
        "senderName": r.sender_name,
        "senderUsername": r.sender_username,
        "senderImage": r.sender_image,
        "senderIsVerified": r.sender_is_verified.unwrap_or(false),
        "senderAgentName": r.sender_agent_name,
    })
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/messages/{messageId}/report", post(create_report))
        .route("/api/admin/reports", get(list_reports))
        .route(
            "/api/admin/reports/{reportId}",
            get(get_report).patch(update_report),
        )
}

#[derive(Deserialize)]
struct CreateReportBody {
    reason: String,
    description: Option<String>,
}

async fn create_report(
    State(state): State<AppState>,
    user: AuthUser,
    Path(message_id): Path<Uuid>,
    Json(body): Json<CreateReportBody>,
) -> Response {
    let reason = body.reason.trim();
    if reason.is_empty() || reason.len() > 100 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "reason is required (max 100 chars)"})),
        )
            .into_response();
    }
    let description = body
        .description
        .as_deref()
        .map(|d| &d[..d.len().min(500)]);

    // Verify message exists and user has access
    let msg = sqlx::query_as::<_, (Uuid,)>(
        r#"SELECT m.id FROM messages m
           JOIN conversations c ON m.conversation_id = c.id
           WHERE m.id = $1
             AND (c.user_id = $2 OR EXISTS (
               SELECT 1 FROM conversation_user_members cum
               WHERE cum.conversation_id = c.id AND cum.user_id = $2
             ))"#,
    )
    .bind(message_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match msg {
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Message not found"})),
            )
                .into_response()
        }
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
        _ => {}
    }

    // Create report (UNIQUE constraint prevents duplicates)
    let result = sqlx::query_as::<_, (Uuid, String)>(
        r#"INSERT INTO message_reports (message_id, reporter_user_id, reason, description)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (message_id, reporter_user_id) DO NOTHING
           RETURNING id, status"#,
    )
    .bind(message_id)
    .bind(&user.id)
    .bind(reason)
    .bind(description)
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some((id, status))) => (
            StatusCode::CREATED,
            Json(json!({"id": id, "status": status})),
        )
            .into_response(),
        Ok(None) => (
            StatusCode::CONFLICT,
            Json(json!({"error": "Already reported"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct ListReportsQuery {
    status: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

async fn list_reports(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Query(params): Query<ListReportsQuery>,
) -> Response {
    let page = params.page.unwrap_or(1).max(1);
    let limit = params.limit.unwrap_or(20).min(100);
    let offset = (page - 1) * limit;

    let (rows, total): (Vec<serde_json::Value>, i64) = if let Some(ref status) = params.status {
        let count =
            sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM message_reports WHERE status = $1")
                .bind(status)
                .fetch_one(&state.db)
                .await
                .map(|r| r.0)
                .unwrap_or(0);

        let rows: Vec<serde_json::Value> = sqlx::query_as::<_, ReportRow>(
            r#"SELECT r.id, r.message_id, r.reporter_user_id, r.reason, r.description,
                      r.status, r.admin_notes, r.created_at, r.reviewed_at, r.reviewed_by,
                      m.content AS message_content,
                      u.name AS reporter_name, u.username AS reporter_username,
                      m.sender_user_id, m.sender_agent_id,
                      sender.name AS sender_name, sender.username AS sender_username,
                      sender.image AS sender_image, sender.is_verified AS sender_is_verified,
                      agent.name AS sender_agent_name
               FROM message_reports r
               JOIN messages m ON r.message_id = m.id
               LEFT JOIN "user" u ON r.reporter_user_id = u.id
               LEFT JOIN "user" sender ON m.sender_user_id = sender.id
               LEFT JOIN agents agent ON m.sender_agent_id = agent.id
               WHERE r.status = $1
               ORDER BY r.created_at DESC
               LIMIT $2 OFFSET $3"#,
        )
        .bind(status)
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .iter()
        .map(report_to_json)
        .collect();

        (rows, count)
    } else {
        let count = sqlx::query_as::<_, (i64,)>("SELECT COUNT(*) FROM message_reports")
            .fetch_one(&state.db)
            .await
            .map(|r| r.0)
            .unwrap_or(0);

        let rows: Vec<serde_json::Value> = sqlx::query_as::<_, ReportRow>(
            r#"SELECT r.id, r.message_id, r.reporter_user_id, r.reason, r.description,
                      r.status, r.admin_notes, r.created_at, r.reviewed_at, r.reviewed_by,
                      m.content AS message_content,
                      u.name AS reporter_name, u.username AS reporter_username,
                      m.sender_user_id, m.sender_agent_id,
                      sender.name AS sender_name, sender.username AS sender_username,
                      sender.image AS sender_image, sender.is_verified AS sender_is_verified,
                      agent.name AS sender_agent_name
               FROM message_reports r
               JOIN messages m ON r.message_id = m.id
               LEFT JOIN "user" u ON r.reporter_user_id = u.id
               LEFT JOIN "user" sender ON m.sender_user_id = sender.id
               LEFT JOIN agents agent ON m.sender_agent_id = agent.id
               ORDER BY r.created_at DESC
               LIMIT $1 OFFSET $2"#,
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
        .iter()
        .map(report_to_json)
        .collect();

        (rows, count)
    };

    (
        StatusCode::OK,
        Json(json!({"reports": rows, "total": total, "page": page, "limit": limit})),
    )
        .into_response()
}

async fn get_report(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Path(report_id): Path<Uuid>,
) -> Response {
    let result = sqlx::query_as::<_, ReportRow>(
        r#"SELECT r.id, r.message_id, r.reporter_user_id, r.reason, r.description,
                  r.status, r.admin_notes, r.created_at, r.reviewed_at, r.reviewed_by,
                  m.content AS message_content,
                  u.name AS reporter_name, u.username AS reporter_username,
                  m.sender_user_id, m.sender_agent_id,
                  sender.name AS sender_name, sender.username AS sender_username,
                  sender.image AS sender_image, sender.is_verified AS sender_is_verified,
                  agent.name AS sender_agent_name
           FROM message_reports r
           JOIN messages m ON r.message_id = m.id
           LEFT JOIN "user" u ON r.reporter_user_id = u.id
           LEFT JOIN "user" sender ON m.sender_user_id = sender.id
           LEFT JOIN agents agent ON m.sender_agent_id = agent.id
           WHERE r.id = $1"#,
    )
    .bind(report_id)
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(r)) => (
            StatusCode::OK,
            Json(report_to_json(&r)),
        )
            .into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Report not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct UpdateReportBody {
    status: String,
    #[serde(rename = "adminNotes")]
    admin_notes: Option<String>,
}

async fn update_report(
    State(state): State<AppState>,
    admin: AuthAdmin,
    Path(report_id): Path<Uuid>,
    Json(body): Json<UpdateReportBody>,
) -> Response {
    let valid_statuses = ["reviewing", "resolved", "dismissed"];
    if !valid_statuses.contains(&body.status.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid status"})),
        )
            .into_response();
    }

    let result = sqlx::query(
        r#"UPDATE message_reports SET status = $1, admin_notes = $2, reviewed_at = NOW(), reviewed_by = $3 WHERE id = $4"#,
    )
    .bind(&body.status)
    .bind(&body.admin_notes)
    .bind(&admin.id)
    .bind(report_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => (
            StatusCode::OK,
            Json(json!({"status": body.status})),
        )
            .into_response(),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Report not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
