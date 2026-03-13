use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use chrono::{DateTime, Utc};
use serde_json::json;
use sqlx::FromRow;
use uuid::Uuid;

use crate::auth::middleware::AuthAgent;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/agent/skills/installed", get(list_installed_skills))
        .route("/api/agent/skills/{slug}/prompt", get(get_skill_prompt))
}

/// GET /api/agent/skills/installed — list skills installed on this agent (with prompt_content)
async fn list_installed_skills(
    State(state): State<AppState>,
    agent: AuthAgent,
) -> Response {
    #[derive(FromRow)]
    struct InstalledSkillRow {
        id: Uuid,
        name: String,
        slug: String,
        description: String,
        category: String,
        slash_command: Option<String>,
        prompt_template: String,
        prompt_content: String,
        parameters: serde_json::Value,
        is_enabled: bool,
        config: serde_json::Value,
        installed_at: DateTime<Utc>,
    }

    let rows = sqlx::query_as::<_, InstalledSkillRow>(
        r#"
        SELECT s.id, s.name, s.slug, s.description, s.category,
               s.slash_command, s.prompt_template, s.prompt_content, s.parameters,
               ask.is_enabled, ask.config, ask.installed_at
        FROM agent_skills ask
        JOIN skills s ON s.id = ask.skill_id
        WHERE ask.agent_id = $1 AND ask.is_enabled = true
        ORDER BY s.name
        "#,
    )
    .bind(agent.id)
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
                        "slashCommand": &s.slash_command,
                        "promptTemplate": &s.prompt_template,
                        "promptContent": &s.prompt_content,
                        "parameters": &s.parameters,
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

/// GET /api/agent/skills/:slug/prompt — fetch a skill's prompt content by slug
async fn get_skill_prompt(
    State(state): State<AppState>,
    agent: AuthAgent,
    Path(slug): Path<String>,
) -> Response {
    #[derive(FromRow)]
    struct SkillPromptRow {
        prompt_content: String,
        prompt_template: String,
        parameters: serde_json::Value,
    }

    let row = sqlx::query_as::<_, SkillPromptRow>(
        r#"
        SELECT s.prompt_content, s.prompt_template, s.parameters
        FROM agent_skills ask
        JOIN skills s ON s.id = ask.skill_id
        WHERE ask.agent_id = $1 AND s.slug = $2 AND ask.is_enabled = true
        LIMIT 1
        "#,
    )
    .bind(agent.id)
    .bind(&slug)
    .fetch_optional(&state.db)
    .await;

    match row {
        Ok(Some(s)) => Json(json!({
            "promptContent": &s.prompt_content,
            "promptTemplate": &s.prompt_template,
            "parameters": &s.parameters,
        }))
        .into_response(),
        Ok(None) => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Skill not found or not installed"})),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
