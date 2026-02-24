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
    agent_id: Option<Uuid>,
    /// For human-to-human direct conversations
    #[serde(rename = "targetUserId")]
    target_user_id: Option<String>,
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
    #[serde(rename = "mentionOnly")]
    mention_only: Option<bool>,
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
    mention_only: bool,
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

/// Row for group agent member names batch fetch.
#[derive(Debug, FromRow)]
struct GroupMemberRow {
    conversation_id: Uuid,
    name: String,
}

/// Row for group user member count batch fetch.
#[derive(Debug, FromRow)]
struct GroupUserCountRow {
    conversation_id: Uuid,
    user_count: i64,
}

// ===== Handlers =====

/// POST /api/conversations - Create a new conversation
async fn create_conversation(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<CreateConversationBody>,
) -> Response {
    // Human-to-human direct conversation
    if let Some(ref target_user_id) = body.target_user_id {
        return create_human_direct(&state, &user, target_user_id).await;
    }

    // Agent direct conversation (existing flow)
    let agent_id = match body.agent_id {
        Some(id) => id,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "agentId or targetUserId is required"})),
            )
                .into_response();
        }
    };

    // Verify agent exists and belongs to user
    let agent = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM agents WHERE id = $1 AND owner_id = $2",
    )
    .bind(agent_id)
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
        r#"INSERT INTO conversations (title, type, user_id, agent_id, mention_only)
           VALUES ($1, 'direct', $2, $3, FALSE)
           RETURNING *"#,
    )
    .bind(&body.title)
    .bind(&user.id)
    .bind(agent_id)
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

/// Create human-to-human direct conversation (requires friendship)
async fn create_human_direct(
    state: &AppState,
    user: &AuthUser,
    target_user_id: &str,
) -> Response {
    if target_user_id == user.id {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Cannot create conversation with yourself"})),
        )
            .into_response();
    }

    // Check friendship (must be accepted)
    let friendship = sqlx::query_as::<_, (Uuid,)>(
        r#"SELECT id FROM friendships
           WHERE status = 'accepted'
             AND ((requester_id = $1 AND addressee_id = $2) OR (requester_id = $2 AND addressee_id = $1))"#,
    )
    .bind(&user.id)
    .bind(target_user_id)
    .fetch_optional(&state.db)
    .await;

    if !matches!(friendship, Ok(Some(_))) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "You must be friends to start a direct conversation"})),
        )
            .into_response();
    }

    // Check for existing direct conversation between these two users
    let existing = sqlx::query_as::<_, (Uuid,)>(
        r#"SELECT c.id FROM conversations c
           JOIN conversation_user_members cum1 ON cum1.conversation_id = c.id AND cum1.user_id = $1
           JOIN conversation_user_members cum2 ON cum2.conversation_id = c.id AND cum2.user_id = $2
           WHERE c.type = 'direct' AND c.agent_id IS NULL
           LIMIT 1"#,
    )
    .bind(&user.id)
    .bind(target_user_id)
    .fetch_optional(&state.db)
    .await;

    if let Ok(Some((existing_id,))) = existing {
        // Return existing conversation
        let conv = sqlx::query_as::<_, Conversation>(
            "SELECT * FROM conversations WHERE id = $1",
        )
        .bind(existing_id)
        .fetch_one(&state.db)
        .await;

        return match conv {
            Ok(c) => Json(json!(c)).into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response(),
        };
    }

    // Create new direct conversation
    let conv_id = Uuid::new_v4();
    let result = sqlx::query_as::<_, Conversation>(
        r#"INSERT INTO conversations (id, type, user_id, mention_only)
           VALUES ($1, 'direct', $2, FALSE)
           RETURNING *"#,
    )
    .bind(conv_id)
    .bind(&user.id)
    .fetch_one(&state.db)
    .await;

    let conv = match result {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    };

    // Add both users to conversation_user_members
    let _ = sqlx::query(
        r#"INSERT INTO conversation_user_members (conversation_id, user_id, role)
           VALUES ($1, $2, 'member'), ($1, $3, 'member')"#,
    )
    .bind(conv_id)
    .bind(&user.id)
    .bind(target_user_id)
    .execute(&state.db)
    .await;

    (StatusCode::CREATED, Json(json!(conv))).into_response()
}

/// GET /api/conversations - List conversations with last message preview and agent info
async fn list_conversations(
    State(state): State<AppState>,
    user: AuthUser,
    Query(params): Query<ListQuery>,
) -> Response {
    // Include conversations where user is owner OR member
    let rows = if let Some(ref q) = params.q {
        let pattern = format!("%{}%", q);
        sqlx::query_as::<_, ConversationListRow>(
            r#"SELECT
                c.id,
                c.title,
                c.type::text,
                c.user_id,
                c.agent_id,
                c.mention_only,
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
            WHERE (c.user_id = $1 OR EXISTS (
                SELECT 1 FROM conversation_user_members cum WHERE cum.conversation_id = c.id AND cum.user_id = $1
            ))
              AND (c.title ILIKE $2 OR a.name ILIKE $2)
              AND NOT EXISTS (
                SELECT 1 FROM conversation_user_members h
                WHERE h.conversation_id = c.id AND h.user_id = $1
                  AND h.hidden_at IS NOT NULL AND h.hidden_at >= c.updated_at
              )
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
                c.mention_only,
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
            WHERE (c.user_id = $1 OR EXISTS (
                SELECT 1 FROM conversation_user_members cum WHERE cum.conversation_id = c.id AND cum.user_id = $1
            ))
              AND NOT EXISTS (
                SELECT 1 FROM conversation_user_members h
                WHERE h.conversation_id = c.id AND h.user_id = $1
                  AND h.hidden_at IS NOT NULL AND h.hidden_at >= c.updated_at
              )
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

    let mut group_user_counts: std::collections::HashMap<Uuid, i64> =
        std::collections::HashMap::new();

    if !group_ids.is_empty() {
        // Build a parameterised IN clause
        let placeholders: Vec<String> = group_ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("${}", i + 1))
            .collect();

        // Fetch agent member names
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

        // Fetch user member counts
        let user_count_query = format!(
            r#"SELECT conversation_id, count(*) AS user_count
               FROM conversation_user_members
               WHERE conversation_id IN ({})
               GROUP BY conversation_id"#,
            placeholders.join(", ")
        );

        let mut uq = sqlx::query_as::<_, GroupUserCountRow>(&user_count_query);
        for gid in &group_ids {
            uq = uq.bind(gid);
        }

        if let Ok(counts) = uq.fetch_all(&state.db).await {
            for c in counts {
                group_user_counts.insert(c.conversation_id, c.user_count);
            }
        }
    }

    // For human-to-human DMs (no agent), batch-fetch the peer user's name
    let human_dm_ids: Vec<Uuid> = rows
        .iter()
        .filter(|r| r.conv_type == "direct" && r.agent_id.is_none())
        .map(|r| r.id)
        .collect();

    let mut peer_user_names: std::collections::HashMap<Uuid, (String, Option<String>)> =
        std::collections::HashMap::new();

    if !human_dm_ids.is_empty() {
        let placeholders: Vec<String> = human_dm_ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("${}", i + 1))
            .collect();
        let query_str = format!(
            r#"SELECT cum.conversation_id, u.name, u.image
               FROM conversation_user_members cum
               JOIN "user" u ON u.id = cum.user_id
               WHERE cum.conversation_id IN ({}) AND cum.user_id != ${}"#,
            placeholders.join(", "),
            human_dm_ids.len() + 1
        );

        let mut q = sqlx::query_as::<_, (Uuid, String, Option<String>)>(&query_str);
        for gid in &human_dm_ids {
            q = q.bind(gid);
        }
        q = q.bind(&user.id);

        if let Ok(peers) = q.fetch_all(&state.db).await {
            for (conv_id, name, image) in peers {
                peer_user_names.insert(conv_id, (name, image));
            }
        }
    }

    // Build result JSON matching the TypeScript shape
    let result: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            let (agent_name, agent_description) = if row.conv_type == "group" {
                let agent_names = group_member_names
                    .get(&row.id)
                    .cloned()
                    .unwrap_or_default();
                let user_count = group_user_counts.get(&row.id).copied().unwrap_or(0);
                let agent_count = agent_names.len();

                // Title priority: custom title > agent names > "Group"
                let name = if let Some(ref title) = row.title {
                    title.clone()
                } else if !agent_names.is_empty() {
                    agent_names.join(", ")
                } else {
                    "Group".to_string()
                };

                // Description: "N members, M agents"
                let desc = format!(
                    "{} member{}, {} agent{}",
                    user_count,
                    if user_count != 1 { "s" } else { "" },
                    agent_count,
                    if agent_count != 1 { "s" } else { "" }
                );
                (name, Some(desc))
            } else if row.agent_id.is_none() {
                // Human-to-human DM: show peer user's name
                if let Some((peer_name, _)) = peer_user_names.get(&row.id) {
                    (peer_name.clone(), None)
                } else {
                    ("Direct Message".to_string(), None)
                }
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
                    "createdAt": row.last_msg_created_at.map(|t| t.and_utc().to_rfc3339()),
                    "updatedAt": row.last_msg_updated_at.map(|t| t.and_utc().to_rfc3339()),
                })
            } else {
                serde_json::Value::Null
            };

            // For human DMs, use peer's avatar; otherwise use agent's
            let avatar_url = if row.agent_id.is_none() {
                peer_user_names.get(&row.id).and_then(|(_, img)| img.clone())
            } else {
                row.agent_avatar_url.clone()
            };

            json!({
                "id": row.id,
                "title": row.title,
                "type": row.conv_type,
                "userId": row.user_id,
                "agentId": row.agent_id,
                "mentionOnly": row.mention_only,
                "pinnedAt": row.pinned_at.map(|t| t.and_utc().to_rfc3339()),
                "createdAt": row.created_at.and_utc().to_rfc3339(),
                "updatedAt": row.updated_at.and_utc().to_rfc3339(),
                "agentName": agent_name,
                "agentDescription": agent_description,
                "agentAvatarUrl": avatar_url,
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
            mention_only = CASE WHEN $7::boolean THEN $8 ELSE mention_only END,
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
    .bind(body.mention_only.is_some()) // $7: whether mention_only was provided
    .bind(body.mention_only.unwrap_or(true)) // $8: the mention_only value
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
    // Check conversation access and type
    let conv = sqlx::query_as::<_, (Uuid, Option<Uuid>, String)>(
        r#"SELECT c.id, c.agent_id, c.type::text FROM conversations c
           WHERE c.id = $1
             AND (c.user_id = $2 OR EXISTS (
                SELECT 1 FROM conversation_user_members cum
                WHERE cum.conversation_id = c.id AND cum.user_id = $2
             ))"#,
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    let (_, agent_id, conv_type) = match conv {
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

    // Human-to-human DM (no agent): soft-hide for this user only
    if conv_type == "direct" && agent_id.is_none() {
        let result = sqlx::query(
            r#"UPDATE conversation_user_members SET hidden_at = NOW()
               WHERE conversation_id = $1 AND user_id = $2"#,
        )
        .bind(id)
        .bind(&user.id)
        .execute(&state.db)
        .await;

        return match result {
            Ok(_) => StatusCode::NO_CONTENT.into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response(),
        };
    }

    // Agent DMs and other types: hard delete the entire conversation
    let result = sqlx::query("DELETE FROM conversations WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
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
            "createdAt": conv.created_at.and_utc().to_rfc3339(),
            "messageCount": msg_count,
        },
        "agent": agent_info,
    }))
    .into_response()
}
