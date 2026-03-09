use deadpool_redis::{Config as RedisConfig, Pool, Runtime};
use std::time::Duration;

pub fn create_redis_pool(redis_url: &str) -> Pool {
    let cfg = RedisConfig::from_url(redis_url);
    let mut last_err = None;
    for attempt in 1..=3 {
        match cfg.create_pool(Some(Runtime::Tokio1)) {
            Ok(pool) => return pool,
            Err(e) => {
                tracing::warn!("Redis pool create attempt {attempt}/3 failed: {e}");
                last_err = Some(e);
                if attempt < 3 {
                    std::thread::sleep(Duration::from_secs(2));
                }
            }
        }
    }

    panic!(
        "Failed to create Redis pool after 3 attempts: {}",
        last_err.unwrap()
    );
}
