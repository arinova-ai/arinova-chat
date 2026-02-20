use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppAction {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub params: Option<serde_json::Value>,
    #[serde(default, rename = "humanOnly")]
    pub human_only: Option<bool>,
    #[serde(default, rename = "agentOnly")]
    pub agent_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub state: serde_json::Value,
    pub actions: Vec<AppAction>,
    #[serde(default, rename = "humanLabel")]
    pub human_label: Option<String>,
    pub prompt: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMToolDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ControlMode {
    Agent,
    Human,
    Copilot,
}

pub fn actions_to_tool_definitions(
    actions: &[AppAction],
    control_mode: ControlMode,
) -> Vec<LLMToolDefinition> {
    actions
        .iter()
        .filter(|action| {
            match control_mode {
                ControlMode::Agent => !action.human_only.unwrap_or(false),
                ControlMode::Human => !action.agent_only.unwrap_or(false),
                ControlMode::Copilot => !action.human_only.unwrap_or(false),
            }
        })
        .map(|action| LLMToolDefinition {
            name: action.name.clone(),
            description: action.description.clone(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": action.params.clone().unwrap_or(serde_json::json!({})),
            }),
        })
        .collect()
}

pub fn validate_action(
    action_name: &str,
    actions: &[AppAction],
    control_mode: ControlMode,
) -> Result<(), String> {
    let action = actions
        .iter()
        .find(|a| a.name == action_name)
        .ok_or_else(|| format!("Unknown action: {}", action_name))?;

    if control_mode == ControlMode::Human && !action.agent_only.unwrap_or(false) {
        return Err("Agent cannot act in human control mode".into());
    }

    if action.human_only.unwrap_or(false) {
        return Err(format!("Action '{}' is human-only", action_name));
    }

    Ok(())
}

pub fn is_transition_allowed(from: ControlMode, to: ControlMode) -> bool {
    from != to
}

pub fn get_transition_message(from: ControlMode, to: ControlMode) -> String {
    match (from, to) {
        (ControlMode::Agent, ControlMode::Human) => "You took control".into(),
        (ControlMode::Agent, ControlMode::Copilot) => "Copilot mode activated".into(),
        (ControlMode::Human, ControlMode::Agent) => "Agent resumed control".into(),
        (ControlMode::Human, ControlMode::Copilot) => "Copilot mode activated".into(),
        (ControlMode::Copilot, ControlMode::Agent) => "Agent took full control".into(),
        (ControlMode::Copilot, ControlMode::Human) => "You took full control".into(),
        _ => format!("Control changed to {:?}", to),
    }
}
