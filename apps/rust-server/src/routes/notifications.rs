use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, put},
    Router,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/api/notifications/preferences",
        get(get_preferences).put(update_preferences),
    )
}

async fn get_preferences(
    State(state): State<AppState>,
    user: AuthUser,
) -> Response {
    let prefs = sqlx::query_as::<_, crate::db::models::NotificationPreference>(
        "SELECT * FROM notification_preferences WHERE user_id = $1",
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await;

    match prefs {
        Ok(Some(p)) => Json(json!({
            "id": p.id,
            "userId": p.user_id,
            "globalEnabled": p.global_enabled,
            "messageEnabled": p.message_enabled,
            "playgroundInviteEnabled": p.playground_invite_enabled,
            "playgroundTurnEnabled": p.playground_turn_enabled,
            "playgroundResultEnabled": p.playground_result_enabled,
            "quietHoursStart": p.quiet_hours_start,
            "quietHoursEnd": p.quiet_hours_end,
        }))
        .into_response(),
        Ok(None) => {
            // Return defaults
            Json(json!({
                "id": null,
                "userId": user.id,
                "globalEnabled": true,
                "messageEnabled": true,
                "playgroundInviteEnabled": true,
                "playgroundTurnEnabled": true,
                "playgroundResultEnabled": true,
                "quietHoursStart": null,
                "quietHoursEnd": null,
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

#[derive(Deserialize)]
struct UpdatePreferencesBody {
    #[serde(rename = "globalEnabled")]
    global_enabled: Option<bool>,
    #[serde(rename = "messageEnabled")]
    message_enabled: Option<bool>,
    #[serde(rename = "playgroundInviteEnabled")]
    playground_invite_enabled: Option<bool>,
    #[serde(rename = "playgroundTurnEnabled")]
    playground_turn_enabled: Option<bool>,
    #[serde(rename = "playgroundResultEnabled")]
    playground_result_enabled: Option<bool>,
    #[serde(rename = "quietHoursStart")]
    quiet_hours_start: Option<String>,
    #[serde(rename = "quietHoursEnd")]
    quiet_hours_end: Option<String>,
}

async fn update_preferences(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<UpdatePreferencesBody>,
) -> Response {
    let pref_id = Uuid::new_v4();

    // Upsert: insert or update on conflict
    let result = sqlx::query_as::<_, crate::db::models::NotificationPreference>(
        r#"INSERT INTO notification_preferences
               (id, user_id, global_enabled, message_enabled,
                playground_invite_enabled, playground_turn_enabled, playground_result_enabled,
                quiet_hours_start, quiet_hours_end)
           VALUES ($1, $2,
                   COALESCE($3, true), COALESCE($4, true),
                   COALESCE($5, true), COALESCE($6, true), COALESCE($7, true),
                   $8, $9)
           ON CONFLICT (user_id) DO UPDATE SET
               global_enabled = COALESCE($3, notification_preferences.global_enabled),
               message_enabled = COALESCE($4, notification_preferences.message_enabled),
               playground_invite_enabled = COALESCE($5, notification_preferences.playground_invite_enabled),
               playground_turn_enabled = COALESCE($6, notification_preferences.playground_turn_enabled),
               playground_result_enabled = COALESCE($7, notification_preferences.playground_result_enabled),
               quiet_hours_start = COALESCE($8, notification_preferences.quiet_hours_start),
               quiet_hours_end = COALESCE($9, notification_preferences.quiet_hours_end)
           RETURNING *"#,
    )
    .bind(pref_id)
    .bind(&user.id)
    .bind(body.global_enabled)
    .bind(body.message_enabled)
    .bind(body.playground_invite_enabled)
    .bind(body.playground_turn_enabled)
    .bind(body.playground_result_enabled)
    .bind(&body.quiet_hours_start)
    .bind(&body.quiet_hours_end)
    .fetch_one(&state.db)
    .await;

    match result {
        Ok(p) => Json(json!({
            "id": p.id,
            "userId": p.user_id,
            "globalEnabled": p.global_enabled,
            "messageEnabled": p.message_enabled,
            "playgroundInviteEnabled": p.playground_invite_enabled,
            "playgroundTurnEnabled": p.playground_turn_enabled,
            "playgroundResultEnabled": p.playground_result_enabled,
            "quietHoursStart": p.quiet_hours_start,
            "quietHoursEnd": p.quiet_hours_end,
        }))
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
