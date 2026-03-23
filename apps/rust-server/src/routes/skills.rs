use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post, patch},
    Router,
};
use chrono::{DateTime, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/skills", get(list_skills))
        .route("/api/skills/categories", get(list_categories))
        .route("/api/skills/installed", get(list_installed))
        .route("/api/skills/favorites", get(list_favorites))
        .route("/api/skills/{id}", get(get_skill))
        .route("/api/skills/{id}/install", post(install_skill))
        .route("/api/skills/{id}/uninstall", delete(uninstall_skill))
        .route("/api/skills/{id}/favorite", post(add_favorite).delete(remove_favorite))
        .route(
            "/api/agents/{agent_id}/skills/{skill_id}",
            patch(update_agent_skill),
        )
        .route("/api/agents/{id}/commands", get(list_agent_commands))
        .route("/api/skills/arinova-search", post(arinova_search))
}

// ===== Types =====

#[derive(Debug, FromRow)]
struct SkillListRow {
    id: Uuid,
    name: String,
    slug: String,
    description: String,
    category: String,
    icon_url: Option<String>,
    version: String,
    slash_command: Option<String>,
    prompt_template: String,
    is_official: bool,
    is_public: bool,
    created_by: Option<String>,
    install_count: i32,
    source_url: Option<String>,
    name_i18n: serde_json::Value,
    description_i18n: serde_json::Value,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    is_favorited: bool,
    installed_agent_ids: Vec<Uuid>,
}

#[derive(Debug, FromRow)]
struct SkillDetailRow {
    id: Uuid,
    name: String,
    slug: String,
    description: String,
    category: String,
    icon_url: Option<String>,
    version: String,
    slash_command: Option<String>,
    prompt_template: String,
    prompt_content: String,
    parameters: serde_json::Value,
    is_official: bool,
    is_public: bool,
    created_by: Option<String>,
    install_count: i32,
    source_url: Option<String>,
    name_i18n: serde_json::Value,
    description_i18n: serde_json::Value,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    installed_agent_ids: Vec<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListSkillsQuery {
    category: Option<String>,
    search: Option<String>,
    sort: Option<String>,
    page: Option<i64>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallSkillBody {
    agent_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UninstallSkillQuery {
    agent_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateAgentSkillBody {
    is_enabled: Option<bool>,
    config: Option<serde_json::Value>,
}

// ===== Helpers =====

fn skill_list_to_json(row: &SkillListRow) -> serde_json::Value {
    let agent_ids: Vec<String> = row.installed_agent_ids.iter().map(|id| id.to_string()).collect();
    json!({
        "id": row.id.to_string(),
        "name": &row.name,
        "slug": &row.slug,
        "description": &row.description,
        "category": &row.category,
        "iconUrl": &row.icon_url,
        "version": &row.version,
        "slashCommand": &row.slash_command,
        "promptTemplate": &row.prompt_template,
        "isOfficial": row.is_official,
        "isPublic": row.is_public,
        "createdBy": &row.created_by,
        "installCount": row.install_count,
        "sourceUrl": &row.source_url,
        "nameI18n": &row.name_i18n,
        "descriptionI18n": &row.description_i18n,
        "isFavorited": row.is_favorited,
        "installedAgentIds": agent_ids,
        "createdAt": row.created_at.to_rfc3339(),
        "updatedAt": row.updated_at.to_rfc3339(),
    })
}

fn skill_detail_to_json(row: &SkillDetailRow) -> serde_json::Value {
    let agent_ids: Vec<String> = row.installed_agent_ids.iter().map(|id| id.to_string()).collect();
    json!({
        "id": row.id.to_string(),
        "name": &row.name,
        "slug": &row.slug,
        "description": &row.description,
        "category": &row.category,
        "iconUrl": &row.icon_url,
        "version": &row.version,
        "slashCommand": &row.slash_command,
        "promptTemplate": &row.prompt_template,
        "promptContent": &row.prompt_content,
        "parameters": &row.parameters,
        "isOfficial": row.is_official,
        "isPublic": row.is_public,
        "createdBy": &row.created_by,
        "installCount": row.install_count,
        "sourceUrl": &row.source_url,
        "nameI18n": &row.name_i18n,
        "descriptionI18n": &row.description_i18n,
        "installedAgentIds": agent_ids,
        "createdAt": row.created_at.to_rfc3339(),
        "updatedAt": row.updated_at.to_rfc3339(),
    })
}

/// Verify user owns agent, return owner_id or error response
async fn verify_agent_ownership(
    db: &sqlx::PgPool,
    agent_id: Uuid,
    user_id: &str,
) -> Result<(), Response> {
    let owner: Option<(String,)> =
        sqlx::query_as("SELECT owner_id FROM agents WHERE id = $1")
            .bind(agent_id)
            .fetch_optional(db)
            .await
            .unwrap_or(None);

    match owner {
        None => Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Agent not found"})),
        )
            .into_response()),
        Some((oid,)) if oid != user_id => Err((
            StatusCode::FORBIDDEN,
            Json(json!({"error": "Not authorized"})),
        )
            .into_response()),
        _ => Ok(()),
    }
}

// ===== Handlers =====

/// GET /api/skills — browse skills with pagination, search, category, sort
/// Returns isFavorited and installedAgentIds per skill for the current user
async fn list_skills(
    State(state): State<AppState>,
    user: AuthUser,
    Query(params): Query<ListSkillsQuery>,
) -> Response {
    let limit = params.limit.unwrap_or(20).min(100);
    let page = params.page.unwrap_or(1).max(1);
    let offset = (page - 1) * limit;

    let sort_clause = match params.sort.as_deref() {
        Some("popular") => "s.install_count DESC, s.created_at DESC",
        Some("name") => "s.name ASC",
        Some("oldest") => "s.created_at ASC",
        _ => "s.created_at DESC",
    };

    // user_id is always $1
    let mut conditions = vec!["s.is_public = true".to_string()];
    let mut bind_idx = 2u32; // $1 = user_id

    if let Some(ref cat) = params.category {
        if !cat.is_empty() {
            conditions.push(format!("s.category = ${bind_idx}"));
            bind_idx += 1;
        }
    }

    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            conditions.push(format!(
                "(s.name ILIKE ${bind_idx} OR s.description ILIKE ${bind_idx} OR s.slug ILIKE ${bind_idx})"
            ));
            bind_idx += 1;
        }
    }

    let where_clause = conditions.join(" AND ");

    let count_sql = format!("SELECT COUNT(*) FROM skills s WHERE {where_clause}");
    let list_sql = format!(
        r#"SELECT s.id, s.name, s.slug, s.description, s.category, s.icon_url, s.version,
               s.slash_command, s.prompt_template, s.is_official, s.is_public,
               s.created_by, s.install_count, s.source_url, s.name_i18n, s.description_i18n,
               s.created_at, s.updated_at,
               EXISTS(SELECT 1 FROM user_favorite_skills uf WHERE uf.skill_id = s.id AND uf.user_id = $1) AS is_favorited,
               COALESCE(ARRAY(
                   SELECT ask.agent_id FROM agent_skills ask
                   WHERE ask.skill_id = s.id AND ask.installed_by = $1
               ), ARRAY[]::uuid[]) AS installed_agent_ids
        FROM skills s
        WHERE {where_clause}
        ORDER BY {sort_clause}
        LIMIT ${bind_idx} OFFSET ${}"#,
        bind_idx + 1
    );

    // Build count query (doesn't need user_id)
    let mut count_q = sqlx::query_as::<_, (i64,)>(&count_sql);
    if let Some(ref cat) = params.category {
        if !cat.is_empty() {
            count_q = count_q.bind(cat);
        }
    }
    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            count_q = count_q.bind(format!("%{}%", search.trim()));
        }
    }

    let total = match count_q.fetch_one(&state.db).await {
        Ok((c,)) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    };

    // Build list query ($1 = user_id)
    let mut list_q = sqlx::query_as::<_, SkillListRow>(&list_sql);
    list_q = list_q.bind(&user.id); // $1
    if let Some(ref cat) = params.category {
        if !cat.is_empty() {
            list_q = list_q.bind(cat);
        }
    }
    if let Some(ref search) = params.search {
        if !search.trim().is_empty() {
            list_q = list_q.bind(format!("%{}%", search.trim()));
        }
    }
    list_q = list_q.bind(limit).bind(offset);

    match list_q.fetch_all(&state.db).await {
        Ok(rows) => {
            let items: Vec<_> = rows.iter().map(skill_list_to_json).collect();
            Json(json!({
                "skills": items,
                "total": total,
                "page": page,
                "limit": limit,
            }))
            .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/skills/categories — list distinct categories
async fn list_categories(State(state): State<AppState>, _user: AuthUser) -> Response {
    let rows = sqlx::query_as::<_, (String, i64)>(
        "SELECT category, COUNT(*) as count FROM skills WHERE is_public = true GROUP BY category ORDER BY count DESC",
    )
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(cats) => {
            let items: Vec<_> = cats
                .iter()
                .map(|(cat, count)| json!({"category": cat, "count": count}))
                .collect();
            Json(json!({ "categories": items })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/skills/:id — get skill detail (public only, or author can see own)
async fn get_skill(
    State(state): State<AppState>,
    user: AuthUser,
    Path(id): Path<Uuid>,
) -> Response {
    let row = sqlx::query_as::<_, SkillDetailRow>(
        "SELECT s.id, s.name, s.slug, s.description, s.category, s.icon_url, s.version, s.slash_command, s.prompt_template, s.prompt_content, s.parameters, s.is_official, s.is_public, s.created_by, s.install_count, s.source_url, s.name_i18n, s.description_i18n, s.created_at, s.updated_at, COALESCE(ARRAY(SELECT ask.agent_id FROM agent_skills ask WHERE ask.skill_id = s.id AND ask.installed_by = $2), ARRAY[]::uuid[]) AS installed_agent_ids FROM skills s WHERE s.id = $1 AND (s.is_public = true OR s.created_by = $2)",
    )
    .bind(id)
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(skill)) => Json(skill_detail_to_json(&skill)).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Skill not found"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// POST /api/skills/:id/install — install a skill to one or more agents (batch)
async fn install_skill(
    State(state): State<AppState>,
    user: AuthUser,
    Path(skill_id): Path<Uuid>,
    Json(body): Json<InstallSkillBody>,
) -> Response {
    if body.agent_ids.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "agentIds must not be empty"})),
        )
            .into_response();
    }

    // Parse all agent IDs upfront
    let mut agent_ids = Vec::new();
    for id_str in &body.agent_ids {
        match Uuid::parse_str(id_str) {
            Ok(id) => agent_ids.push(id),
            Err(_) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": format!("Invalid agentId: {}", id_str)})),
                )
                    .into_response()
            }
        }
    }

    // Verify skill exists and is public
    let skill_exists: Option<(bool,)> =
        sqlx::query_as("SELECT is_public FROM skills WHERE id = $1")
            .bind(skill_id)
            .fetch_optional(&state.db)
            .await
            .unwrap_or(None);

    match skill_exists {
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Skill not found"})),
            )
                .into_response()
        }
        Some((false,)) => {
            return (
                StatusCode::FORBIDDEN,
                Json(json!({"error": "Skill is not public"})),
            )
                .into_response()
        }
        _ => {}
    }

    // Verify ownership for all agents
    for &agent_id in &agent_ids {
        if let Err(resp) = verify_agent_ownership(&state.db, agent_id, &user.id).await {
            return resp;
        }
    }

    // Install in a transaction
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    };

    let mut new_installs = 0i32;
    for &agent_id in &agent_ids {
        let result = sqlx::query(
            "INSERT INTO agent_skills (agent_id, skill_id, installed_by) VALUES ($1, $2, $3) ON CONFLICT (agent_id, skill_id) DO NOTHING",
        )
        .bind(agent_id)
        .bind(skill_id)
        .bind(&user.id)
        .execute(&mut *tx)
        .await;

        match result {
            Ok(r) => {
                if r.rows_affected() > 0 {
                    new_installs += 1;
                }
            }
            Err(e) => {
                let _ = tx.rollback().await;
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": e.to_string()})),
                )
                    .into_response();
            }
        }
    }

    // Update install_count atomically in the same transaction
    if new_installs > 0 {
        if let Err(e) = sqlx::query(
            "UPDATE skills SET install_count = install_count + $1 WHERE id = $2",
        )
        .bind(new_installs)
        .bind(skill_id)
        .execute(&mut *tx)
        .await
        {
            let _ = tx.rollback().await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response();
        }
    }

    if let Err(e) = tx.commit().await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response();
    }

    Json(json!({"ok": true, "installed": new_installs})).into_response()
}

/// DELETE /api/skills/:id/uninstall?agentId=...
async fn uninstall_skill(
    State(state): State<AppState>,
    user: AuthUser,
    Path(skill_id): Path<Uuid>,
    Query(params): Query<UninstallSkillQuery>,
) -> Response {
    let agent_id = match Uuid::parse_str(&params.agent_id) {
        Ok(id) => id,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Invalid agentId"})),
            )
                .into_response()
        }
    };

    if let Err(resp) = verify_agent_ownership(&state.db, agent_id, &user.id).await {
        return resp;
    }

    // Uninstall in transaction
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    };

    let result = sqlx::query("DELETE FROM agent_skills WHERE agent_id = $1 AND skill_id = $2")
        .bind(agent_id)
        .bind(skill_id)
        .execute(&mut *tx)
        .await;

    match result {
        Ok(r) => {
            if r.rows_affected() > 0 {
                if let Err(e) = sqlx::query(
                    "UPDATE skills SET install_count = GREATEST(install_count - 1, 0) WHERE id = $1",
                )
                .bind(skill_id)
                .execute(&mut *tx)
                .await
                {
                    let _ = tx.rollback().await;
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({"error": e.to_string()})),
                    )
                        .into_response();
                }
            }
            if let Err(e) = tx.commit().await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": e.to_string()})),
                )
                    .into_response();
            }
            StatusCode::NO_CONTENT.into_response()
        }
        Err(e) => {
            let _ = tx.rollback().await;
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    }
}

/// GET /api/skills/installed?agentId=...
async fn list_installed(
    State(state): State<AppState>,
    user: AuthUser,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Response {
    let agent_id_str = match params.get("agentId").or(params.get("agent_id")) {
        Some(id) => id.clone(),
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "agentId query parameter is required"})),
            )
                .into_response()
        }
    };

    let agent_id = match Uuid::parse_str(&agent_id_str) {
        Ok(id) => id,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Invalid agentId"})),
            )
                .into_response()
        }
    };

    if let Err(resp) = verify_agent_ownership(&state.db, agent_id, &user.id).await {
        return resp;
    }

    #[derive(FromRow)]
    struct InstalledSkillRow {
        id: Uuid,
        name: String,
        slug: String,
        description: String,
        category: String,
        icon_url: Option<String>,
        version: String,
        slash_command: Option<String>,
        is_official: bool,
        is_enabled: bool,
        config: serde_json::Value,
        installed_at: DateTime<Utc>,
    }

    let rows = sqlx::query_as::<_, InstalledSkillRow>(
        r#"
        SELECT s.id, s.name, s.slug, s.description, s.category, s.icon_url, s.version,
               s.slash_command, s.is_official,
               ask.is_enabled, ask.config, ask.installed_at
        FROM agent_skills ask
        JOIN skills s ON s.id = ask.skill_id
        WHERE ask.agent_id = $1
        ORDER BY ask.installed_at DESC
        "#,
    )
    .bind(agent_id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(skills) => {
            let items: Vec<_> = skills
                .iter()
                .map(|s| {
                    json!({
                        "id": s.id.to_string(),
                        "name": &s.name,
                        "slug": &s.slug,
                        "description": &s.description,
                        "category": &s.category,
                        "iconUrl": &s.icon_url,
                        "version": &s.version,
                        "slashCommand": &s.slash_command,
                        "isOfficial": s.is_official,
                        "isEnabled": s.is_enabled,
                        "config": &s.config,
                        "installedAt": s.installed_at.to_rfc3339(),
                    })
                })
                .collect();
            Json(json!({ "skills": items })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// PATCH /api/agents/:agentId/skills/:skillId — update enabled/config
async fn update_agent_skill(
    State(state): State<AppState>,
    user: AuthUser,
    Path((agent_id, skill_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateAgentSkillBody>,
) -> Response {
    if body.is_enabled.is_none() && body.config.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Nothing to update"})),
        )
            .into_response();
    }

    if let Err(resp) = verify_agent_ownership(&state.db, agent_id, &user.id).await {
        return resp;
    }

    // Build dynamic update
    let mut sets = Vec::new();
    let mut idx = 1u32;

    if body.is_enabled.is_some() {
        sets.push(format!("is_enabled = ${idx}"));
        idx += 1;
    }
    if body.config.is_some() {
        sets.push(format!("config = ${idx}"));
        idx += 1;
    }

    let sql = format!(
        "UPDATE agent_skills SET {} WHERE agent_id = ${} AND skill_id = ${} RETURNING id",
        sets.join(", "),
        idx,
        idx + 1
    );

    let mut q = sqlx::query_as::<_, (Uuid,)>(&sql);
    if let Some(is_enabled) = body.is_enabled {
        q = q.bind(is_enabled);
    }
    if let Some(ref config) = body.config {
        q = q.bind(config);
    }
    q = q.bind(agent_id).bind(skill_id);

    match q.fetch_optional(&state.db).await {
        Ok(Some(_)) => Json(json!({"ok": true})).into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Skill not installed on this agent"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// POST /api/skills/:id/favorite
async fn add_favorite(
    State(state): State<AppState>,
    user: AuthUser,
    Path(skill_id): Path<Uuid>,
) -> Response {
    let exists: Option<(Uuid,)> = sqlx::query_as("SELECT id FROM skills WHERE id = $1 AND is_public = true")
        .bind(skill_id)
        .fetch_optional(&state.db)
        .await
        .unwrap_or(None);

    if exists.is_none() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Skill not found"})),
        )
            .into_response();
    }

    let _ = sqlx::query(
        "INSERT INTO user_favorite_skills (user_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(&user.id)
    .bind(skill_id)
    .execute(&state.db)
    .await;

    Json(json!({"ok": true})).into_response()
}

/// DELETE /api/skills/:id/favorite
async fn remove_favorite(
    State(state): State<AppState>,
    user: AuthUser,
    Path(skill_id): Path<Uuid>,
) -> Response {
    let _ =
        sqlx::query("DELETE FROM user_favorite_skills WHERE user_id = $1 AND skill_id = $2")
            .bind(&user.id)
            .bind(skill_id)
            .execute(&state.db)
            .await;

    StatusCode::NO_CONTENT.into_response()
}

/// GET /api/skills/favorites
async fn list_favorites(State(state): State<AppState>, user: AuthUser) -> Response {
    let rows = sqlx::query_as::<_, SkillListRow>(
        r#"
        SELECT s.id, s.name, s.slug, s.description, s.category, s.icon_url, s.version,
               s.slash_command, s.prompt_template, s.is_official, s.is_public,
               s.created_by, s.install_count, s.source_url, s.name_i18n, s.description_i18n,
               s.created_at, s.updated_at,
               true AS is_favorited,
               COALESCE(ARRAY(
                   SELECT ask.agent_id FROM agent_skills ask
                   WHERE ask.skill_id = s.id AND ask.installed_by = $1
               ), ARRAY[]::uuid[]) AS installed_agent_ids
        FROM user_favorite_skills uf
        JOIN skills s ON s.id = uf.skill_id
        WHERE uf.user_id = $1
        ORDER BY uf.created_at DESC
        "#,
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(skills) => {
            let items: Vec<_> = skills.iter().map(skill_list_to_json).collect();
            Json(json!({ "skills": items })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

/// GET /api/agents/:id/commands — list slash commands from installed skills
async fn list_agent_commands(
    State(state): State<AppState>,
    user: AuthUser,
    Path(agent_id): Path<Uuid>,
) -> Response {
    // Verify user owns the agent
    if let Err(resp) = verify_agent_ownership(&state.db, agent_id, &user.id).await {
        return resp;
    }

    #[derive(FromRow)]
    struct CommandRow {
        skill_id: Uuid,
        name: String,
        slug: String,
        description: String,
        slash_command: Option<String>,
        icon_url: Option<String>,
        parameters: serde_json::Value,
    }

    let rows = sqlx::query_as::<_, CommandRow>(
        r#"
        SELECT s.id AS skill_id, s.name, s.slug, s.description, s.slash_command,
               s.icon_url, s.parameters
        FROM agent_skills ask
        JOIN skills s ON s.id = ask.skill_id
        WHERE ask.agent_id = $1 AND ask.is_enabled = true AND s.slash_command IS NOT NULL
        ORDER BY s.name
        "#,
    )
    .bind(agent_id)
    .fetch_all(&state.db)
    .await;

    match rows {
        Ok(cmds) => {
            let items: Vec<_> = cmds
                .iter()
                .map(|c| {
                    json!({
                        "id": c.skill_id.to_string(),
                        "name": &c.name,
                        "slug": &c.slug,
                        "description": &c.description,
                        "slashCommand": &c.slash_command,
                        "iconUrl": &c.icon_url,
                        "parameters": &c.parameters,
                    })
                })
                .collect();
            Json(json!({ "commands": items })).into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ===== Built-in Skill: arinova-search =====

#[derive(Deserialize)]
struct ArinovaSearchBody {
    query: String,
}

/// POST /api/skills/arinova-search — global search across conversations, memories, capsules
async fn arinova_search(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<ArinovaSearchBody>,
) -> Response {
    let q = body.query.trim();
    if q.is_empty() || q.len() > 500 {
        return (StatusCode::BAD_REQUEST, Json(json!({"error": "Query must be 1-500 characters"}))).into_response();
    }

    let pattern = format!("%{}%", q.replace('%', "\\%").replace('_', "\\_"));

    // 1. Search messages in user's conversations
    let msg_rows = sqlx::query_as::<_, (uuid::Uuid, uuid::Uuid, String, chrono::NaiveDateTime)>(
        r#"SELECT m.id, m.conversation_id, m.content, m.created_at
           FROM messages m
           JOIN conversations c ON c.id = m.conversation_id
           WHERE (c.user_id = $1 OR EXISTS (
               SELECT 1 FROM conversation_user_members cum WHERE cum.conversation_id = c.id AND cum.user_id = $1
           ))
           AND m.content ILIKE $2 AND m.content != ''
           ORDER BY m.created_at DESC LIMIT 10"#,
    )
    .bind(&user.id)
    .bind(&pattern)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // 2. Search memory entries (agent memories)
    let mem_rows = sqlx::query_as::<_, (uuid::Uuid, String, chrono::DateTime<chrono::Utc>)>(
        r#"SELECT am.id, am.content, am.created_at
           FROM agent_memories am
           JOIN agents a ON a.id = am.agent_id
           WHERE a.owner_id = $1 AND am.content ILIKE $2
           ORDER BY am.created_at DESC LIMIT 5"#,
    )
    .bind(&user.id)
    .bind(&pattern)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // 3. Search memory capsule entries
    let cap_rows = sqlx::query_as::<_, (uuid::Uuid, String, String, chrono::DateTime<chrono::Utc>)>(
        r#"SELECT me.id, me.content, mc.name, me.created_at
           FROM memory_entries me
           JOIN memory_capsules mc ON mc.id = me.capsule_id
           WHERE mc.owner_id = $1 AND me.content ILIKE $2
           ORDER BY me.created_at DESC LIMIT 5"#,
    )
    .bind(&user.id)
    .bind(&pattern)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    // Merge + sort by createdAt DESC + truncate to 20
    let mut results: Vec<serde_json::Value> = Vec::new();

    for (id, conv_id, content, created_at) in &msg_rows {
        let truncated = if content.len() > 200 { let mut e = 200; while !content.is_char_boundary(e) { e -= 1; } format!("{}...", &content[..e]) } else { content.clone() };
        results.push(json!({
            "source": "conversation",
            "id": id,
            "content": truncated,
            "context": format!("conversation:{}", conv_id),
            "createdAt": created_at.and_utc().to_rfc3339(),
        }));
    }

    for (id, content, created_at) in &mem_rows {
        let truncated = if content.len() > 200 { let mut e = 200; while !content.is_char_boundary(e) { e -= 1; } format!("{}...", &content[..e]) } else { content.clone() };
        results.push(json!({
            "source": "memory",
            "id": id,
            "content": truncated,
            "createdAt": created_at.to_rfc3339(),
        }));
    }

    for (id, content, capsule_name, created_at) in &cap_rows {
        let truncated = if content.len() > 200 { let mut e = 200; while !content.is_char_boundary(e) { e -= 1; } format!("{}...", &content[..e]) } else { content.clone() };
        results.push(json!({
            "source": "capsule",
            "id": id,
            "content": truncated,
            "context": capsule_name,
            "createdAt": created_at.to_rfc3339(),
        }));
    }

    results.sort_by(|a, b| {
        let ta = a.get("createdAt").and_then(|v| v.as_str()).unwrap_or("");
        let tb = b.get("createdAt").and_then(|v| v.as_str()).unwrap_or("");
        tb.cmp(ta)
    });
    if results.len() > 20 { results.truncate(20); }

    Json(json!({ "results": results })).into_response()
}
