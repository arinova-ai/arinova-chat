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
pub mod creator;
pub mod agent_hub;
pub mod agent_hub_chat;
pub mod knowledge_base;
pub mod wallet;
pub mod community;
pub mod oauth;
pub mod api_v1;
pub mod themes;
pub mod stickers;
pub mod admin;
pub mod reports;
pub mod pins;
pub mod notes;
pub mod notebooks;
pub mod link_preview;
pub mod spaces;
pub mod media;
pub mod shortcuts;
pub mod official;
pub mod lounge;
pub mod api_keys;
pub mod memory;
pub mod promotions;
pub mod kanban;
pub mod activity;
pub mod dashboard;
pub mod voice;
pub mod user_settings;
pub mod conversation_settings;
pub mod accounts;
pub mod skills;
pub mod support;
pub mod wiki;
pub mod docs;
pub mod agent_memories;
pub mod developer;
pub mod expert_hub;
pub mod v1_notes;
pub mod v1_kanban;
pub mod v1_resources;
pub mod hud;
pub mod search;

use axum::Router;
use crate::AppState;

/// Build the complete API router (without .with_state()).
/// main.rs merges WS handlers and applies state + middleware layers.
pub fn api_router() -> Router<AppState> {
    Router::new()
        .merge(health::router())
        .merge(auth::router())
        .merge(agents::router())
        .merge(conversations::router())
        .merge(messages::router())
        .merge(groups::router())
        .merge(reactions::router())
        .merge(pins::router())
        .merge(uploads::router())
        .merge(push::router())
        .merge(notifications::router())
        .merge(sandbox::router())
        .merge(agent_health::router())
        .merge(office::router())
        .merge(users::router())
        .merge(friends::router())
        .merge(blocking::router())
        .merge(wallet::router())
        .merge(agent_hub::router())
        .merge(agent_hub_chat::router())
        .merge(creator::router())
        .merge(knowledge_base::router())
        .merge(community::router())
        .merge(oauth::router())
        .merge(api_v1::router())
        .merge(themes::router())
        .merge(stickers::router())
        .merge(admin::router())
        .merge(reports::router())
        .merge(notes::router())
        .merge(notebooks::router())
        .merge(link_preview::router())
        .merge(spaces::router())
        .merge(media::router())
        .merge(shortcuts::router())
        .merge(official::router())
        .merge(lounge::router())
        .merge(api_keys::router())
        .merge(memory::router())
        .merge(promotions::router())
        .merge(kanban::router())
        .merge(activity::router())
        .merge(dashboard::router())
        .merge(user_settings::router())
        .merge(voice::router())
        .merge(conversation_settings::router())
        .merge(accounts::router())
        .merge(skills::router())
        .merge(support::router())
        .merge(wiki::router())
        .merge(docs::router())
        .merge(developer::router())
        .merge(expert_hub::router())
        .merge(v1_notes::router())
        .merge(v1_kanban::router())
        .merge(v1_resources::router())
        .merge(hud::router())
        .merge(search::router())
}

/// Legacy wrapper — kept for backward compatibility.
pub fn create_router(state: AppState) -> Router {
    api_router().with_state(state)
}
