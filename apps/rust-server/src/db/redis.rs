use deadpool_redis::{Config as RedisConfig, Pool, Runtime};

pub fn create_redis_pool(redis_url: &str) -> Pool {
    let cfg = RedisConfig::from_url(redis_url);
    cfg.create_pool(Some(Runtime::Tokio1))
        .expect("Failed to create Redis pool")
}
