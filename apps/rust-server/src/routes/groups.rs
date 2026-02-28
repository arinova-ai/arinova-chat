use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, patch, post},
    Router,
};
use rand::Rng;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::services::message_seq::get_next_seq;
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
        // Group admin endpoints
        .route("/api/groups/{id}/invite-link", post(generate_invite_link))
        .route("/api/groups/join/{token}", post(join_via_invite))
        .route("/api/groups/{id}/kick/{userId}", post(kick_user))
        .route("/api/groups/{id}/settings", patch(update_settings))
        .route("/api/groups/{id}/promote/{userId}", post(promote_user))
        .route("/api/groups/{id}/demote/{userId}", post(demote_user))
        .route(
            "/api/groups/{id}/transfer-admin/{userId}",
            post(transfer_admin),
        )
        .route("/api/groups/{id}/leave", post(leave_group))
        .route("/api/groups/{id}/add-user", post(add_user_to_group))
        // Agent permission endpoints
        .route(
            "/api/conversations/{id}/agents/{agentId}/listen-mode",
            patch(update_listen_mode),
        )
        .route(
            "/api/conversations/{id}/agents/{agentId}/allowed-users",
            get(get_allowed_users).put(set_allowed_users),
        )
        .route(
            "/api/conversations/{id}/agents/{agentId}/withdraw",
            post(withdraw_agent),
        )
}

#[derive(Deserialize)]
struct CreateGroupBody {
    title: Option<String>,
    #[serde(rename = "agentIds", default)]
    agent_ids: Vec<Uuid>,
    #[serde(rename = "userIds", default)]
    user_ids: Vec<String>,
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
    if body.agent_ids.is_empty() && body.user_ids.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "At least one agent or user is required"})),
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
        r#"INSERT INTO conversations (id, title, "type", user_id, mention_only)
           VALUES ($1, $2, 'group', $3, TRUE)"#,
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

    // Create group settings
    let _ = sqlx::query(
        r#"INSERT INTO group_settings (conversation_id) VALUES ($1)"#,
    )
    .bind(conv_id)
    .execute(&state.db)
    .await;

    // Add creator as admin in conversation_user_members
    let _ = sqlx::query(
        r#"INSERT INTO conversation_user_members (conversation_id, user_id, role)
           VALUES ($1, $2, 'admin')"#,
    )
    .bind(conv_id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    // Add invited users as members
    for uid in &body.user_ids {
        if uid == &user.id {
            continue;
        }
        let _ = sqlx::query(
            r#"INSERT INTO conversation_user_members (conversation_id, user_id, role)
               VALUES ($1, $2, 'member')
               ON CONFLICT DO NOTHING"#,
        )
        .bind(conv_id)
        .bind(uid)
        .execute(&state.db)
        .await;
    }

    // Add all agents as members with owner_user_id
    for agent_id in &body.agent_ids {
        let _ = sqlx::query(
            r#"INSERT INTO conversation_members (conversation_id, agent_id, owner_user_id, listen_mode)
               VALUES ($1, $2, $3, 'owner_only')"#,
        )
        .bind(conv_id)
        .bind(agent_id)
        .bind(&user.id)
        .execute(&state.db)
        .await;
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

/// Helper to check if a user is a member of a conversation (via user_id ownership or conversation_user_members)
async fn is_conversation_member(db: &sqlx::PgPool, conv_id: Uuid, user_id: &str) -> bool {
    // Check conversation_user_members first
    let member = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM conversation_user_members WHERE conversation_id = $1 AND user_id = $2",
    )
    .bind(conv_id)
    .bind(user_id)
    .fetch_optional(db)
    .await;

    if matches!(member, Ok(Some(_))) {
        return true;
    }

    // Fallback: check conversations.user_id for backward compatibility
    let owner = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM conversations WHERE id = $1 AND user_id = $2",
    )
    .bind(conv_id)
    .bind(user_id)
    .fetch_optional(db)
    .await;

    matches!(owner, Ok(Some(_)))
}

/// Helper to get user's role in a group
async fn get_user_role(db: &sqlx::PgPool, conv_id: Uuid, user_id: &str) -> Option<String> {
    sqlx::query_as::<_, (String,)>(
        "SELECT role::text FROM conversation_user_members WHERE conversation_id = $1 AND user_id = $2",
    )
    .bind(conv_id)
    .bind(user_id)
    .fetch_optional(db)
    .await
    .ok()
    .flatten()
    .map(|(r,)| r)
}

/// Insert a system message into a conversation and broadcast it to all members.
async fn insert_system_message(state: &AppState, conv_id: Uuid, content: &str) {
    let conv_id_str = conv_id.to_string();
    let seq = match get_next_seq(&state.db, &conv_id_str).await {
        Ok(s) => s,
        Err(_) => return,
    };

    let msg_id = Uuid::new_v4();
    let now = chrono::Utc::now();

    let result = sqlx::query(
        r#"INSERT INTO messages (id, conversation_id, role, content, status, seq, created_at, updated_at)
           VALUES ($1, $2, 'system', $3, 'completed', $4, $5, $5)"#,
    )
    .bind(msg_id)
    .bind(conv_id)
    .bind(content)
    .bind(seq)
    .bind(now.naive_utc())
    .execute(&state.db)
    .await;

    if result.is_err() {
        return;
    }

    // Update conversation's updated_at
    let _ = sqlx::query("UPDATE conversations SET updated_at = NOW() WHERE id = $1")
        .bind(conv_id)
        .execute(&state.db)
        .await;

    // Fetch all user member IDs
    let member_ids: Vec<String> = sqlx::query_as::<_, (String,)>(
        "SELECT user_id FROM conversation_user_members WHERE conversation_id = $1",
    )
    .bind(conv_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default()
    .into_iter()
    .map(|(uid,)| uid)
    .collect();

    let msg_event = json!({
        "type": "new_message",
        "conversationId": conv_id_str,
        "message": {
            "id": msg_id.to_string(),
            "conversationId": conv_id_str,
            "seq": seq,
            "role": "system",
            "content": content,
            "status": "completed",
            "createdAt": now.to_rfc3339(),
            "updatedAt": now.to_rfc3339(),
        }
    });

    state.ws.broadcast_to_members(&member_ids, &msg_event, &state.redis);
}

async fn list_members(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    if !is_conversation_member(&state.db, id, &user.id).await {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Conversation not found"})),
        )
            .into_response();
    }

    // Fetch agent members with info
    let agent_members = sqlx::query_as::<_, (Uuid, Uuid, Option<String>, String, chrono::NaiveDateTime, String, Option<String>, Option<String>)>(
        r#"SELECT cm.id, cm.agent_id, cm.owner_user_id, cm.listen_mode::text, cm.added_at,
                  a.name, a.description, a.avatar_url
           FROM conversation_members cm
           JOIN agents a ON a.id = cm.agent_id
           WHERE cm.conversation_id = $1
           ORDER BY cm.added_at"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Fetch user members
    let user_members = sqlx::query_as::<_, (Uuid, String, String, chrono::NaiveDateTime, String, Option<String>, Option<String>)>(
        r#"SELECT cum.id, cum.user_id, cum.role::text, cum.joined_at,
                  u.name, u.image, u.username
           FROM conversation_user_members cum
           JOIN "user" u ON u.id = cum.user_id
           WHERE cum.conversation_id = $1
           ORDER BY cum.joined_at"#,
    )
    .bind(id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let agents_json: Vec<serde_json::Value> = agent_members
        .iter()
        .map(|r| {
            json!({
                "id": r.0,
                "agentId": r.1,
                "ownerUserId": r.2,
                "listenMode": r.3,
                "addedAt": r.4.and_utc().to_rfc3339(),
                "agentName": r.5,
                "agentDescription": r.6,
                "agentAvatarUrl": r.7,
            })
        })
        .collect();

    let users_json: Vec<serde_json::Value> = user_members
        .iter()
        .map(|r| {
            json!({
                "id": r.0,
                "userId": r.1,
                "role": r.2,
                "joinedAt": r.3.and_utc().to_rfc3339(),
                "name": r.4,
                "image": r.5,
                "username": r.6,
            })
        })
        .collect();

    Json(json!({
        "agents": agents_json,
        "users": users_json,
    }))
    .into_response()
}

async fn add_member(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<AddMemberBody>,
) -> Response {
    if !is_conversation_member(&state.db, id, &user.id).await {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Conversation not found"})),
        )
            .into_response();
    }

    // Check agent limit
    let count = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*) FROM conversation_members WHERE conversation_id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await;

    if let Ok((c,)) = count {
        if c >= 10 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Group has reached the maximum of 10 agents"})),
            )
                .into_response();
        }
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

    let result = sqlx::query(
        r#"INSERT INTO conversation_members (conversation_id, agent_id, owner_user_id, listen_mode)
           VALUES ($1, $2, $3, 'owner_only')"#,
    )
    .bind(id)
    .bind(body.agent_id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            // Look up agent name
            let agent_name = sqlx::query_as::<_, (String,)>(
                "SELECT name FROM agents WHERE id = $1",
            )
            .bind(body.agent_id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten()
            .map(|(n,)| n)
            .unwrap_or_else(|| "An agent".to_string());

            insert_system_message(&state, id, &format!("Agent {} was added to the group", agent_name)).await;

            (StatusCode::CREATED, Json(json!({"added": true}))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

async fn remove_member(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, agent_id)): Path<(Uuid, Uuid)>,
) -> Response {
    if !is_conversation_member(&state.db, id, &user.id).await {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Conversation not found"})),
        )
            .into_response();
    }

    // Look up agent name before deleting
    let agent_name = sqlx::query_as::<_, (String,)>(
        "SELECT name FROM agents WHERE id = $1",
    )
    .bind(agent_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .map(|(n,)| n);

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
        Ok(_) => {
            let name = agent_name.unwrap_or_else(|| "An agent".to_string());
            insert_system_message(&state, id, &format!("Agent {} was removed from the group", name)).await;
            StatusCode::NO_CONTENT.into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ===== Group Admin Endpoints =====

fn generate_invite_token() -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..12).map(|_| rng.gen()).collect();
    hex::encode(bytes)[..16].to_string()
}

/// POST /api/groups/:id/invite-link — Generate/regenerate invite link
async fn generate_invite_link(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let role = get_user_role(&state.db, id, &user.id).await;
    if !matches!(role.as_deref(), Some("admin")) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Only the admin can manage invite links"})),
        )
            .into_response();
    }

    let token = generate_invite_token();
    let result = sqlx::query(
        r#"UPDATE group_settings SET invite_link = $1, invite_enabled = TRUE
           WHERE conversation_id = $2"#,
    )
    .bind(&token)
    .bind(id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => Json(json!({"inviteLink": token})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// POST /api/groups/join/:token — Join group via invite link
async fn join_via_invite(
    State(state): State<AppState>,
    user: AuthUser,
    Path(token): Path<String>,
) -> Response {
    // Find group by invite token
    let group = sqlx::query_as::<_, (Uuid, bool)>(
        r#"SELECT conversation_id, invite_enabled FROM group_settings WHERE invite_link = $1"#,
    )
    .bind(&token)
    .fetch_optional(&state.db)
    .await;

    let (conv_id, invite_enabled) = match group {
        Ok(Some(g)) => g,
        Ok(None) => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Invalid invite link"})),
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

    if !invite_enabled {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Invites are disabled for this group"})),
        )
            .into_response();
    }

    // Check user limit
    let count = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*) FROM conversation_user_members WHERE conversation_id = $1",
    )
    .bind(conv_id)
    .fetch_one(&state.db)
    .await;

    if let Ok((c,)) = count {
        if c >= 50 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Group has reached the maximum of 50 users"})),
            )
                .into_response();
        }
    }

    // Add user as member (ON CONFLICT = already a member)
    let result = sqlx::query(
        r#"INSERT INTO conversation_user_members (conversation_id, user_id, role)
           VALUES ($1, $2, 'member')
           ON CONFLICT (conversation_id, user_id) DO NOTHING"#,
    )
    .bind(conv_id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) => {
            state.ws.invalidate_conv_member_cache(&conv_id.to_string());

            if r.rows_affected() > 0 {
                // Look up the joining user's name
                let joiner_name = sqlx::query_as::<_, (String,)>(
                    r#"SELECT name FROM "user" WHERE id = $1"#,
                )
                .bind(&user.id)
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten()
                .map(|(n,)| n)
                .unwrap_or_else(|| "Someone".to_string());

                insert_system_message(&state, conv_id, &format!("{} joined the group", joiner_name)).await;
            }

            Json(json!({"conversationId": conv_id, "joined": true})).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// POST /api/groups/:id/kick/:userId — Kick a user (and their agents)
async fn kick_user(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, target_id)): Path<(Uuid, String)>,
) -> Response {
    let kicker_role = get_user_role(&state.db, id, &user.id).await;
    let target_role = get_user_role(&state.db, id, &target_id).await;

    // Permission check
    match (kicker_role.as_deref(), target_role.as_deref()) {
        (Some("admin"), Some("admin")) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Cannot kick yourself"})),
            )
                .into_response();
        }
        (Some("admin"), _) => {} // admin can kick anyone else
        (Some("vice_admin"), Some("admin") | Some("vice_admin")) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Cannot kick admin or vice-admin"})),
            )
                .into_response();
        }
        (Some("vice_admin"), _) => {} // vice_admin can kick regular members
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Insufficient permissions"})),
            )
                .into_response();
        }
    }

    // Remove user's agents from the group
    let _ = sqlx::query(
        "DELETE FROM conversation_members WHERE conversation_id = $1 AND owner_user_id = $2",
    )
    .bind(id)
    .bind(&target_id)
    .execute(&state.db)
    .await;

    // Remove user from group
    let result = sqlx::query(
        "DELETE FROM conversation_user_members WHERE conversation_id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&target_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => {
            state.ws.invalidate_conv_member_cache(&id.to_string());

            // Notify kicked user via WS so their frontend can clean up
            state.ws.send_to_user(
                &target_id,
                &json!({
                    "type": "kicked_from_group",
                    "conversationId": id.to_string(),
                }),
            );

            // Look up kicked user's name
            let kicked_name = sqlx::query_as::<_, (String,)>(
                r#"SELECT name FROM "user" WHERE id = $1"#,
            )
            .bind(&target_id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten()
            .map(|(n,)| n)
            .unwrap_or_else(|| "Someone".to_string());

            insert_system_message(&state, id, &format!("{} was removed from the group", kicked_name)).await;

            Json(json!({"kicked": true})).into_response()
        }
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "User not found in group"})),
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
struct UpdateSettingsBody {
    title: Option<String>,
    #[serde(rename = "historyVisible")]
    history_visible: Option<bool>,
    #[serde(rename = "inviteEnabled")]
    invite_enabled: Option<bool>,
    #[serde(rename = "mentionOnly")]
    mention_only: Option<bool>,
}

/// PATCH /api/groups/:id/settings — Update group settings (admin only)
async fn update_settings(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateSettingsBody>,
) -> Response {
    let role = get_user_role(&state.db, id, &user.id).await;
    if !matches!(role.as_deref(), Some("admin")) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Only the admin can change group settings"})),
        )
            .into_response();
    }

    // Update conversation title if provided
    if let Some(ref title) = body.title {
        let _ = sqlx::query("UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2")
            .bind(title)
            .bind(id)
            .execute(&state.db)
            .await;
    }

    // Update mention_only if provided
    if let Some(mention_only) = body.mention_only {
        let _ = sqlx::query("UPDATE conversations SET mention_only = $1, updated_at = NOW() WHERE id = $2")
            .bind(mention_only)
            .bind(id)
            .execute(&state.db)
            .await;
    }

    // Update group_settings
    if body.history_visible.is_some() || body.invite_enabled.is_some() {
        let _ = sqlx::query(
            r#"UPDATE group_settings SET
                history_visible = COALESCE($1, history_visible),
                invite_enabled = COALESCE($2, invite_enabled)
               WHERE conversation_id = $3"#,
        )
        .bind(body.history_visible)
        .bind(body.invite_enabled)
        .bind(id)
        .execute(&state.db)
        .await;
    }

    Json(json!({"updated": true})).into_response()
}

/// POST /api/groups/:id/promote/:userId — Promote to vice-admin
async fn promote_user(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, target_id)): Path<(Uuid, String)>,
) -> Response {
    let role = get_user_role(&state.db, id, &user.id).await;
    if !matches!(role.as_deref(), Some("admin")) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Only the admin can promote users"})),
        )
            .into_response();
    }

    let result = sqlx::query(
        r#"UPDATE conversation_user_members SET role = 'vice_admin'
           WHERE conversation_id = $1 AND user_id = $2 AND role = 'member'"#,
    )
    .bind(id)
    .bind(&target_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Json(json!({"role": "vice_admin"})).into_response(),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "User not found or not a regular member"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// POST /api/groups/:id/demote/:userId — Demote vice-admin to member
async fn demote_user(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, target_id)): Path<(Uuid, String)>,
) -> Response {
    let role = get_user_role(&state.db, id, &user.id).await;
    if !matches!(role.as_deref(), Some("admin")) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Only the admin can demote users"})),
        )
            .into_response();
    }

    let result = sqlx::query(
        r#"UPDATE conversation_user_members SET role = 'member'
           WHERE conversation_id = $1 AND user_id = $2 AND role = 'vice_admin'"#,
    )
    .bind(id)
    .bind(&target_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() > 0 => Json(json!({"role": "member"})).into_response(),
        Ok(_) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "User not found or not a vice-admin"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// POST /api/groups/:id/transfer-admin/:userId — Transfer admin role
async fn transfer_admin(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, target_id)): Path<(Uuid, String)>,
) -> Response {
    let role = get_user_role(&state.db, id, &user.id).await;
    if !matches!(role.as_deref(), Some("admin")) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Only the admin can transfer admin role"})),
        )
            .into_response();
    }

    // Target must be a member
    let target_role = get_user_role(&state.db, id, &target_id).await;
    if target_role.is_none() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Target user not found in group"})),
        )
            .into_response();
    }

    // Transfer: target becomes admin, current admin becomes member
    let _ = sqlx::query(
        r#"UPDATE conversation_user_members SET role = 'admin'
           WHERE conversation_id = $1 AND user_id = $2"#,
    )
    .bind(id)
    .bind(&target_id)
    .execute(&state.db)
    .await;

    let _ = sqlx::query(
        r#"UPDATE conversation_user_members SET role = 'member'
           WHERE conversation_id = $1 AND user_id = $2"#,
    )
    .bind(id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    Json(json!({"transferred": true})).into_response()
}

/// POST /api/groups/:id/leave — Leave a group
async fn leave_group(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let role = get_user_role(&state.db, id, &user.id).await;
    if matches!(role.as_deref(), Some("admin")) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Transfer admin role before leaving"})),
        )
            .into_response();
    }

    if role.is_none() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Not a member of this group"})),
        )
            .into_response();
    }

    // Look up the leaving user's name before removing them
    let leaver_name = sqlx::query_as::<_, (String,)>(
        r#"SELECT name FROM "user" WHERE id = $1"#,
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .map(|(n,)| n)
    .unwrap_or_else(|| "Someone".to_string());

    // Insert system message before removing the user (so they're still a member for broadcast)
    insert_system_message(&state, id, &format!("{} left the group", leaver_name)).await;

    // Remove user's agents
    let _ = sqlx::query(
        "DELETE FROM conversation_members WHERE conversation_id = $1 AND owner_user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    // Remove user
    let _ = sqlx::query(
        "DELETE FROM conversation_user_members WHERE conversation_id = $1 AND user_id = $2",
    )
    .bind(id)
    .bind(&user.id)
    .execute(&state.db)
    .await;

    state.ws.invalidate_conv_member_cache(&id.to_string());
    Json(json!({"left": true})).into_response()
}

// ===== Add User to Group =====

#[derive(Deserialize)]
struct AddUserBody {
    #[serde(rename = "userId")]
    user_id: String,
}

/// POST /api/groups/:id/add-user - Admin/vice-admin adds a user directly
async fn add_user_to_group(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
    Json(body): Json<AddUserBody>,
) -> Response {
    // Check caller's role
    let caller_role = get_user_role(&state.db, id, &user.id).await;
    if !matches!(caller_role.as_deref(), Some("admin") | Some("vice_admin")) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Only admin or vice-admin can add users"})),
        )
            .into_response();
    }

    // Verify target user exists
    let target = sqlx::query_as::<_, (String,)>(
        r#"SELECT id FROM "user" WHERE id = $1"#,
    )
    .bind(&body.user_id)
    .fetch_optional(&state.db)
    .await;

    if !matches!(target, Ok(Some(_))) {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "User not found"})),
        )
            .into_response();
    }

    // Check user limit
    let count = sqlx::query_as::<_, (i64,)>(
        "SELECT COUNT(*) FROM conversation_user_members WHERE conversation_id = $1",
    )
    .bind(id)
    .fetch_one(&state.db)
    .await;

    if let Ok((c,)) = count {
        if c >= 50 {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Group has reached the maximum of 50 users"})),
            )
                .into_response();
        }
    }

    // Add user as member
    let result = sqlx::query(
        r#"INSERT INTO conversation_user_members (conversation_id, user_id, role)
           VALUES ($1, $2, 'member')
           ON CONFLICT (conversation_id, user_id) DO NOTHING"#,
    )
    .bind(id)
    .bind(&body.user_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) => {
            if r.rows_affected() == 0 {
                return (
                    StatusCode::CONFLICT,
                    Json(json!({"error": "User is already a member"})),
                )
                    .into_response();
            }
            state.ws.invalidate_conv_member_cache(&id.to_string());

            // Look up added user's name
            let added_name = sqlx::query_as::<_, (String,)>(
                r#"SELECT name FROM "user" WHERE id = $1"#,
            )
            .bind(&body.user_id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten()
            .map(|(n,)| n)
            .unwrap_or_else(|| "Someone".to_string());

            insert_system_message(&state, id, &format!("{} was added to the group", added_name)).await;

            (StatusCode::CREATED, Json(json!({"added": true}))).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ===== Agent Permission Endpoints =====

#[derive(Deserialize)]
struct UpdateListenModeBody {
    #[serde(rename = "listenMode")]
    listen_mode: String,
}

/// PATCH /api/conversations/:id/agents/:agentId/listen-mode
async fn update_listen_mode(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, agent_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateListenModeBody>,
) -> Response {
    // Validate listen_mode
    if !["owner_only", "allowed_users", "all_mentions"].contains(&body.listen_mode.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid listen mode"})),
        )
            .into_response();
    }

    // Check ownership: only the agent's owner_user_id can change listen mode
    let member = sqlx::query_as::<_, (Option<String>,)>(
        r#"SELECT owner_user_id FROM conversation_members
           WHERE conversation_id = $1 AND agent_id = $2"#,
    )
    .bind(id)
    .bind(agent_id)
    .fetch_optional(&state.db)
    .await;

    match member {
        Ok(Some((Some(owner_id),))) if owner_id == user.id => {}
        Ok(Some(_)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Only the agent owner can change listen mode"})),
            )
                .into_response();
        }
        _ => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Agent not found in conversation"})),
            )
                .into_response();
        }
    }

    let query = format!(
        "UPDATE conversation_members SET listen_mode = '{}' WHERE conversation_id = $1 AND agent_id = $2",
        body.listen_mode
    );
    let result = sqlx::query(&query)
        .bind(id)
        .bind(agent_id)
        .execute(&state.db)
        .await;

    match result {
        Ok(_) => Json(json!({"listenMode": body.listen_mode})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/conversations/:id/agents/:agentId/allowed-users
async fn get_allowed_users(
    State(state): State<AppState>,
    _user: AuthUser,
    Path((id, agent_id)): Path<(Uuid, Uuid)>,
) -> Response {
    let rows = sqlx::query_as::<_, (String,)>(
        "SELECT user_id FROM agent_listen_allowed_users WHERE agent_id = $1 AND conversation_id = $2",
    )
    .bind(agent_id)
    .bind(id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(rows) => {
            let user_ids: Vec<String> = rows.into_iter().map(|(uid,)| uid).collect();
            Json(json!({"allowedUsers": user_ids})).into_response()
        }
        Err(_) => {
            Json(json!({"allowedUsers": []})).into_response()
        }
    }
}

#[derive(Deserialize)]
struct SetAllowedUsersBody {
    #[serde(rename = "userIds")]
    user_ids: Vec<String>,
}

/// PUT /api/conversations/:id/agents/:agentId/allowed-users
async fn set_allowed_users(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, agent_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<SetAllowedUsersBody>,
) -> Response {
    // Check ownership
    let member = sqlx::query_as::<_, (Option<String>,)>(
        r#"SELECT owner_user_id FROM conversation_members
           WHERE conversation_id = $1 AND agent_id = $2"#,
    )
    .bind(id)
    .bind(agent_id)
    .fetch_optional(&state.db)
    .await;

    match member {
        Ok(Some((Some(owner_id),))) if owner_id == user.id => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Only the agent owner can set allowed users"})),
            )
                .into_response();
        }
    }

    // Delete existing allowed users
    let _ = sqlx::query(
        "DELETE FROM agent_listen_allowed_users WHERE agent_id = $1 AND conversation_id = $2",
    )
    .bind(agent_id)
    .bind(id)
    .execute(&state.db)
    .await;

    // Insert new allowed users
    for uid in &body.user_ids {
        let _ = sqlx::query(
            r#"INSERT INTO agent_listen_allowed_users (agent_id, conversation_id, user_id)
               VALUES ($1, $2, $3) ON CONFLICT DO NOTHING"#,
        )
        .bind(agent_id)
        .bind(id)
        .bind(uid)
        .execute(&state.db)
        .await;
    }

    Json(json!({"allowedUsers": body.user_ids})).into_response()
}

/// POST /api/conversations/:id/agents/:agentId/withdraw — Owner withdraws their agent
async fn withdraw_agent(
    State(state): State<AppState>,
    user: AuthUser,
    Path((id, agent_id)): Path<(Uuid, Uuid)>,
) -> Response {
    // Check ownership
    let member = sqlx::query_as::<_, (Option<String>,)>(
        r#"SELECT owner_user_id FROM conversation_members
           WHERE conversation_id = $1 AND agent_id = $2"#,
    )
    .bind(id)
    .bind(agent_id)
    .fetch_optional(&state.db)
    .await;

    match member {
        Ok(Some((Some(owner_id),))) if owner_id == user.id => {}
        _ => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Only the agent owner can withdraw their agent"})),
            )
                .into_response();
        }
    }

    // Look up agent name before removing
    let agent_name = sqlx::query_as::<_, (String,)>(
        "SELECT name FROM agents WHERE id = $1",
    )
    .bind(agent_id)
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .map(|(n,)| n);

    // Remove agent and its allowed users
    let _ = sqlx::query(
        "DELETE FROM agent_listen_allowed_users WHERE agent_id = $1 AND conversation_id = $2",
    )
    .bind(agent_id)
    .bind(id)
    .execute(&state.db)
    .await;

    let result = sqlx::query(
        "DELETE FROM conversation_members WHERE conversation_id = $1 AND agent_id = $2",
    )
    .bind(id)
    .bind(agent_id)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => {
            let name = agent_name.unwrap_or_else(|| "An agent".to_string());
            insert_system_message(&state, id, &format!("Agent {} was removed from the group", name)).await;
            Json(json!({"withdrawn": true})).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
