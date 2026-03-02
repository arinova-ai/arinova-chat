use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::get,
    Router,
};
use serde::Deserialize;
use serde_json::json;

use crate::auth::middleware::AuthUser;
use crate::services::link_preview;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/link-preview", get(fetch_preview))
}

#[derive(Deserialize)]
struct PreviewQuery {
    url: String,
}

/// GET /api/link-preview?url=... — Fetch OG metadata for a URL (with caching)
async fn fetch_preview(
    State(state): State<AppState>,
    _user: AuthUser,
    Query(params): Query<PreviewQuery>,
) -> Response {
    let target_url = params.url.trim();

    // Basic validation
    if !target_url.starts_with("http://") && !target_url.starts_with("https://") {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "URL must start with http:// or https://"})),
        )
            .into_response();
    }

    match link_preview::get_or_fetch(&state.db, target_url).await {
        Some(meta) => Json(json!({
            "url": meta.url,
            "title": meta.title,
            "description": meta.description,
            "imageUrl": meta.image_url,
            "faviconUrl": meta.favicon_url,
            "domain": meta.domain,
        }))
        .into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Could not fetch preview for this URL"})),
        )
            .into_response(),
    }
}
