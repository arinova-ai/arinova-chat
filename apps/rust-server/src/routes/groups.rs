use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post},
    Router,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/conversations/group", post(create_group))
        .route(
            "/api/conversations/{id}/members",
            get(list_members).post(add_member),
        )
        .route(
            "/api/conversations/{id}/members/{agentId}",
            delete(remove_member),
        )
}

#[derive(Deserialize)]
struct CreateGroupBody {
    title: Option<String>,
    #[serde(rename = "agentIds")]
    agent_ids: Vec<Uuid>,
}

#[derive(Deserialize)]
struct AddMemberBody {
    #[serde(rename = "agentId")]
    agent_id: Uuid,
}

async fn create_group(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateGroupBody>,
) -> Response {
    if body.agent_ids.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "At least one agent is required"})),
        )
            .into_response();
    }

    // Verify all agents belong to the user
    for agent_id in &body.agent_ids {
        let exists = sqlx::query_as::<_, (Uuid,)>(
            "SELECT id FROM agents WHERE id = $1 AND owner_id = $2",
        )
        .bind(agent_id)
        .bind(&user.id)
        .fetch_optional(&state.db)
        .await;

        if matches!(exists, Ok(None) | Err(_)) {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": format!("Agent {} not found or not owned by user", agent_id)})),
            )
                .into_response();
        }
    }

    let conv_id = Uuid::new_v4();
    let title = body.title.clone().unwrap_or_else(|| "Group Chat".to_string());

    // Create group conversation
    let result = sqlx::query(
        r#"INSERT INTO conversations (id, title, "type", user_id)
           VALUES ($1, $2, 'group', $3)"#,
    )
    .bind(conv_id)
    .bind(&title)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    if let Err(e) = result {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response();
    }

    // Add all agents as members
    for agent_id in &body.agent_ids {
        let member_id = Uuid::new_v4();
        if let Err(e) = sqlx::query(
            "INSERT INTO conversation_members (id, conversation_id, agent_id) VALUES ($1, $2, $3)",
        )
        .bind(member_id)
        .bind(conv_id)
        .bind(agent_id)
        .execute(&state.db)
        .await
        {
            tracing::error!("Failed to add member {}: {}", agent_id, e);
        }
    }

    // Fetch the created conversation
    let conv = sqlx::query_as::<_, crate::db::models::Conversation>(
        "SELECT * FROM conversations WHERE id = $1",
    )
    .bind(conv_id)
    .fetch_one(&state.db)
    .await;

    match conv {
        Ok(conv) => (StatusCode::CREATED, Json(json!(conv))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn list_members(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    // Verify the user owns this conversation
    let conv = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    if matches!(conv, Ok(None) | Err(_)) {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Conversation not found"})),
        )
            .into_response();
    }

    // Fetch members with agent info
    let members = sqlx::query_as::<_, (Uuid, Uuid, Uuid, chrono::NaiveDateTime, String, Option<String>, Option<String>)>(
        r#"SELECT cm.id, cm.conversation_id, cm.agent_id, cm.added_at,
                  a.name, a.description, a.avatar_url
           FROM conversation_members cm
           JOIN agents a ON a.id = cm.agent_id
           WHERE cm.conversation_id = $1
           ORDER BY cm.added_at"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match members {
        Ok(rows) => {
            let result: Vec<serde_json::Value> = rows
                .iter()
                .map(|r| {
                    json!({
                        "id": r.0,
                        "conversationId": r.1,
                        "agentId": r.2,
                        "addedAt": r.3,
                        "agent": {
                            "id": r.2,
                            "name": r.4,
                            "description": r.5,
                            "avatarUrl": r.6,
                        }
                    })
                })
                .collect();
            Json(json!(result)).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn add_member(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<AddMemberBody>,
) -> Response {
    // Verify the user owns this conversation and it's a group
    let conv = sqlx::query_as::<_, (Uuid, String)>(
        r#"SELECT id, "type"::text FROM conversations WHERE id = $1 AND user_id = $2"#,
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match &conv {
        Ok(Some((_, conv_type))) if conv_type != "group" => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Can only add members to group conversations"})),
            )
                .into_response();
        }
        Ok(None) | Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Conversation not found"})),
            )
                .into_response();
        }
        _ => {}
    }

    // Verify agent belongs to user
    let agent = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM agents WHERE id = $1 AND owner_id = $2",
    )
    .bind(body.agent_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    if matches!(agent, Ok(None) | Err(_)) {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Agent not found"})),
        )
            .into_response();
    }

    // Check if already a member
    let existing = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM conversation_members WHERE conversation_id = $1 AND agent_id = $2",
    )
    .bind(id)
    .bind(body.agent_id)
    .fetch_optional(&state.db)
    .await;

    if matches!(existing, Ok(Some(_))) {
        return (
            StatusCode::CONFLICT,
            Json(json!({"error": "Agent is already a member"})),
        )
            .into_response();
    }

    let member_id = Uuid::new_v4();
    let result = sqlx::query_as::<_, crate::db::models::ConversationMember>(
        r#"INSERT INTO conversation_members (id, conversation_id, agent_id)
           VALUES ($1, $2, $3)
           RETURNING *"#,
    )
    .bind(member_id)
    .bind(id)
    .bind(body.agent_id)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(member) => (StatusCode::CREATED, Json(json!(member))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct RemoveMemberPath {
    id: Uuid,
    #[serde(rename = "agentId")]
    agent_id: Uuid,
}

async fn remove_member(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, agent_id)): Path<(Uuid, Uuid)>,
) -> Response {
    // Verify the user owns this conversation
    let conv = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    if matches!(conv, Ok(None) | Err(_)) {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Conversation not found"})),
        )
            .into_response();
    }

    let result = sqlx::query(
        "DELETE FROM conversation_members WHERE conversation_id = $1 AND agent_id = $2",
    )
    .bind(id)
    .bind(agent_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Member not found"})),
        )
            .into_response(),
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
