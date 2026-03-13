use axum::{
    extract::State,
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
    Router::new().route("/api/agent/skills/installed", get(list_installed_skills))
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
