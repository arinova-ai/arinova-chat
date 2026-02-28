use dashmap::DashMap;
use serde_json::Value;
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::mpsc;

/// Maximum duration before an active_stream entry is considered stale (10 minutes)
const STREAM_STALE_SECS: u64 = 600;

/// Sender half for sending JSON messages to a WebSocket connection
pub type WsSender = mpsc::UnboundedSender<String>;

/// Represents one connected user WebSocket
#[derive(Clone)]
pub struct UserConnection {
    pub sender: WsSender,
    pub visible: bool,
}

/// Pending task handler callbacks
pub struct PendingTask {
    pub agent_id: String,
    pub accumulated: String,
    pub chunk_tx: mpsc::UnboundedSender<AgentEvent>,
    pub timeout_handle: tokio::task::JoinHandle<()>,
}

#[derive(Debug)]
pub enum AgentEvent {
    Chunk(String),
    Complete(String, Vec<String>),
    Error(String),
}

/// Queued agent response
pub struct QueuedResponse {
    pub user_id: String,
    pub conversation_id: String,
    pub agent_id: String,
    pub content: String,
    pub reply_to_id: Option<String>,
    pub thread_id: Option<String>,
    pub user_message_id: Option<String>,
}

/// Shared WebSocket state across all connections
#[derive(Clone)]
pub struct WsState {
    /// User connections: userId -> Vec<(connectionId, sender)>
    pub user_connections: Arc<DashMap<String, Vec<(String, WsSender)>>>,

    /// Per-socket visibility: connectionId -> visible
    pub socket_visible: Arc<DashMap<String, bool>>,

    /// Foreground counts: userId -> count of visible tabs
    pub foreground_counts: Arc<DashMap<String, i32>>,

    /// Active stream cancellers: messageId -> cancel sender
    pub stream_cancellers: Arc<DashMap<String, tokio::sync::watch::Sender<bool>>>,

    /// Conversation IDs with active streams (key -> start time for staleness detection)
    pub active_streams: Arc<DashMap<String, Instant>>,

    /// Per-conversation agent response queues
    pub agent_response_queues: Arc<DashMap<String, VecDeque<QueuedResponse>>>,

    /// Agent connections: agentId -> (connectionId, sender)
    pub agent_connections: Arc<DashMap<String, (String, WsSender)>>,

    /// Agent skills: agentId -> skills
    pub agent_skills: Arc<DashMap<String, Vec<AgentSkill>>>,

    /// Pending tasks: taskId -> PendingTask
    pub pending_tasks: Arc<DashMap<String, PendingTask>>,

    /// Rate limits (fallback when Redis unavailable): userId -> (count, reset_at_ms)
    pub ws_rate_limits: Arc<DashMap<String, (i32, i64)>>,

    /// Conversation member cache: conversationId -> (member_user_ids, cached_at)
    pub conv_member_cache: Arc<DashMap<String, (Vec<String>, std::time::Instant)>>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AgentSkill {
    pub id: String,
    pub name: String,
    pub description: String,
}

impl WsState {
    pub fn new() -> Self {
        Self {
            user_connections: Arc::new(DashMap::new()),
            socket_visible: Arc::new(DashMap::new()),
            foreground_counts: Arc::new(DashMap::new()),
            stream_cancellers: Arc::new(DashMap::new()),
            active_streams: Arc::new(DashMap::new()),
            agent_response_queues: Arc::new(DashMap::new()),
            agent_connections: Arc::new(DashMap::new()),
            agent_skills: Arc::new(DashMap::new()),
            pending_tasks: Arc::new(DashMap::new()),
            ws_rate_limits: Arc::new(DashMap::new()),
            conv_member_cache: Arc::new(DashMap::new()),
        }
    }

    /// Check if a user is online (has any connections)
    pub fn is_user_online(&self, user_id: &str) -> bool {
        self.user_connections
            .get(user_id)
            .map(|conns| !conns.is_empty())
            .unwrap_or(false)
    }

    /// Check if a user has any visible/foreground tab
    pub fn is_user_foreground(&self, user_id: &str) -> bool {
        self.foreground_counts
            .get(user_id)
            .map(|c| *c > 0)
            .unwrap_or(false)
    }

    /// Send a JSON event to all connections for a user
    pub fn send_to_user(&self, user_id: &str, event: &Value) {
        if let Some(conns) = self.user_connections.get(user_id) {
            let msg = serde_json::to_string(event).unwrap_or_default();
            for (_, sender) in conns.iter() {
                let _ = sender.send(msg.clone());
            }
        }
    }

    /// Send event to user, queue to pending events if offline
    pub fn send_to_user_or_queue(
        &self,
        user_id: &str,
        event: &Value,
        redis: &deadpool_redis::Pool,
    ) {
        let mut delivered = false;
        if let Some(conns) = self.user_connections.get(user_id) {
            let msg = serde_json::to_string(event).unwrap_or_default();
            for (_, sender) in conns.iter() {
                if sender.send(msg.clone()).is_ok() {
                    delivered = true;
                }
            }
        }

        if !delivered {
            if let Some(event_type) = event.get("type").and_then(|t| t.as_str()) {
                if event_type != "pong" {
                    let redis = redis.clone();
                    let user_id = user_id.to_string();
                    let event = event.clone();
                    tokio::spawn(async move {
                        let _ = crate::services::pending_events::push_event(&redis, &user_id, &event).await;
                    });
                }
            }
        }
    }

    /// Check if an agent is currently connected
    pub fn is_agent_connected(&self, agent_id: &str) -> bool {
        self.agent_connections.contains_key(agent_id)
    }

    /// Send a JSON event to a connected agent
    pub fn send_to_agent(&self, agent_id: &str, event: &Value) -> bool {
        if let Some(entry) = self.agent_connections.get(agent_id) {
            let msg = serde_json::to_string(event).unwrap_or_default();
            entry.1.send(msg).is_ok()
        } else {
            false
        }
    }

    /// Check if an agent has an active stream in a conversation.
    /// Automatically removes stale entries (older than STREAM_STALE_SECS).
    pub fn has_active_stream_for_agent(&self, conversation_id: &str, agent_id: &str) -> bool {
        let key = format!("{}:{}", conversation_id, agent_id);
        if let Some(entry) = self.active_streams.get(&key) {
            if entry.elapsed().as_secs() > STREAM_STALE_SECS {
                drop(entry);
                tracing::warn!("Removing stale active_stream: {}", key);
                self.active_streams.remove(&key);
                false
            } else {
                true
            }
        } else {
            false
        }
    }

    /// Check if a conversation has any active stream (for sync/reconnection).
    /// Automatically removes stale entries.
    pub fn has_active_stream(&self, conversation_id: &str) -> bool {
        let prefix = format!("{}:", conversation_id);
        let stale_keys: Vec<String> = self.active_streams.iter()
            .filter(|entry| entry.key().starts_with(&prefix) && entry.value().elapsed().as_secs() > STREAM_STALE_SECS)
            .map(|entry| entry.key().clone())
            .collect();
        for key in &stale_keys {
            tracing::warn!("Removing stale active_stream: {}", key);
            self.active_streams.remove(key);
        }
        self.active_streams.iter().any(|entry| entry.key().starts_with(&prefix))
    }

    /// Invalidate the conversation member cache for a conversation
    pub fn invalidate_conv_member_cache(&self, conversation_id: &str) {
        self.conv_member_cache.remove(conversation_id);
    }

    /// Broadcast event to a list of user IDs (with offline queue fallback)
    pub fn broadcast_to_members(
        &self,
        member_ids: &[String],
        event: &Value,
        redis: &deadpool_redis::Pool,
    ) {
        for uid in member_ids {
            self.send_to_user_or_queue(uid, event, redis);
        }
    }

    /// Get agent skills
    pub fn get_agent_skills(&self, agent_id: &str) -> Vec<AgentSkill> {
        self.agent_skills
            .get(agent_id)
            .map(|s| s.clone())
            .unwrap_or_default()
    }
}
