use axum::{
    extract::{Multipart, Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post, put},
    Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::db::models::Agent;
use crate::utils::pairing_code::generate_secret_token;
use crate::ws::state::WsState;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/agents", post(create_agent).get(list_agents))
        .route(
            "/api/agents/{id}",
            get(get_agent).put(update_agent).delete(delete_agent),
        )
        .route("/api/agents/{id}/skills", get(get_skills))
        .route("/api/agents/{id}/avatar", post(upload_avatar))
        .route("/api/agents/{id}/regenerate-token", post(regenerate_token))
        .route("/api/agents/{id}/stats", get(get_stats))
        .route("/api/agents/{id}/history", delete(clear_history))
        .route("/api/agents/{id}/export", get(export_history))
}

#[derive(Deserialize)]
struct CreateAgentBody {
    name: String,
    description: Option<String>,
    #[serde(rename = "a2aEndpoint")]
    a2a_endpoint: Option<String>,
}

#[derive(Deserialize)]
struct UpdateAgentBody {
    name: Option<String>,
    description: Option<String>,
    #[serde(rename = "a2aEndpoint")]
    a2a_endpoint: Option<String>,
    #[serde(rename = "systemPrompt")]
    system_prompt: Option<String>,
    #[serde(rename = "welcomeMessage")]
    welcome_message: Option<String>,
    #[serde(rename = "quickReplies")]
    quick_replies: Option<serde_json::Value>,
    #[serde(rename = "notificationsEnabled")]
    notifications_enabled: Option<bool>,
    #[serde(rename = "isPublic")]
    is_public: Option<bool>,
    category: Option<String>,
}

#[derive(Deserialize)]
struct ExportQuery {
    format: Option<String>,
}

async fn create_agent(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateAgentBody>,
) -> Response {
    let token = generate_secret_token();

    let result = sqlx::query_as::<_, Agent>(
        r#"INSERT INTO agents (name, description, a2a_endpoint, secret_token, owner_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *"#,
    )
    .bind(&body.name)
    .bind(&body.description)
    .bind(&body.a2a_endpoint)
    .bind(&token)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(agent) => (StatusCode::CREATED, Json(json!(agent))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn list_agents(State(state): State<AppState>, user: AuthUser) -> Response {
    let agents = sqlx::query_as::<_, Agent>(
        "SELECT * FROM agents WHERE owner_id = $1 ORDER BY created_at",
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    match agents {
        Ok(agents) => Json(json!(agents)).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn get_agent(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let agent = sqlx::query_as::<_, Agent>(
        "SELECT * FROM agents WHERE id = $1 AND owner_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match agent {
        Ok(Some(agent)) => Json(json!(agent)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Agent not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn update_agent(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateAgentBody>,
) -> Response {
    // Build dynamic update query
    let mut sets = vec!["updated_at = NOW()".to_string()];
    let mut param_idx = 3u32; // $1 = id, $2 = owner_id

    // We'll use a simpler approach - update all provided fields
    let result = sqlx::query_as::<_, Agent>(
        r#"UPDATE agents SET
           name = COALESCE($3, name),
           description = COALESCE($4, description),
           a2a_endpoint = COALESCE($5, a2a_endpoint),
           system_prompt = COALESCE($6, system_prompt),
           welcome_message = COALESCE($7, welcome_message),
           quick_replies = COALESCE($8, quick_replies),
           notifications_enabled = COALESCE($9, notifications_enabled),
           is_public = COALESCE($10, is_public),
           category = COALESCE($11, category),
           updated_at = NOW()
           WHERE id = $1 AND owner_id = $2
           RETURNING *"#,
    )
    .bind(id)
    .bind(&user.id)
    .bind(&body.name)
    .bind(&body.description)
    .bind(&body.a2a_endpoint)
    .bind(&body.system_prompt)
    .bind(&body.welcome_message)
    .bind(&body.quick_replies)
    .bind(body.notifications_enabled)
    .bind(body.is_public)
    .bind(&body.category)
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(agent)) => Json(json!(agent)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Agent not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn get_skills(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let agent = sqlx::query_as::<_, (Uuid, Option<String>)>(
        "SELECT id, a2a_endpoint FROM agents WHERE id = $1 AND owner_id = $2",
    )
    .bind(id)
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

    // Check WS-declared skills
    let ws_skills = state.ws.get_agent_skills(&agent_id.to_string());
    if !ws_skills.is_empty() {
        return Json(json!({"skills": ws_skills})).into_response();
    }

    // Fallback: fetch from A2A card
    if let Some(endpoint) = a2a_endpoint {
        if let Ok(resp) = reqwest::Client::new()
            .get(&endpoint)
            .header("Accept", "application/json")
            .timeout(std::time::Duration::from_secs(5))
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(card) = resp.json::<Value>().await {
                    if let Some(skills) = card.get("skills").and_then(|s| s.as_array()) {
                        let mapped: Vec<Value> = skills
                            .iter()
                            .map(|s| {
                                json!({
                                    "id": s.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                                    "name": s.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                                    "description": s.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                                })
                            })
                            .collect();
                        return Json(json!({"skills": mapped})).into_response();
                    }
                }
            }
        }
    }

    Json(json!({"skills": []})).into_response()
}

async fn upload_avatar(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    mut multipart: Multipart,
) -> Response {
    // Verify ownership
    let agent = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM agents WHERE id = $1 AND owner_id = $2",
    )
    .bind(id)
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

    while let Ok(Some(field)) = multipart.next_field().await {
        let content_type = field.content_type().unwrap_or("").to_string();
        if !content_type.starts_with("image/") {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Only image files are allowed"})),
            )
                .into_response();
        }

        let filename = field
            .file_name()
            .unwrap_or("avatar.jpg")
            .to_string();
        let data = match field.bytes().await {
            Ok(d) => d,
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": "Failed to read file"})),
                )
                    .into_response();
            }
        };

        if data.len() > 2 * 1024 * 1024 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Avatar must be under 2MB"})),
            )
                .into_response();
        }

        let ext = filename.rsplit('.').next().unwrap_or("jpg");
        let stored = format!("avatar_{}_{}.{}", id, chrono::Utc::now().timestamp(), ext);
        let r2_key = format!("avatars/{}", stored);

        let avatar_url = if let Some(s3) = &state.s3 {
            match crate::services::r2::upload_to_r2(s3, &state.config.r2_bucket, &r2_key, data.to_vec(), &content_type, &state.config.r2_public_url).await {
                Ok(url) => url,
                Err(_) => format!("/uploads/avatars/{}", stored),
            }
        } else {
            let dir = std::path::Path::new(&state.config.upload_dir).join("avatars");
            let _ = tokio::fs::create_dir_all(&dir).await;
            let _ = tokio::fs::write(dir.join(&stored), &data).await;
            format!("/uploads/avatars/{}", stored)
        };

        let _ = sqlx::query(
            "UPDATE agents SET avatar_url = $1, updated_at = NOW() WHERE id = $2",
        )
        .bind(&avatar_url)
        .bind(id)
        .execute(&state.db)
        .await;

        return Json(json!({"avatarUrl": avatar_url})).into_response();
    }

    (
        StatusCode::BAD_REQUEST,
        Json(json!({"error": "No file uploaded"})),
    )
        .into_response()
}

async fn regenerate_token(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let agent = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM agents WHERE id = $1 AND owner_id = $2",
    )
    .bind(id)
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

    let new_token = generate_secret_token();
    let _ = sqlx::query("UPDATE agents SET secret_token = $1, updated_at = NOW() WHERE id = $2")
        .bind(&new_token)
        .bind(id)
        .execute(&state.db)
        .await;

    Json(json!({"secretToken": new_token})).into_response()
}

async fn get_stats(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let agent = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM agents WHERE id = $1 AND owner_id = $2",
    )
    .bind(id)
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

    let stats = sqlx::query_as::<_, (i64, Option<chrono::NaiveDateTime>)>(
        r#"SELECT COUNT(*)::bigint, MAX(m.created_at)
           FROM messages m
           JOIN conversations c ON m.conversation_id = c.id
           WHERE c.agent_id = $1 AND c.user_id = $2"#,
    )
    .bind(id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    let conv_count = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*)::bigint FROM conversations WHERE agent_id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    let (total_messages, last_active) = stats.unwrap_or((0, None));
    let total_conversations = conv_count.map(|c| c.0).unwrap_or(0);

    Json(json!({
        "totalMessages": total_messages,
        "totalConversations": total_conversations,
        "lastActive": last_active,
    }))
    .into_response()
}

async fn clear_history(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let agent = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM agents WHERE id = $1 AND owner_id = $2",
    )
    .bind(id)
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

    let _ = sqlx::query(
        "DELETE FROM conversations WHERE agent_id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    StatusCode::NO_CONTENT.into_response()
}

async fn export_history(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Query(query): Query<ExportQuery>,
) -> Response {
    let format = query.format.as_deref().unwrap_or("json");

    let agent = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT id, name FROM agents WHERE id = $1 AND owner_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    let (_, agent_name) = match agent {
        Ok(Some(a)) => a,
        _ => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Agent not found"})),
            )
                .into_response();
        }
    };

    let convos = sqlx::query_as::<_, crate::db::models::Conversation>(
        "SELECT * FROM conversations WHERE agent_id = $1 AND user_id = $2 ORDER BY created_at",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let mut result = Vec::new();
    for convo in &convos {
        let msgs = sqlx::query_as::<_, crate::db::models::Message>(
            "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at",
        )
        .bind(convo.id)
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        result.push(json!({
            "conversationId": convo.id,
            "title": convo.title,
            "createdAt": convo.created_at.and_utc().to_rfc3339(),
            "messages": msgs.iter().map(|m| json!({
                "role": m.role,
                "content": m.content,
                "status": m.status,
                "createdAt": m.created_at.and_utc().to_rfc3339(),
            })).collect::<Vec<_>>(),
        }));
    }

    if format == "markdown" {
        let mut md = format!("# Chat Export: {}\n\n", agent_name);
        for convo in &result {
            let title = convo["title"].as_str().unwrap_or("Untitled");
            md.push_str(&format!("## {}\n\n", title));
            if let Some(msgs) = convo["messages"].as_array() {
                for msg in msgs {
                    let role = if msg["role"].as_str() == Some("user") {
                        "You"
                    } else {
                        &agent_name
                    };
                    let content = msg["content"].as_str().unwrap_or("");
                    md.push_str(&format!("**{}**\n{}\n\n", role, content));
                }
            }
            md.push_str("---\n\n");
        }

        let mut resp = md.into_response();
        resp.headers_mut().insert("content-type", "text/markdown".parse().unwrap());
        resp.headers_mut().insert(
            "content-disposition",
            format!("attachment; filename=\"{}-export.md\"", agent_name).parse().unwrap(),
        );
        return resp;
    }

    let mut resp = Json(json!({
        "agent": agent_name,
        "exportedAt": chrono::Utc::now(),
        "conversations": result,
    }))
    .into_response();
    resp.headers_mut().insert("content-type", "application/json".parse().unwrap());
    resp.headers_mut().insert(
        "content-disposition",
        format!("attachment; filename=\"{}-export.json\"", agent_name).parse().unwrap(),
    );
    resp
}

async fn delete_agent(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let agent = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM agents WHERE id = $1 AND owner_id = $2",
    )
    .bind(id)
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

    // Clean up references
    let _ = sqlx::query("DELETE FROM conversation_members WHERE agent_id = $1")
        .bind(id)
        .execute(&state.db)
        .await;

    let direct_convos = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM conversations WHERE agent_id = $1",
    )
    .bind(id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    if !direct_convos.is_empty() {
        let conv_ids: Vec<Uuid> = direct_convos.into_iter().map(|c| c.0).collect();
        for conv_id in &conv_ids {
            let _ = sqlx::query("DELETE FROM messages WHERE conversation_id = $1")
                .bind(conv_id)
                .execute(&state.db)
                .await;
            let _ = sqlx::query("DELETE FROM conversations WHERE id = $1")
                .bind(conv_id)
                .execute(&state.db)
                .await;
        }
    }

    let _ = sqlx::query("UPDATE channels SET agent_id = NULL WHERE agent_id = $1")
        .bind(id)
        .execute(&state.db)
        .await;

    let _ = sqlx::query("DELETE FROM agents WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await;

    StatusCode::NO_CONTENT.into_response()
}
