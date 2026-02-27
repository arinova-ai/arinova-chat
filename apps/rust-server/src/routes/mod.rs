pub mod agents;
pub mod auth;
pub mod blocking;
pub mod conversations;
pub mod friends;
pub mod groups;
pub mod health;
pub mod messages;
pub mod notifications;
pub mod office;
pub mod push;
pub mod reactions;
pub mod sandbox;
pub mod uploads;
pub mod users;
pub mod agent_health;
pub mod agent_send;
pub mod agent_uploads;
pub mod creator;
pub mod marketplace;
pub mod marketplace_chat;
pub mod knowledge_base;
pub mod wallet;
pub mod community;
pub mod themes;

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
        .merge(agent_send::router())
        .merge(agent_uploads::router())
        .merge(office::router())
        .merge(users::router())
        .merge(friends::router())
        .merge(blocking::router())
        .merge(wallet::router())
        .merge(marketplace::router())
        .merge(marketplace_chat::router())
        .merge(creator::router())
        .merge(knowledge_base::router())
        .merge(community::router())
        .merge(themes::router())
        .with_state(state)
}
