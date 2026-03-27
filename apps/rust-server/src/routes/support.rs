use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{Json, Response, IntoResponse},
    routing::{get, patch, post},
    Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::{AuthUser, AuthAdmin};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/support/tickets", post(create_ticket).get(my_tickets))
        .route("/api/admin/tickets", get(list_tickets))
        .route("/api/admin/tickets/{id}", patch(update_ticket))
        // Aliases for existing admin page
        .route("/api/admin/support-tickets", get(list_tickets_wrapped))
        .route("/api/admin/support-tickets/{id}/reply", post(reply_ticket))
}

// ===== User endpoints =====

#[derive(Deserialize)]
struct CreateTicketBody {
    subject: String,
    description: String,
}

async fn create_ticket(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateTicketBody>,
) -> Response {
    if body.subject.trim().is_empty() || body.description.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Subject and description required"}))).into_response();
    }

    let result = sqlx::query_scalar::<_, Uuid>(
        r#"INSERT INTO support_tickets (user_id, subject, description)
           VALUES ($1, $2, $3)
           RETURNING id"#,
    )
    .bind(&user.id)
    .bind(body.subject.trim())
    .bind(body.description.trim())
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(id) => (StatusCode::CREATED, Json(json!({"id": id, "status": "open"}))).into_response(),
        Err(e) => {
            tracing::error!("create_ticket: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Failed to create ticket"}))).into_response()
        }
    }
}

async fn my_tickets(
    State(state): State<AppState>,
    user: AuthUser,
) -> Response {
    let rows = sqlx::query_as::<_, (Uuid, String, String, String, Option<String>, DateTime<Utc>, DateTime<Utc>)>(
        r#"SELECT id, subject, description, status, admin_reply, created_at, updated_at
           FROM support_tickets
           WHERE user_id = $1
           ORDER BY created_at DESC"#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let tickets: Vec<Value> = rows.into_iter().map(|(id, subject, desc, status, reply, created, updated)| {
        json!({
            "id": id,
            "subject": subject,
            "description": desc,
            "status": status,
            "adminReply": reply,
            "createdAt": created.to_rfc3339(),
            "updatedAt": updated.to_rfc3339(),
        })
    }).collect();

    Json(json!(tickets)).into_response()
}

// ===== Admin endpoints =====

#[derive(Deserialize)]
struct ListTicketsQuery {
    status: Option<String>,
}

async fn list_tickets(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Query(q): Query<ListTicketsQuery>,
) -> Response {
    // AuthAdmin already verified admin status

    let rows = if let Some(ref status) = q.status {
        sqlx::query_as::<_, (Uuid, String, String, String, String, Option<String>, DateTime<Utc>, DateTime<Utc>, Option<String>)>(
            r#"SELECT t.id, t.user_id, t.subject, t.description, t.status, t.admin_reply, t.created_at, t.updated_at, u.name
               FROM support_tickets t
               JOIN "user" u ON u.id = t.user_id
               WHERE t.status = $1
               ORDER BY t.created_at DESC"#,
        )
        .bind(status)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    } else {
        sqlx::query_as::<_, (Uuid, String, String, String, String, Option<String>, DateTime<Utc>, DateTime<Utc>, Option<String>)>(
            r#"SELECT t.id, t.user_id, t.subject, t.description, t.status, t.admin_reply, t.created_at, t.updated_at, u.name
               FROM support_tickets t
               JOIN "user" u ON u.id = t.user_id
               ORDER BY t.created_at DESC"#,
        )
        .fetch_all(&state.db)
        .await
        .unwrap_or_default()
    };

    let tickets: Vec<Value> = rows.into_iter().map(|(id, uid, subject, desc, status, reply, created, updated, name)| {
        json!({
            "id": id,
            "userId": uid,
            "userName": name,
            "subject": subject,
            "description": desc,
            "status": status,
            "adminReply": reply,
            "createdAt": created.to_rfc3339(),
            "updatedAt": updated.to_rfc3339(),
        })
    }).collect();

    Json(json!(tickets)).into_response()
}

#[derive(Deserialize)]
struct UpdateTicketBody {
    status: Option<String>,
    #[serde(rename = "adminReply")]
    admin_reply: Option<String>,
}

async fn update_ticket(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateTicketBody>,
) -> Response {
    let mut set_clauses = Vec::new();
    let mut idx = 2;

    if body.status.is_some() {
        set_clauses.push(format!("status = ${}", idx));
        idx += 1;
    }
    if body.admin_reply.is_some() {
        set_clauses.push(format!("admin_reply = ${}", idx));
        idx += 1;
    }

    if set_clauses.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "No fields to update"}))).into_response();
    }

    set_clauses.push("updated_at = NOW()".to_string());
    let sql = format!("UPDATE support_tickets SET {} WHERE id = $1", set_clauses.join(", "));

    let mut q = sqlx::query(&sql).bind(id);
    if let Some(ref s) = body.status { q = q.bind(s); }
    if let Some(ref r) = body.admin_reply { q = q.bind(r); }

    match q.execute(&state.db).await {
        Ok(r) if r.rows_affected() > 0 => Json(json!({"ok": true})).into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Ticket not found"}))).into_response(),
        Err(e) => {
            tracing::error!("update_ticket: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"}))).into_response()
        }
    }
}

// Wrapper for existing admin page that expects { tickets: [...] }
async fn list_tickets_wrapped(
    State(state): State<AppState>,
    admin: AuthAdmin,
    Query(q): Query<ListTicketsQuery>,
) -> Response {
    // Reuse list_tickets but wrap in { tickets: [...] }
    let rows = sqlx::query_as::<_, (Uuid, String, String, String, String, Option<String>, DateTime<Utc>, DateTime<Utc>, Option<String>)>(
        r#"SELECT t.id, t.user_id, t.subject, t.description, t.status, t.admin_reply, t.created_at, t.updated_at, u.name
           FROM support_tickets t
           JOIN "user" u ON u.id = t.user_id
           ORDER BY t.created_at DESC"#,
    )
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let tickets: Vec<Value> = rows.into_iter().map(|(id, uid, subject, desc, status, reply, created, updated, name)| {
        json!({
            "id": id, "userId": uid, "userName": name, "subject": subject,
            "description": desc, "status": status, "adminReply": reply,
            "createdAt": created.to_rfc3339(), "updatedAt": updated.to_rfc3339(),
        })
    }).collect();

    Json(json!({ "tickets": tickets })).into_response()
}

#[derive(Deserialize)]
struct ReplyBody {
    reply: String,
}

async fn reply_ticket(
    State(state): State<AppState>,
    _admin: AuthAdmin,
    Path(id): Path<Uuid>,
    Json(body): Json<ReplyBody>,
) -> Response {
    let result = sqlx::query(
        "UPDATE support_tickets SET admin_reply = $2, status = 'resolved', updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .bind(&body.reply)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Json(json!({"ok": true})).into_response(),
        Ok(_) => (StatusCode::NOT_FOUND, Json(json!({"error": "Ticket not found"}))).into_response(),
        Err(e) => {
            tracing::error!("reply_ticket: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": "Database error"}))).into_response()
        }
    }
}
