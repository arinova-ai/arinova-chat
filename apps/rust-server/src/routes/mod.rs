pub mod agents;
pub mod auth;
pub mod conversations;
pub mod groups;
pub mod health;
pub mod messages;
pub mod notifications;
pub mod push;
pub mod reactions;
pub mod sandbox;
pub mod uploads;
pub mod agent_health;

use axum::Router;
use crate::AppState;

pub fn create_router(state: AppState) -> Router {
    Router::new()
        .merge(health::router())
        .merge(auth::router())
        .merge(agents::router())
        .merge(conversations::router())
        .merge(messages::router())
        .merge(groups::router())
        .merge(reactions::router())
        .merge(uploads::router())
        .merge(push::router())
        .merge(notifications::router())
        .merge(sandbox::router())
        .merge(agent_health::router())
        .with_state(state)
}
