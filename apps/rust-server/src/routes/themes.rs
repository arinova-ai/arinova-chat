use axum::{
    extract::{Multipart, Path, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    routing::{get, post, delete},
    Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::Read;
use std::path::PathBuf;

use crate::auth::middleware::AuthUser;
use crate::AppState;

/// Maximum total bundle size: 200 MB
const MAX_BUNDLE_SIZE: usize = 200 * 1024 * 1024;
/// Maximum theme.json size: 256 KB
const MAX_MANIFEST_SIZE: usize = 256 * 1024;

/// Allowed asset file extensions inside the zip bundle.
const ALLOWED_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "webp", "gif", "svg",
    "glb", "gltf",
    "mp3", "ogg", "wav",
    "json",
];

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/themes/upload", post(upload_theme))
        .route("/api/themes", get(list_themes))
        .route("/api/themes/{themeId}", delete(delete_theme))
}

// ---------------------------------------------------------------------------
// Minimal manifest validation (Rust-side, mirrors the Zod schema's key rules)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestMeta {
    id: String,
    name: String,
    version: String,
    #[serde(default)]
    renderer: Option<String>,
    #[serde(default)]
    room: Option<Value>,
    #[serde(default)]
    zones: Option<Vec<Value>>,
    #[serde(default)]
    layers: Option<Vec<Value>>,
    #[serde(default)]
    characters: Option<Value>,
}

fn validate_manifest(raw: &[u8]) -> Result<ManifestMeta, String> {
    let meta: ManifestMeta =
        serde_json::from_slice(raw).map_err(|e| format!("Invalid JSON: {}", e))?;

    // id: kebab-case
    let id_re = regex_lite::Regex::new(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$").unwrap();
    if !id_re.is_match(&meta.id) {
        return Err("id must be kebab-case (e.g. my-cool-theme)".into());
    }
    if meta.id.len() > 100 {
        return Err("id must be at most 100 characters".into());
    }

    // name: non-empty
    if meta.name.trim().is_empty() || meta.name.len() > 100 {
        return Err("name must be 1-100 characters".into());
    }

    // version: semver
    let ver_re = regex_lite::Regex::new(r"^\d+\.\d+\.\d+$").unwrap();
    if !ver_re.is_match(&meta.version) {
        return Err("version must be semver (e.g. 1.0.0)".into());
    }

    // Renderer-specific checks
    let is_v3 = meta.renderer.as_deref() == Some("threejs")
        || meta.room.as_ref().and_then(|r| r.get("model")).is_some();

    if !is_v3 {
        // v2: needs zones, layers, characters
        let zones_empty = meta.zones.as_ref().map_or(true, |z| z.is_empty());
        let layers_empty = meta.layers.as_ref().map_or(true, |l| l.is_empty());
        let chars_missing = meta.characters.is_none();
        if zones_empty || layers_empty || chars_missing {
            return Err(
                "v2 (pixi) themes require non-empty zones, layers, and a characters config".into(),
            );
        }
    } else {
        // v3: needs room.model
        let has_room_model = meta
            .room
            .as_ref()
            .and_then(|r| r.get("model"))
            .and_then(|m| m.as_str())
            .map_or(false, |s| !s.is_empty());
        if !has_room_model {
            return Err("v3 (threejs) themes require room.model path".into());
        }
    }

    Ok(meta)
}

/// Check that a zip entry's file name uses only safe, allowed extensions
/// and does not contain path traversal.
fn is_safe_zip_entry(name: &str) -> bool {
    // No path traversal
    if name.contains("..") || name.starts_with('/') || name.starts_with('\\') {
        return false;
    }
    // Directories are OK
    if name.ends_with('/') {
        return true;
    }
    // Check extension
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    ALLOWED_EXTENSIONS.contains(&ext.as_str())
}

// ---------------------------------------------------------------------------
// POST /api/themes/upload
// Multipart: "manifest" (JSON text) + "bundle" (zip file)
// ---------------------------------------------------------------------------

async fn upload_theme(
    State(state): State<AppState>,
    _user: AuthUser,
    mut multipart: Multipart,
) -> Response {
    let mut manifest_bytes: Option<Vec<u8>> = None;
    let mut bundle_bytes: Option<Vec<u8>> = None;

    // Phase 1: Read multipart fields
    while let Ok(Some(field)) = multipart.next_field().await {
        let field_name = field.name().unwrap_or("").to_string();

        match field_name.as_str() {
            "manifest" => {
                let data = match field.bytes().await {
                    Ok(d) => d,
                    Err(_) => {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({"error": "Failed to read manifest field"})),
                        )
                            .into_response();
                    }
                };
                if data.len() > MAX_MANIFEST_SIZE {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({"error": "theme.json exceeds 256 KB limit"})),
                    )
                        .into_response();
                }
                manifest_bytes = Some(data.to_vec());
            }
            "bundle" => {
                let data = match field.bytes().await {
                    Ok(d) => d,
                    Err(_) => {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(json!({"error": "Failed to read bundle field"})),
                        )
                            .into_response();
                    }
                };
                if data.len() > MAX_BUNDLE_SIZE {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({
                            "error": format!(
                                "Bundle size ({} bytes) exceeds 200 MB limit",
                                data.len()
                            )
                        })),
                    )
                        .into_response();
                }
                bundle_bytes = Some(data.to_vec());
            }
            _ => {
                // Ignore unknown fields
            }
        }
    }

    // Phase 2: Validate manifest
    let manifest_raw = match manifest_bytes {
        Some(b) => b,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Missing 'manifest' field (theme.json content)"})),
            )
                .into_response();
        }
    };

    let meta = match validate_manifest(&manifest_raw) {
        Ok(m) => m,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": format!("Manifest validation failed: {}", e)})),
            )
                .into_response();
        }
    };

    let theme_id = meta.id.clone();

    // Phase 3: Prepare output directory
    let themes_dir = themes_base_dir(&state);
    let theme_dir = themes_dir.join(&theme_id);

    // If theme already exists, remove old version first
    if theme_dir.exists() {
        if let Err(e) = tokio::fs::remove_dir_all(&theme_dir).await {
            tracing::error!("Failed to remove existing theme dir: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to replace existing theme"})),
            )
                .into_response();
        }
    }

    if let Err(e) = tokio::fs::create_dir_all(&theme_dir).await {
        tracing::error!("Failed to create theme dir: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Failed to create theme directory"})),
        )
            .into_response();
    }

    // Write theme.json
    if let Err(e) = tokio::fs::write(theme_dir.join("theme.json"), &manifest_raw).await {
        tracing::error!("Failed to write theme.json: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Failed to write theme.json"})),
        )
            .into_response();
    }

    // Phase 4: Extract bundle zip (if provided)
    if let Some(zip_data) = bundle_bytes {
        let out_dir = theme_dir.clone();
        let extract_result = tokio::task::spawn_blocking(move || {
            extract_zip(&zip_data, &out_dir)
        })
        .await;

        match extract_result {
            Ok(Ok(count)) => {
                tracing::info!("Theme '{}': extracted {} asset files", theme_id, count);
            }
            Ok(Err(e)) => {
                // Cleanup on failure
                let _ = tokio::fs::remove_dir_all(&theme_dir).await;
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error": format!("Bundle extraction failed: {}", e)})),
                )
                    .into_response();
            }
            Err(e) => {
                let _ = tokio::fs::remove_dir_all(&theme_dir).await;
                tracing::error!("spawn_blocking panicked: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": "Internal error during extraction"})),
                )
                    .into_response();
            }
        }
    }

    (
        StatusCode::CREATED,
        Json(json!({
            "themeId": theme_id,
            "name": meta.name,
            "version": meta.version,
        })),
    )
        .into_response()
}

/// Synchronous zip extraction (runs inside spawn_blocking).
fn extract_zip(data: &[u8], out_dir: &std::path::Path) -> Result<usize, String> {
    let cursor = std::io::Cursor::new(data);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Invalid zip: {}", e))?;

    let mut count = 0usize;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("Zip entry error: {}", e))?;
        let name = entry.name().to_string();

        if !is_safe_zip_entry(&name) {
            return Err(format!(
                "Disallowed file in bundle: '{}' (unsupported extension or path traversal)",
                name
            ));
        }

        let out_path = out_dir.join(&name);

        // Ensure path stays within out_dir (belt-and-suspenders)
        if !out_path.starts_with(out_dir) {
            return Err(format!("Path traversal detected: '{}'", name));
        }

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)
                .map_err(|e| format!("Failed to create dir '{}': {}", name, e))?;
        } else {
            // Ensure parent directories exist
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent dir: {}", e))?;
            }

            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("Failed to read zip entry '{}': {}", name, e))?;

            std::fs::write(&out_path, &buf)
                .map_err(|e| format!("Failed to write '{}': {}", name, e))?;

            count += 1;
        }
    }

    Ok(count)
}

// ---------------------------------------------------------------------------
// GET /api/themes — List installed themes
// ---------------------------------------------------------------------------

async fn list_themes(
    State(state): State<AppState>,
    _user: AuthUser,
) -> Response {
    let themes_dir = themes_base_dir(&state);

    let mut themes: Vec<Value> = Vec::new();

    let mut entries = match tokio::fs::read_dir(&themes_dir).await {
        Ok(e) => e,
        Err(_) => {
            // No themes directory yet
            return (StatusCode::OK, Json(json!({ "themes": [] }))).into_response();
        }
    };

    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let manifest_path = path.join("theme.json");
        if let Ok(data) = tokio::fs::read(&manifest_path).await {
            if let Ok(val) = serde_json::from_slice::<Value>(&data) {
                themes.push(json!({
                    "id": val.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                    "name": val.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                    "version": val.get("version").and_then(|v| v.as_str()).unwrap_or(""),
                    "description": val.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                    "renderer": val.get("renderer").and_then(|v| v.as_str()).unwrap_or("pixi"),
                }));
            }
        }
    }

    (StatusCode::OK, Json(json!({ "themes": themes }))).into_response()
}

// ---------------------------------------------------------------------------
// DELETE /api/themes/:themeId — Remove a theme
// ---------------------------------------------------------------------------

async fn delete_theme(
    State(state): State<AppState>,
    _user: AuthUser,
    Path(theme_id): Path<String>,
) -> Response {
    // Validate theme_id format
    let id_re = regex_lite::Regex::new(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?$").unwrap();
    if !id_re.is_match(&theme_id) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid theme ID"})),
        )
            .into_response();
    }

    let theme_dir = themes_base_dir(&state).join(&theme_id);
    if !theme_dir.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Theme not found"})),
        )
            .into_response();
    }

    match tokio::fs::remove_dir_all(&theme_dir).await {
        Ok(_) => (StatusCode::OK, Json(json!({"deleted": theme_id}))).into_response(),
        Err(e) => {
            tracing::error!("Failed to delete theme '{}': {}", theme_id, e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to delete theme"})),
            )
                .into_response()
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Resolve the base themes directory. Falls back to `{upload_dir}/themes`.
fn themes_base_dir(state: &AppState) -> PathBuf {
    // Check THEMES_DIR env var first, otherwise default to upload_dir/themes
    std::env::var("THEMES_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(&state.config.upload_dir).join("themes"))
}
