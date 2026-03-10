pub mod models;
pub mod redis;

use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;

pub async fn create_pool(database_url: &str) -> PgPool {
    let options = PgPoolOptions::new()
        .max_connections(50)
        .idle_timeout(Duration::from_secs(60))
        .acquire_timeout(Duration::from_secs(30));

    let mut last_err = None;
    for attempt in 1..=3 {
        match options.clone().connect(database_url).await {
            Ok(pool) => return pool,
            Err(e) => {
                tracing::warn!("PostgreSQL connect attempt {attempt}/3 failed: {e}");
                last_err = Some(e);
                if attempt < 3 {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            }
        }
    }

    panic!(
        "Failed to connect to PostgreSQL after 3 attempts: {}",
        last_err.unwrap()
    );
}
