pub mod a2a;
pub mod auth;
pub mod config;
pub mod db;
pub mod services;
pub mod routes;
pub mod utils;
pub mod ws;

use sqlx::PgPool;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub redis: deadpool_redis::Pool,
    pub config: config::Config,
    pub ws: ws::state::WsState,
    pub s3: Option<aws_sdk_s3::Client>,
}
