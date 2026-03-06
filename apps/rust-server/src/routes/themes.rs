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
use crate::services::r2::upload_to_r2;
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
        .route("/api/themes/config", get(theme_config))
        .route("/api/themes/owned", get(owned_themes))
        .route("/api/themes/{themeId}", delete(delete_theme))
        .route("/api/themes/{themeId}/purchase", post(purchase_theme))
}

/// GET /api/themes/config — Returns the base URL for theme assets.
/// Frontend uses this to know whether to load from R2 or local.
async fn theme_config(State(state): State<AppState>) -> Json<Value> {
    let base_url = if state.s3.is_some() && !state.config.r2_public_url.is_empty() {
        format!("{}/themes", state.config.r2_public_url)
    } else {
        "/themes".to_string()
    };
    Json(json!({ "themeAssetsBaseUrl": base_url }))
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
    let renderer = meta.renderer.as_deref().unwrap_or("pixi");
    let is_v3 = renderer == "threejs"
        || meta.room.as_ref().and_then(|r| r.get("model")).is_some();

    match renderer {
        "sprite" | "avg" => {
            // sprite and avg themes have their own structure — skip v2 zone/layer validation
        }
        _ if is_v3 => {
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
        _ => {
            // v2 (pixi): needs zones, layers, characters
            let zones_empty = meta.zones.as_ref().map_or(true, |z| z.is_empty());
            let layers_empty = meta.layers.as_ref().map_or(true, |l| l.is_empty());
            let chars_missing = meta.characters.is_none();
            if zones_empty || layers_empty || chars_missing {
                return Err(
                    "v2 (pixi) themes require non-empty zones, layers, and a characters config".into(),
                );
            }
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

    // Phase 3: Upload to R2 if configured, otherwise fall back to local filesystem
    if let Some(s3) = &state.s3 {
        // ── R2 path ──────────────────────────────────────────────
        let bucket = &state.config.r2_bucket;
        let public_url = &state.config.r2_public_url;

        // Upload theme.json
        let manifest_key = format!("themes/{}/theme.json", theme_id);
        if let Err(e) = upload_to_r2(
            s3,
            bucket,
            &manifest_key,
            manifest_raw.clone(),
            "application/json",
            public_url,
        )
        .await
        {
            tracing::error!("R2 upload theme.json failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to upload theme.json to storage"})),
            )
                .into_response();
        }

        // Extract and upload bundle files
        if let Some(zip_data) = bundle_bytes {
            let tid = theme_id.clone();
            let extract_result = tokio::task::spawn_blocking(move || {
                extract_zip_to_memory(&zip_data, &tid)
            })
            .await;

            match extract_result {
                Ok(Ok(files)) => {
                    let count = files.len();
                    for (key, data, content_type) in files {
                        if let Err(e) =
                            upload_to_r2(s3, bucket, &key, data, &content_type, public_url).await
                        {
                            tracing::error!("R2 upload '{}' failed: {}", key, e);
                            return (
                                StatusCode::INTERNAL_SERVER_ERROR,
                                Json(json!({"error": format!("Failed to upload asset: {}", key)})),
                            )
                                .into_response();
                        }
                    }
                    tracing::info!(
                        "Theme '{}': uploaded {} assets to R2",
                        theme_id,
                        count
                    );
                }
                Ok(Err(e)) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(json!({"error": format!("Bundle extraction failed: {}", e)})),
                    )
                        .into_response();
                }
                Err(e) => {
                    tracing::error!("spawn_blocking panicked: {}", e);
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({"error": "Internal error during extraction"})),
                    )
                        .into_response();
                }
            }
        }
    } else {
        // ── Local filesystem fallback (dev mode) ─────────────────
        let themes_dir = themes_base_dir(&state);
        let theme_dir = themes_dir.join(&theme_id);

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

        if let Err(e) = tokio::fs::write(theme_dir.join("theme.json"), &manifest_raw).await {
            tracing::error!("Failed to write theme.json: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to write theme.json"})),
            )
                .into_response();
        }

        if let Some(zip_data) = bundle_bytes {
            let out_dir = theme_dir.clone();
            let extract_result =
                tokio::task::spawn_blocking(move || extract_zip(&zip_data, &out_dir)).await;

            match extract_result {
                Ok(Ok(count)) => {
                    tracing::info!("Theme '{}': extracted {} asset files (local)", theme_id, count);
                }
                Ok(Err(e)) => {
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

/// Synchronous zip extraction to memory (for R2 upload). Returns Vec<(r2_key, data, content_type)>.
fn extract_zip_to_memory(
    data: &[u8],
    theme_id: &str,
) -> Result<Vec<(String, Vec<u8>, String)>, String> {
    let cursor = std::io::Cursor::new(data);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Invalid zip: {}", e))?;

    let mut files = Vec::new();

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("Zip entry error: {}", e))?;
        let name = entry.name().to_string();

        if !is_safe_zip_entry(&name) {
            return Err(format!(
                "Disallowed file in bundle: '{}' (unsupported extension or path traversal)",
                name
            ));
        }

        if entry.is_dir() {
            continue;
        }

        let mut buf = Vec::new();
        entry
            .read_to_end(&mut buf)
            .map_err(|e| format!("Failed to read zip entry '{}': {}", name, e))?;

        let r2_key = format!("themes/{}/{}", theme_id, name);
        let content_type = mime_from_extension(&name);
        files.push((r2_key, buf, content_type));
    }

    Ok(files)
}

/// Guess MIME type from file extension.
fn mime_from_extension(name: &str) -> String {
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "glb" => "model/gltf-binary",
        "gltf" => "model/gltf+json",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "json" => "application/json",
        _ => "application/octet-stream",
    }
    .to_string()
}

/// Synchronous zip extraction to local disk (runs inside spawn_blocking).
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
    let mut themes: Vec<Value> = Vec::new();

    if let Some(s3) = &state.s3 {
        // ── R2 path: list objects with prefix "themes/" and find theme.json files ──
        let bucket = &state.config.r2_bucket;
        match s3
            .list_objects_v2()
            .bucket(bucket)
            .prefix("themes/")
            .delimiter("/")
            .send()
            .await
        {
            Ok(output) => {
                // Common prefixes = theme directories (e.g. "themes/avg-classroom/")
                let prefixes: Vec<String> = output
                    .common_prefixes()
                    .iter()
                    .filter_map(|cp| cp.prefix().map(|s| s.to_string()))
                    .collect();

                for prefix in prefixes {
                    let manifest_key = format!("{}theme.json", prefix);
                    if let Ok(obj) = s3.get_object().bucket(bucket).key(&manifest_key).send().await
                    {
                        if let Ok(body) = obj.body.collect().await {
                            let bytes = body.into_bytes();
                            if let Ok(val) = serde_json::from_slice::<Value>(&bytes) {
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
                }
            }
            Err(e) => {
                tracing::error!("R2 list_objects failed: {}", e);
            }
        }
    } else {
        // ── Local filesystem fallback ──
        let themes_dir = themes_base_dir(&state);
        let mut entries = match tokio::fs::read_dir(&themes_dir).await {
            Ok(e) => e,
            Err(_) => {
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

    if let Some(s3) = &state.s3 {
        // ── R2 path: delete all objects with prefix themes/{themeId}/ ──
        let bucket = &state.config.r2_bucket;
        let prefix = format!("themes/{}/", theme_id);

        match s3
            .list_objects_v2()
            .bucket(bucket)
            .prefix(&prefix)
            .send()
            .await
        {
            Ok(output) => {
                let keys: Vec<String> = output
                    .contents()
                    .iter()
                    .filter_map(|obj| obj.key().map(|k| k.to_string()))
                    .collect();

                if keys.is_empty() {
                    return (
                        StatusCode::NOT_FOUND,
                        Json(json!({"error": "Theme not found"})),
                    )
                        .into_response();
                }

                for key in &keys {
                    if let Err(e) = s3.delete_object().bucket(bucket).key(key).send().await {
                        tracing::error!("R2 delete '{}' failed: {}", key, e);
                    }
                }

                tracing::info!("Theme '{}': deleted {} objects from R2", theme_id, keys.len());
            }
            Err(e) => {
                tracing::error!("R2 list for delete failed: {}", e);
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": "Failed to list theme files"})),
                )
                    .into_response();
            }
        }
    } else {
        // ── Local filesystem fallback ──
        let theme_dir = themes_base_dir(&state).join(&theme_id);
        if !theme_dir.exists() {
            return (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Theme not found"})),
            )
                .into_response();
        }

        if let Err(e) = tokio::fs::remove_dir_all(&theme_dir).await {
            tracing::error!("Failed to delete theme '{}': {}", theme_id, e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Failed to delete theme"})),
            )
                .into_response();
        }
    }

    (StatusCode::OK, Json(json!({"deleted": theme_id}))).into_response()
}

// ---------------------------------------------------------------------------
// POST /api/themes/:themeId/purchase — Purchase a theme
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct PurchaseBody {
    price: i32,
}

async fn purchase_theme(
    State(state): State<AppState>,
    user: AuthUser,
    Path(theme_id): Path<String>,
    Json(body): Json<PurchaseBody>,
) -> (StatusCode, Json<Value>) {
    let price = body.price;
    if price <= 0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Price must be positive"})),
        );
    }

    // Check if already purchased
    let already = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM theme_purchases WHERE user_id = $1 AND theme_id = $2",
    )
    .bind(&user.id)
    .bind(&theme_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    if already > 0 {
        return (
            StatusCode::OK,
            Json(json!({"already_owned": true, "theme_id": theme_id})),
        );
    }

    // === Begin transaction ===
    let mut tx = match state.db.begin().await {
        Ok(tx) => tx,
        Err(e) => {
            tracing::error!("purchase_theme: begin tx failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Internal error"})),
            );
        }
    };

    // Atomic deduction: only succeeds if balance >= price
    let new_balance = match sqlx::query_scalar::<_, i32>(
        r#"UPDATE coin_balances
           SET balance = balance - $2, updated_at = NOW()
           WHERE user_id = $1 AND balance >= $2
           RETURNING balance"#,
    )
    .bind(&user.id)
    .bind(price)
    .fetch_optional(&mut *tx)
    .await
    {
        Ok(Some(b)) => b,
        Ok(None) => {
            return (
                StatusCode::PAYMENT_REQUIRED,
                Json(json!({"error": "Insufficient balance"})),
            );
        }
        Err(e) => {
            tracing::error!("purchase_theme: deduction failed: {}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": "Payment failed"})),
            );
        }
    };

    // Record purchase in theme_purchases
    if let Err(e) = sqlx::query(
        r#"INSERT INTO theme_purchases (user_id, theme_id, price)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, theme_id) DO NOTHING"#,
    )
    .bind(&user.id)
    .bind(&theme_id)
    .bind(price)
    .execute(&mut *tx)
    .await
    {
        tracing::error!("purchase_theme: insert failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Failed to record purchase"})),
        );
    }

    // Record transaction
    if let Err(e) = sqlx::query(
        r#"INSERT INTO coin_transactions (user_id, type, amount, description)
           VALUES ($1, 'purchase', $2, $3)"#,
    )
    .bind(&user.id)
    .bind(-price)
    .bind(format!("Theme purchase: {}", theme_id))
    .execute(&mut *tx)
    .await
    {
        tracing::error!("purchase_theme: record tx failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Failed to record transaction"})),
        );
    }

    // === Commit ===
    if let Err(e) = tx.commit().await {
        tracing::error!("purchase_theme: commit failed: {}", e);
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": "Transaction failed"})),
        );
    }

    tracing::info!(
        "User {} purchased theme '{}' for {} coins (new balance: {})",
        user.id, theme_id, price, new_balance
    );

    (
        StatusCode::OK,
        Json(json!({
            "theme_id": theme_id,
            "price": price,
            "balance": new_balance,
        })),
    )
}

// ---------------------------------------------------------------------------
// GET /api/themes/owned — List themes the user has purchased
// ---------------------------------------------------------------------------

async fn owned_themes(
    State(state): State<AppState>,
    user: AuthUser,
) -> (StatusCode, Json<Value>) {
    let rows = sqlx::query_as::<_, (String,)>(
        "SELECT theme_id FROM theme_purchases WHERE user_id = $1",
    )
    .bind(&user.id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let theme_ids: Vec<String> = rows.into_iter().map(|(id,)| id).collect();

    (StatusCode::OK, Json(json!({"owned": theme_ids})))
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
