pub mod a2a;
pub mod auth;
pub mod config;
pub mod db;
pub mod services;
pub mod routes;
pub mod utils;
pub mod ws;

use sqlx::PgPool;
use std::sync::Arc;
use dashmap::DashMap;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub redis: deadpool_redis::Pool,
    pub config: config::Config,
    pub ws: ws::state::WsState,
    pub s3: Option<aws_sdk_s3::Client>,
    pub office: services::office::OfficeState,
    /// Active extraction cancellation tokens keyed by capsule_id.
    pub extraction_tokens: Arc<DashMap<Uuid, CancellationToken>>,
}
