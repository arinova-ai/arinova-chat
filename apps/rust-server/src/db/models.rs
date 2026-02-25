use chrono::{DateTime, NaiveDateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

// ===== PostgreSQL enum types =====

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "friendship_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum FriendshipStatus {
    Pending,
    Accepted,
    Blocked,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "conversation_user_role", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ConversationUserRole {
    Admin,
    #[sqlx(rename = "vice_admin")]
    #[serde(rename = "vice_admin")]
    ViceAdmin,
    Member,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "agent_listen_mode", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum AgentListenMode {
    #[sqlx(rename = "owner_only")]
    #[serde(rename = "owner_only")]
    OwnerOnly,
    #[sqlx(rename = "allowed_users")]
    #[serde(rename = "allowed_users")]
    AllowedUsers,
    #[sqlx(rename = "all_mentions")]
    #[serde(rename = "all_mentions")]
    AllMentions,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "conversation_type", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum ConversationType {
    Direct,
    Group,
}

impl std::fmt::Display for ConversationType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Direct => write!(f, "direct"),
            Self::Group => write!(f, "group"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "message_role", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Agent,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "message_status", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum MessageStatus {
    Pending,
    Streaming,
    Completed,
    Cancelled,
    Error,
}

impl std::fmt::Display for MessageStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Pending => write!(f, "pending"),
            Self::Streaming => write!(f, "streaming"),
            Self::Completed => write!(f, "completed"),
            Self::Cancelled => write!(f, "cancelled"),
            Self::Error => write!(f, "error"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[sqlx(type_name = "community_role", rename_all = "lowercase")]
#[serde(rename_all = "lowercase")]
pub enum CommunityRole {
    Owner,
    Admin,
    Member,
}

// ===== Auth tables (Better Auth compatible) =====

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: String,
    pub name: String,
    pub email: String,
    pub email_verified: bool,
    pub image: Option<String>,
    pub username: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Session {
    pub id: String,
    pub user_id: String,
    pub token: String,
    pub expires_at: NaiveDateTime,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Account {
    pub id: String,
    pub user_id: String,
    pub account_id: String,
    pub provider_id: String,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub access_token_expires_at: Option<NaiveDateTime>,
    pub refresh_token_expires_at: Option<NaiveDateTime>,
    pub scope: Option<String>,
    pub id_token: Option<String>,
    pub password: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

// ===== Business tables =====

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub avatar_url: Option<String>,
    pub a2a_endpoint: Option<String>,
    pub secret_token: Option<String>,
    pub owner_id: String,
    pub is_public: bool,
    pub category: Option<String>,
    pub usage_count: i32,
    pub system_prompt: Option<String>,
    pub welcome_message: Option<String>,
    pub quick_replies: Option<serde_json::Value>,
    pub notifications_enabled: bool,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Conversation {
    pub id: Uuid,
    pub title: Option<String>,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub conv_type: ConversationType,
    pub user_id: String,
    pub agent_id: Option<Uuid>,
    #[serde(rename = "mentionOnly")]
    pub mention_only: bool,
    pub pinned_at: Option<NaiveDateTime>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ConversationMember {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub agent_id: Uuid,
    pub owner_user_id: Option<String>,
    pub listen_mode: AgentListenMode,
    pub added_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Message {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub seq: i32,
    pub role: MessageRole,
    pub content: String,
    pub status: MessageStatus,
    pub sender_agent_id: Option<Uuid>,
    pub sender_user_id: Option<String>,
    pub reply_to_id: Option<Uuid>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

// ===== Multi-user social tables =====

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Friendship {
    pub id: Uuid,
    pub requester_id: String,
    pub addressee_id: String,
    pub status: FriendshipStatus,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ConversationUserMember {
    pub id: Uuid,
    pub conversation_id: Uuid,
    pub user_id: String,
    pub role: ConversationUserRole,
    pub joined_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GroupSettings {
    pub conversation_id: Uuid,
    pub history_visible: bool,
    pub max_users: i32,
    pub max_agents: i32,
    pub invite_link: Option<String>,
    pub invite_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ConversationRead {
    pub id: Uuid,
    pub user_id: String,
    pub conversation_id: Uuid,
    pub last_read_seq: i32,
    pub muted: bool,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct MessageReaction {
    pub id: Uuid,
    pub message_id: Uuid,
    pub user_id: String,
    pub emoji: String,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Attachment {
    pub id: Uuid,
    pub message_id: Uuid,
    pub file_name: String,
    pub file_type: String,
    pub file_size: i32,
    pub storage_path: String,
    pub created_at: NaiveDateTime,
}

// ===== Push Notification tables =====

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct PushSubscription {
    pub id: Uuid,
    pub user_id: String,
    pub endpoint: String,
    pub p256dh: String,
    pub auth: String,
    pub device_info: Option<String>,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct NotificationPreference {
    pub id: Uuid,
    pub user_id: String,
    pub global_enabled: bool,
    pub message_enabled: bool,
    pub playground_invite_enabled: bool,
    pub playground_turn_enabled: bool,
    pub playground_result_enabled: bool,
    pub quiet_hours_start: Option<String>,
    pub quiet_hours_end: Option<String>,
}

// ===== Community tables (Lounge + Hub) =====

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Community {
    pub id: Uuid,
    pub creator_id: String,
    pub name: String,
    pub description: Option<String>,
    #[sqlx(rename = "type")]
    pub community_type: String,
    pub join_fee: i32,
    pub monthly_fee: i32,
    pub agent_call_fee: i32,
    pub status: String,
    pub member_count: i32,
    pub avatar_url: Option<String>,
    pub cover_image_url: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CommunityMember {
    pub id: Uuid,
    pub community_id: Uuid,
    pub user_id: String,
    pub role: String,
    pub joined_at: DateTime<Utc>,
    pub subscription_status: Option<String>,
    pub subscription_expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CommunityAgent {
    pub id: Uuid,
    pub community_id: Uuid,
    pub listing_id: Uuid,
    pub added_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CommunityMessage {
    pub id: Uuid,
    pub community_id: Uuid,
    pub user_id: Option<String>,
    pub agent_listing_id: Option<Uuid>,
    pub content: String,
    pub message_type: String,
    pub created_at: DateTime<Utc>,
}

// ===== Marketplace tables =====

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct DeveloperAccount {
    pub id: Uuid,
    pub user_id: String,
    pub display_name: String,
    pub contact_email: String,
    pub payout_info: Option<String>,
    pub terms_accepted_at: NaiveDateTime,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct App {
    pub id: Uuid,
    pub developer_id: Uuid,
    pub app_id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub icon: String,
    pub status: String,
    pub current_version_id: Option<Uuid>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AppVersion {
    pub id: Uuid,
    pub app_id: Uuid,
    pub version: String,
    pub manifest_json: serde_json::Value,
    pub package_path: String,
    pub status: String,
    pub review_notes: Option<String>,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CoinBalance {
    pub user_id: String,
    pub balance: i32,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct CoinTransaction {
    pub id: Uuid,
    pub user_id: String,
    #[sqlx(rename = "type")]
    #[serde(rename = "type")]
    pub tx_type: String,
    pub amount: i32,
    pub related_app_id: Option<Uuid>,
    pub related_product_id: Option<String>,
    pub receipt_id: Option<String>,
    pub description: Option<String>,
    pub created_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct AppPurchase {
    pub id: Uuid,
    pub user_id: String,
    pub app_version_id: Uuid,
    pub product_id: String,
    pub amount: i32,
    pub status: String,
    pub created_at: NaiveDateTime,
}

// ===== Knowledge Base tables (RAG) =====

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBase {
    pub id: Uuid,
    pub listing_id: Uuid,
    pub creator_id: String,
    pub file_name: String,
    pub file_size: i32,
    pub file_type: Option<String>,
    pub status: String,
    pub chunk_count: i32,
    pub total_chars: i32,
    pub embedding_model: String,
    pub raw_content: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, FromRow)]
pub struct KnowledgeBaseChunk {
    pub id: Uuid,
    pub kb_id: Uuid,
    pub content: String,
    pub chunk_index: i32,
    pub token_count: i32,
    pub created_at: NaiveDateTime,
}
