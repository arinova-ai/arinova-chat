use std::sync::{Arc, Mutex};
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

const IDLE_TIMEOUT_MS: i64 = 60_000;
const BLOCKED_LINGER_MS: i64 = 120_000;
const OFFLINE_REMOVE_MS: i64 = 300_000;
const BROADCAST_CAPACITY: usize = 64;

// ── Public types (match frontend JSON expectations) ──────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Working,
    Idle,
    Blocked,
    Collaborating,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentState {
    pub agent_id: String,
    pub name: String,
    pub status: AgentStatus,
    pub last_activity: i64,
    pub collaborating_with: Vec<String>,
    pub current_task: Option<String>,
    pub online: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfficeStatusEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub agents: Vec<AgentState>,
    pub timestamp: i64,
}

/// Inbound event from the OpenClaw plugin (camelCase JSON).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InternalEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    pub agent_id: String,
    pub session_id: String,
    pub timestamp: i64,
    #[serde(default)]
    pub data: serde_json::Value,
}

// ── Internal helpers ─────────────────────────────────────────

struct SubagentLink {
    parent_agent_id: String,
    child_agent_id: String,
    child_session_key: String,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

// ── OfficeState ──────────────────────────────────────────────

#[derive(Clone)]
pub struct OfficeState {
    inner: Arc<OfficeStateInner>,
}

struct OfficeStateInner {
    agents: DashMap<String, AgentState>,
    subagent_links: Mutex<Vec<SubagentLink>>,
    session_to_agent: DashMap<String, String>,
    tx: broadcast::Sender<OfficeStatusEvent>,
}

impl OfficeState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        Self {
            inner: Arc::new(OfficeStateInner {
                agents: DashMap::new(),
                subagent_links: Mutex::new(Vec::new()),
                session_to_agent: DashMap::new(),
                tx,
            }),
        }
    }

    /// Subscribe to status broadcasts (for SSE).
    pub fn subscribe(&self) -> broadcast::Receiver<OfficeStatusEvent> {
        self.inner.tx.subscribe()
    }

    /// Current snapshot of online agents.
    pub fn snapshot(&self) -> OfficeStatusEvent {
        let agents: Vec<AgentState> = self
            .inner
            .agents
            .iter()
            .filter(|e| e.value().online)
            .map(|e| e.value().clone())
            .collect();
        OfficeStatusEvent {
            event_type: "status_update".into(),
            agents,
            timestamp: now_ms(),
        }
    }

    /// Returns true if the state store is active (always true once constructed).
    pub fn is_healthy(&self) -> bool {
        true
    }

    /// Ingest a hook event from the OpenClaw plugin.
    pub fn ingest(&self, event: InternalEvent) {
        // Track session → agent mapping
        if !event.agent_id.is_empty()
            && event.agent_id != "unknown"
            && !event.session_id.is_empty()
        {
            self.inner
                .session_to_agent
                .insert(event.session_id.clone(), event.agent_id.clone());
        }

        match event.event_type.as_str() {
            "session_start" => self.handle_session_start(&event),
            "session_end" => self.handle_session_end(&event),
            "llm_output" | "message_in" | "message_out" => self.handle_activity(&event),
            "tool_call" => self.handle_tool_call(&event),
            "tool_result" => self.handle_activity(&event),
            "agent_error" => self.handle_error(&event),
            "agent_end" => self.handle_agent_end(&event),
            "subagent_start" => self.handle_subagent_start(&event),
            "subagent_end" => self.handle_subagent_end(&event),
            _ => {}
        }
    }

    /// Periodic tick — age out idle/offline agents.
    pub fn tick(&self) {
        let now = now_ms();
        let mut changed = false;
        let mut to_remove = Vec::new();

        for mut entry in self.inner.agents.iter_mut() {
            let agent = entry.value_mut();
            let elapsed = now - agent.last_activity;

            if !agent.online && elapsed > OFFLINE_REMOVE_MS {
                to_remove.push(agent.agent_id.clone());
                changed = true;
                continue;
            }
            if agent.status == AgentStatus::Blocked && elapsed > BLOCKED_LINGER_MS {
                agent.status = AgentStatus::Idle;
                changed = true;
            }
            if agent.status == AgentStatus::Working && elapsed > IDLE_TIMEOUT_MS {
                agent.status = AgentStatus::Idle;
                changed = true;
            }
        }

        for id in &to_remove {
            self.inner.agents.remove(id);
            self.remove_subagent_links(id);
        }

        if changed {
            self.update_collaboration_status();
            self.broadcast();
        }
    }

    // ── Event handlers ───────────────────────────────────

    fn handle_session_start(&self, event: &InternalEvent) {
        let existing = self.inner.agents.get(&event.agent_id);
        let agent = AgentState {
            agent_id: event.agent_id.clone(),
            name: existing.as_ref().map_or_else(
                || event.agent_id.clone(),
                |e| e.name.clone(),
            ),
            status: AgentStatus::Working,
            last_activity: event.timestamp,
            collaborating_with: existing
                .as_ref()
                .map_or_else(Vec::new, |e| e.collaborating_with.clone()),
            current_task: existing.as_ref().and_then(|e| e.current_task.clone()),
            online: true,
        };
        drop(existing);
        self.inner.agents.insert(event.agent_id.clone(), agent);
        self.broadcast();
    }

    fn handle_session_end(&self, event: &InternalEvent) {
        if let Some(mut entry) = self.inner.agents.get_mut(&event.agent_id) {
            let agent = entry.value_mut();
            agent.status = AgentStatus::Idle;
            agent.online = false;
            agent.last_activity = event.timestamp;
            agent.current_task = None;
        }
        self.remove_subagent_links(&event.agent_id);
        self.inner.session_to_agent.remove(&event.session_id);
        self.update_collaboration_status();
        self.broadcast();
    }

    fn handle_activity(&self, event: &InternalEvent) {
        let agent = self.ensure_agent(&event.agent_id, event.timestamp);
        if let Some(mut entry) = self.inner.agents.get_mut(&event.agent_id) {
            let a = entry.value_mut();
            if a.status == AgentStatus::Blocked || a.status == AgentStatus::Idle {
                a.status = AgentStatus::Working;
            }
            a.last_activity = event.timestamp;
            a.online = true;
        }
        self.broadcast();
    }

    fn handle_tool_call(&self, event: &InternalEvent) {
        self.ensure_agent(&event.agent_id, event.timestamp);
        if let Some(mut entry) = self.inner.agents.get_mut(&event.agent_id) {
            let a = entry.value_mut();
            if a.status == AgentStatus::Blocked || a.status == AgentStatus::Idle {
                a.status = AgentStatus::Working;
            }
            a.last_activity = event.timestamp;
            a.online = true;
            // Set currentTask from the tool name
            if let Some(tool_name) = event.data.get("toolName").and_then(|v| v.as_str()) {
                a.current_task = Some(tool_name.to_string());
            }
        }
        self.broadcast();
    }

    fn handle_error(&self, event: &InternalEvent) {
        self.ensure_agent(&event.agent_id, event.timestamp);
        if let Some(mut entry) = self.inner.agents.get_mut(&event.agent_id) {
            let a = entry.value_mut();
            a.status = AgentStatus::Blocked;
            a.last_activity = event.timestamp;
        }
        self.broadcast();
    }

    fn handle_agent_end(&self, event: &InternalEvent) {
        if let Some(mut entry) = self.inner.agents.get_mut(&event.agent_id) {
            let a = entry.value_mut();
            if a.status != AgentStatus::Blocked {
                a.status = AgentStatus::Idle;
            }
            a.last_activity = event.timestamp;
            a.current_task = None;
        }
        self.broadcast();
    }

    fn handle_subagent_start(&self, event: &InternalEvent) {
        let parent_session_key = event
            .data
            .get("parentSessionKey")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if parent_session_key.is_empty() {
            return;
        }

        let parent_agent_id = self
            .inner
            .session_to_agent
            .get(&parent_session_key)
            .map(|e| e.value().clone())
            .unwrap_or_else(|| parent_session_key.clone());

        {
            let mut links = self.inner.subagent_links.lock().unwrap();
            links.push(SubagentLink {
                parent_agent_id,
                child_agent_id: event.agent_id.clone(),
                child_session_key: event.session_id.clone(),
            });
        }

        self.ensure_agent(&event.agent_id, event.timestamp);
        self.update_collaboration_status();
        self.broadcast();
    }

    fn handle_subagent_end(&self, event: &InternalEvent) {
        {
            let mut links = self.inner.subagent_links.lock().unwrap();
            links.retain(|l| l.child_session_key != event.session_id);
        }
        self.update_collaboration_status();
        self.broadcast();
    }

    // ── Helpers ──────────────────────────────────────────

    fn ensure_agent(&self, agent_id: &str, timestamp: i64) -> AgentState {
        if let Some(entry) = self.inner.agents.get(agent_id) {
            return entry.value().clone();
        }
        let agent = AgentState {
            agent_id: agent_id.to_string(),
            name: agent_id.to_string(),
            status: AgentStatus::Working,
            last_activity: timestamp,
            collaborating_with: Vec::new(),
            current_task: None,
            online: true,
        };
        self.inner.agents.insert(agent_id.to_string(), agent.clone());
        agent
    }

    fn update_collaboration_status(&self) {
        // Reset all collaboration arrays
        for mut entry in self.inner.agents.iter_mut() {
            entry.value_mut().collaborating_with.clear();
        }

        // Build collaboration links
        let links = self.inner.subagent_links.lock().unwrap();
        for link in links.iter() {
            if let Some(mut parent) = self.inner.agents.get_mut(&link.parent_agent_id) {
                if !parent.collaborating_with.contains(&link.child_agent_id) {
                    parent.collaborating_with.push(link.child_agent_id.clone());
                }
            }
            if let Some(mut child) = self.inner.agents.get_mut(&link.child_agent_id) {
                if !child.collaborating_with.contains(&link.parent_agent_id) {
                    child.collaborating_with.push(link.parent_agent_id.clone());
                }
            }
        }
        drop(links);

        // Set collaborating status
        for mut entry in self.inner.agents.iter_mut() {
            let a = entry.value_mut();
            if !a.collaborating_with.is_empty() && a.online {
                a.status = AgentStatus::Collaborating;
            } else if a.status == AgentStatus::Collaborating {
                a.status = if a.online {
                    AgentStatus::Working
                } else {
                    AgentStatus::Idle
                };
            }
        }
    }

    fn remove_subagent_links(&self, agent_id: &str) {
        let mut links = self.inner.subagent_links.lock().unwrap();
        links.retain(|l| l.parent_agent_id != agent_id && l.child_agent_id != agent_id);
    }

    fn broadcast(&self) {
        let event = self.snapshot();
        // Ignore error — no receivers is fine
        let _ = self.inner.tx.send(event);
    }
}
