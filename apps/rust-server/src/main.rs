use axum::extract::DefaultBodyLimit;
use axum::Router;
use std::net::SocketAddr;
use tower_http::cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

use arinova_server::{config, db, services, routes, ws, AppState};

#[tokio::main]
async fn main() {
    // Load .env
    dotenvy::dotenv().ok();

    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    // Load config
    let config = config::Config::from_env();
    let port = config.port;

    // Initialize database pool
    let db = db::create_pool(&config.database_url).await;
    tracing::info!("PostgreSQL connected");

    // Clean up stuck streaming messages from previous run
    match sqlx::query(
        r#"UPDATE messages SET status = 'error', content = CASE WHEN content = '' THEN 'Stream interrupted by server restart' ELSE content END, updated_at = NOW()
           WHERE status = 'streaming'"#,
    )
    .execute(&db)
    .await
    {
        Ok(result) => {
            if result.rows_affected() > 0 {
                tracing::info!("Cleaned up {} stuck streaming messages", result.rows_affected());
            }
        }
        Err(e) => tracing::warn!("Failed to clean up stuck streaming messages: {}", e),
    }

    // Initialize Redis pool
    let redis = db::redis::create_redis_pool(&config.redis_url);
    tracing::info!("Redis pool created");

    // Initialize S3 client for R2
    let s3 = services::r2::create_s3_client(&config);
    if s3.is_some() {
        tracing::info!("R2 storage configured");
    }

    // Create WebSocket state
    let ws_state = ws::state::WsState::new();

    // Create Office state + start periodic tick loop
    let office_state = services::office::OfficeState::new();
    {
        let office = office_state.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(15));
            loop {
                interval.tick().await;
                office.tick();
            }
        });
    }
    tracing::info!("Office state initialized");

    // Build application state
    let state = AppState {
        db,
        redis,
        config: config.clone(),
        ws: ws_state,
        s3,
        office: office_state,
    };

    // Build CORS layer
    let cors_origins: Vec<String> = config.cors_origins();
    let is_wildcard = cors_origins.len() == 1 && cors_origins[0] == "*";

    let cors = if is_wildcard {
        // Mirror everything back so credentials (cookies) work with any origin
        CorsLayer::new()
            .allow_origin(AllowOrigin::mirror_request())
            .allow_methods(AllowMethods::mirror_request())
            .allow_headers(AllowHeaders::mirror_request())
            .allow_credentials(true)
    } else {
        let origins: Vec<axum::http::HeaderValue> = cors_origins
            .iter()
            .filter_map(|o| o.parse().ok())
            .collect();
        CorsLayer::new()
            .allow_origin(AllowOrigin::list(origins))
            .allow_methods(AllowMethods::mirror_request())
            .allow_headers(AllowHeaders::mirror_request())
            .allow_credentials(true)
    };

    // Build router
    let app = Router::new()
        .merge(routes::health::router())
        .merge(routes::auth::router())
        .merge(routes::agents::router())
        .merge(routes::conversations::router())
        .merge(routes::messages::router())
        .merge(routes::groups::router())
        .merge(routes::reactions::router())
        .merge(routes::uploads::router())
        .merge(routes::push::router())
        .merge(routes::notifications::router())
        .merge(routes::sandbox::router())
        .merge(routes::agent_health::router())
        .merge(routes::agent_send::router())
        .merge(routes::agent_uploads::router())
        .merge(routes::office::router())
        .merge(routes::users::router())
        .merge(routes::friends::router())
        .merge(routes::blocking::router())
        .merge(routes::wallet::router())
        .merge(routes::marketplace::router())
        .merge(routes::marketplace_chat::router())
        .merge(routes::creator::router())
        .merge(routes::knowledge_base::router())
        .merge(ws::handler::router())
        .merge(ws::agent_handler::router())
        .with_state(state)
        .layer(DefaultBodyLimit::max(config.max_file_size))
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
