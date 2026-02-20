use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, put},
    Router,
};
use chrono::NaiveDateTime;
use serde::Deserialize;
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::db::models::Conversation;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/api/conversations",
            get(list_conversations).post(create_conversation),
        )
        .route(
            "/api/conversations/{id}",
            get(get_conversation)
                .put(update_conversation)
                .delete(delete_conversation),
        )
        .route(
            "/api/conversations/{id}/messages",
            delete(clear_messages),
        )
        .route("/api/conversations/{id}/read", put(mark_read))
        .route("/api/conversations/{id}/mute", put(toggle_mute))
        .route("/api/conversations/{id}/status", get(get_status))
}

// ===== Request / Response types =====

#[derive(Deserialize)]
struct CreateConversationBody {
    #[serde(rename = "agentId")]
    agent_id: Uuid,
    title: Option<String>,
}

#[derive(Deserialize)]
struct ListQuery {
    q: Option<String>,
}

#[derive(Deserialize)]
struct UpdateConversationBody {
    title: Option<String>,
    pinned: Option<bool>,
}

#[derive(Deserialize)]
struct MuteBody {
    muted: bool,
}

/// Row type for the list conversations query (conversation + agent + last message).
#[derive(Debug, FromRow)]
struct ConversationListRow {
    // Conversation fields
    id: Uuid,
    title: Option<String>,
    #[sqlx(rename = "type")]
    conv_type: String,
    user_id: String,
    agent_id: Option<Uuid>,
    pinned_at: Option<NaiveDateTime>,
    created_at: NaiveDateTime,
    updated_at: NaiveDateTime,
    // Agent fields
    agent_name: Option<String>,
    agent_description: Option<String>,
    agent_avatar_url: Option<String>,
    // Last message fields
    last_msg_id: Option<Uuid>,
    last_msg_seq: Option<i32>,
    last_msg_role: Option<String>,
    last_msg_content: Option<String>,
    last_msg_status: Option<String>,
    last_msg_created_at: Option<NaiveDateTime>,
    last_msg_updated_at: Option<NaiveDateTime>,
}

/// Row for group member names batch fetch.
#[derive(Debug, FromRow)]
struct GroupMemberRow {
    conversation_id: Uuid,
    name: String,
}

// ===== Handlers =====

/// POST /api/conversations - Create a new conversation
async fn create_conversation(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateConversationBody>,
) -> Response {
    // Verify agent exists and belongs to user
    let agent = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM agents WHERE id = $1 AND owner_id = $2",
    )
    .bind(body.agent_id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match agent {
        Ok(Some(_)) => {}
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
    }

    let result = sqlx::query_as::<_, Conversation>(
        r#"INSERT INTO conversations (title, type, user_id, agent_id)
           VALUES ($1, 'direct', $2, $3)
           RETURNING *"#,
    )
    .bind(&body.title)
    .bind(&user.id)
    .bind(body.agent_id)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(conv) => (StatusCode::CREATED, Json(json!(conv))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/conversations - List conversations with last message preview and agent info
async fn list_conversations(
    State(state): State<AppState>,
    user: AuthUser,
    Query(params): Query<ListQuery>,
) -> Response {
    let rows = if let Some(ref q) = params.q {
        let pattern = format!("%{}%", q);
        sqlx::query_as::<_, ConversationListRow>(
            r#"SELECT
                c.id,
                c.title,
                c.type::text,
                c.user_id,
                c.agent_id,
                c.pinned_at,
                c.created_at,
                c.updated_at,
                a.name AS agent_name,
                a.description AS agent_description,
                a.avatar_url AS agent_avatar_url,
                lm.id AS last_msg_id,
                lm.seq AS last_msg_seq,
                lm.role::text AS last_msg_role,
                lm.content AS last_msg_content,
                lm.status::text AS last_msg_status,
                lm.created_at AS last_msg_created_at,
                lm.updated_at AS last_msg_updated_at
            FROM conversations c
            LEFT JOIN agents a ON c.agent_id = a.id
            LEFT JOIN LATERAL (
                SELECT m.id, m.seq, m.role, m.content, m.status, m.created_at, m.updated_at
                FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC
                LIMIT 1
            ) lm ON true
            WHERE c.user_id = $1
              AND (c.title ILIKE $2 OR a.name ILIKE $2)
            ORDER BY c.pinned_at DESC NULLS LAST, c.updated_at DESC"#,
        )
        .bind(&user.id)
        .bind(&pattern)
        .fetch_all(&state.db)
        .await
    } else {
        sqlx::query_as::<_, ConversationListRow>(
            r#"SELECT
                c.id,
                c.title,
                c.type::text,
                c.user_id,
                c.agent_id,
                c.pinned_at,
                c.created_at,
                c.updated_at,
                a.name AS agent_name,
                a.description AS agent_description,
                a.avatar_url AS agent_avatar_url,
                lm.id AS last_msg_id,
                lm.seq AS last_msg_seq,
                lm.role::text AS last_msg_role,
                lm.content AS last_msg_content,
                lm.status::text AS last_msg_status,
                lm.created_at AS last_msg_created_at,
                lm.updated_at AS last_msg_updated_at
            FROM conversations c
            LEFT JOIN agents a ON c.agent_id = a.id
            LEFT JOIN LATERAL (
                SELECT m.id, m.seq, m.role, m.content, m.status, m.created_at, m.updated_at
                FROM messages m
                WHERE m.conversation_id = c.id
                ORDER BY m.created_at DESC
                LIMIT 1
            ) lm ON true
            WHERE c.user_id = $1
            ORDER BY c.pinned_at DESC NULLS LAST, c.updated_at DESC"#,
        )
        .bind(&user.id)
        .fetch_all(&state.db)
        .await
    };

    let rows = match rows {
        Ok(r) => r,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    // For group conversations, batch-fetch member names
    let group_ids: Vec<Uuid> = rows
        .iter()
        .filter(|r| r.conv_type == "group")
        .map(|r| r.id)
        .collect();

    let mut group_member_names: std::collections::HashMap<Uuid, Vec<String>> =
        std::collections::HashMap::new();

    if !group_ids.is_empty() {
        // Build a parameterised IN clause
        let placeholders: Vec<String> = group_ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("${}", i + 1))
            .collect();
        let query_str = format!(
            r#"SELECT cm.conversation_id, a.name
               FROM conversation_members cm
               INNER JOIN agents a ON cm.agent_id = a.id
               WHERE cm.conversation_id IN ({})"#,
            placeholders.join(", ")
        );

        let mut q = sqlx::query_as::<_, GroupMemberRow>(&query_str);
        for gid in &group_ids {
            q = q.bind(gid);
        }

        if let Ok(members) = q.fetch_all(&state.db).await {
            for m in members {
                group_member_names
                    .entry(m.conversation_id)
                    .or_default()
                    .push(m.name);
            }
        }
    }

    // Build result JSON matching the TypeScript shape
    let result: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            let (agent_name, agent_description) = if row.conv_type == "group" {
                let names = group_member_names
                    .get(&row.id)
                    .cloned()
                    .unwrap_or_default();
                let name = if names.is_empty() {
                    "Empty group".to_string()
                } else {
                    names.join(", ")
                };
                let desc = format!(
                    "{} agent{}",
                    names.len(),
                    if names.len() != 1 { "s" } else { "" }
                );
                (name, Some(desc))
            } else {
                (
                    row.agent_name.clone().unwrap_or_else(|| "Unknown".to_string()),
                    row.agent_description.clone(),
                )
            };

            let last_message = if let Some(msg_id) = row.last_msg_id {
                json!({
                    "id": msg_id,
                    "conversationId": row.id,
                    "seq": row.last_msg_seq,
                    "role": row.last_msg_role,
                    "content": row.last_msg_content,
                    "status": row.last_msg_status,
                    "createdAt": row.last_msg_created_at,
                    "updatedAt": row.last_msg_updated_at,
                })
            } else {
                serde_json::Value::Null
            };

            json!({
                "id": row.id,
                "title": row.title,
                "type": row.conv_type,
                "userId": row.user_id,
                "agentId": row.agent_id,
                "pinnedAt": row.pinned_at,
                "createdAt": row.created_at,
                "updatedAt": row.updated_at,
                "agentName": agent_name,
                "agentDescription": agent_description,
                "agentAvatarUrl": row.agent_avatar_url,
                "lastMessage": last_message,
            })
        })
        .collect();

    Json(json!(result)).into_response()
}

/// GET /api/conversations/:id - Get single conversation
async fn get_conversation(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let result = sqlx::query_as::<_, Conversation>(
        "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(conv)) => Json(json!(conv)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Conversation not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// PUT /api/conversations/:id - Update conversation (rename, pin/unpin)
async fn update_conversation(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateConversationBody>,
) -> Response {
    // Build dynamic update. We always set updated_at.
    // For title: use COALESCE($3, title) when not provided.
    // For pinned_at: if body.pinned is Some(true) => NOW(), Some(false) => NULL, None => keep.
    //
    // We handle this with a single query using CASE expressions.
    let result = sqlx::query_as::<_, Conversation>(
        r#"UPDATE conversations SET
            title = CASE WHEN $3::boolean THEN $4 ELSE title END,
            pinned_at = CASE
                WHEN $5::boolean AND $6::boolean THEN NOW()
                WHEN $5::boolean AND NOT $6::boolean THEN NULL
                ELSE pinned_at
            END,
            updated_at = NOW()
           WHERE id = $1 AND user_id = $2
           RETURNING *"#,
    )
    .bind(id)
    .bind(&user.id)
    .bind(body.title.is_some())    // $3: whether title was provided
    .bind(&body.title)             // $4: the new title value
    .bind(body.pinned.is_some())   // $5: whether pinned was provided
    .bind(body.pinned.unwrap_or(false)) // $6: the pinned value
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(conv)) => Json(json!(conv)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Conversation not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// DELETE /api/conversations/:id - Delete conversation (messages cascade)
async fn delete_conversation(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let result = sqlx::query_as::<_, Conversation>(
        "DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING *",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match result {
        Ok(Some(_)) => StatusCode::NO_CONTENT.into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Conversation not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// DELETE /api/conversations/{id}/messages - Clear all messages in a conversation
async fn clear_messages(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    // Verify ownership
    let conv = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match conv {
        Ok(Some(_)) => {}
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Conversation not found"})),
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
    }

    // Count messages before deleting
    let count_result = sqlx::query_as::<_, (i64,)>(
        "SELECT count(*) FROM messages WHERE conversation_id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await;

    let msg_count = match count_result {
        Ok((c,)) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    // Delete all messages
    if let Err(e) = sqlx::query("DELETE FROM messages WHERE conversation_id = $1")
        .bind(id)
        .execute(&state.db)
        .await
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response();
    }

    Json(json!({"success": true, "deleted": msg_count})).into_response()
}

/// PUT /api/conversations/{id}/read - Mark conversation as read
async fn mark_read(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    // Verify conversation belongs to user
    let conv = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match conv {
        Ok(Some(_)) => {}
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Conversation not found"})),
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
    }

    // Get max seq
    let max_seq_result = sqlx::query_as::<_, (i32,)>(
        "SELECT COALESCE(MAX(seq), 0)::int FROM messages WHERE conversation_id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await;

    let max_seq = match max_seq_result {
        Ok((s,)) => s,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    // Upsert conversation_reads
    let upsert_result = sqlx::query(
        r#"INSERT INTO conversation_reads (id, user_id, conversation_id, last_read_seq, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, NOW())
           ON CONFLICT (user_id, conversation_id)
           DO UPDATE SET
             last_read_seq = GREATEST(conversation_reads.last_read_seq, EXCLUDED.last_read_seq),
             updated_at = NOW()"#,
    )
    .bind(&user.id)
    .bind(id)
    .bind(max_seq)
    .execute(&state.db)
    .await;

    match upsert_result {
        Ok(_) => Json(json!({"lastReadSeq": max_seq})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// PUT /api/conversations/{id}/mute - Toggle mute on a conversation
async fn toggle_mute(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<MuteBody>,
) -> Response {
    // Verify conversation belongs to user
    let conv = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match conv {
        Ok(Some(_)) => {}
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Conversation not found"})),
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
    }

    // Upsert conversation_reads with muted flag
    let upsert_result = sqlx::query(
        r#"INSERT INTO conversation_reads (id, user_id, conversation_id, last_read_seq, muted, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 0, $3, NOW())
           ON CONFLICT (user_id, conversation_id)
           DO UPDATE SET muted = $3, updated_at = NOW()"#,
    )
    .bind(&user.id)
    .bind(id)
    .bind(body.muted)
    .execute(&state.db)
    .await;

    match upsert_result {
        Ok(_) => Json(json!({"muted": body.muted})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/conversations/{id}/status - Get conversation status info
async fn get_status(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    // Fetch conversation
    let conv = sqlx::query_as::<_, Conversation>(
        "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    let conv = match conv {
        Ok(Some(c)) => c,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Conversation not found"})),
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

    // Count messages
    let msg_count = sqlx::query_as::<_, (i64,)>(
        "SELECT count(*) FROM messages WHERE conversation_id = $1",
    )
    .bind(conv.id)
    .fetch_one(&state.db)
    .await
    .map(|(c,)| c)
    .unwrap_or(0);

    // Get agent info and health check
    let agent_info = if let Some(agent_id) = conv.agent_id {
        #[derive(Debug, FromRow)]
        struct AgentRow {
            id: Uuid,
            name: String,
            a2a_endpoint: Option<String>,
        }

        let agent = sqlx::query_as::<_, AgentRow>(
            "SELECT id, name, a2a_endpoint FROM agents WHERE id = $1",
        )
        .bind(agent_id)
        .fetch_optional(&state.db)
        .await;

        match agent {
            Ok(Some(agent)) => {
                let (status, latency_ms) = if let Some(ref endpoint) = agent.a2a_endpoint {
                    // Health check via HTTP GET with 5s timeout
                    let client = reqwest::Client::new();
                    let start = std::time::Instant::now();
                    match client
                        .get(endpoint)
                        .timeout(std::time::Duration::from_secs(5))
                        .send()
                        .await
                    {
                        Ok(resp) => {
                            let latency = start.elapsed().as_millis() as i64;
                            if resp.status().is_success() {
                                ("online", Some(latency))
                            } else {
                                ("error", Some(latency))
                            }
                        }
                        Err(_) => ("offline", None),
                    }
                } else {
                    ("offline", None)
                };

                Some(json!({
                    "id": agent.id,
                    "name": agent.name,
                    "a2aEndpoint": agent.a2a_endpoint,
                    "status": status,
                    "latencyMs": latency_ms,
                }))
            }
            _ => None,
        }
    } else {
        None
    };

    Json(json!({
        "conversation": {
            "id": conv.id,
            "title": conv.title,
            "type": conv.conv_type,
            "createdAt": conv.created_at,
            "messageCount": msg_count,
        },
        "agent": agent_info,
    }))
    .into_response()
}
