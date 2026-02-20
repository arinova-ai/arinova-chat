use axum::{
    extract::State,
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
        .route("/api/push/vapid-key", get(get_vapid_key))
        .route(
            "/api/push/subscribe",
            post(subscribe).delete(unsubscribe),
        )
}

async fn get_vapid_key(State(state): State<AppState>) -> Response {
    Json(json!({
        "vapidPublicKey": state.config.vapid_public_key,
    }))
    .into_response()
}

#[derive(Deserialize)]
struct SubscribeBody {
    endpoint: String,
    keys: SubscribeKeys,
    #[serde(rename = "deviceInfo")]
    device_info: Option<String>,
}

#[derive(Deserialize)]
struct SubscribeKeys {
    p256dh: String,
    auth: String,
}

async fn subscribe(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<SubscribeBody>,
) -> Response {
    if body.endpoint.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Endpoint is required"})),
        )
            .into_response();
    }

    if body.keys.p256dh.is_empty() || body.keys.auth.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Keys (p256dh, auth) are required"})),
        )
            .into_response();
    }

    let sub_id = Uuid::new_v4();
    let result = sqlx::query(
        r#"INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, device_info)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, endpoint)
           DO UPDATE SET p256dh = EXCLUDED.p256dh,
                         auth = EXCLUDED.auth,
                         device_info = EXCLUDED.device_info"#,
    )
    .bind(sub_id)
    .bind(&user.id)
    .bind(&body.endpoint)
    .bind(&body.keys.p256dh)
    .bind(&body.keys.auth)
    .bind(&body.device_info)
    .execute(&state.db)
    .await;

    match result {
        Ok(_) => (StatusCode::CREATED, Json(json!({"success": true}))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct UnsubscribeBody {
    endpoint: String,
}

async fn unsubscribe(
    State(state): State<AppState>,
    user: AuthUser,
    Json(body): Json<UnsubscribeBody>,
) -> Response {
    let result = sqlx::query(
        "DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2",
    )
    .bind(&user.id)
    .bind(&body.endpoint)
    .execute(&state.db)
    .await;

    match result {
        Ok(r) if r.rows_affected() == 0 => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Subscription not found"})),
        )
            .into_response(),
        Ok(_) => Json(json!({"success": true})).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}
