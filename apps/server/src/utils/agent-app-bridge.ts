// Agent-App Bridge — converts app state/actions to LLM tool definitions
// and routes agent tool calls back to the app

// Task 9.1: State-to-tool-use converter
// Task 9.2: Agent action routing
// Task 9.3: Dynamic tool update handling
// Task 9.4: Event delivery to agent
// Task 9.5: Per-role state isolation
// Task 9.6: Agent session context management

export interface AppAction {
  name: string;
  description: string;
  params?: Record<string, unknown>;
  humanOnly?: boolean;
  agentOnly?: boolean;
}

export interface AppState {
  state: Record<string, unknown>;
  actions: AppAction[];
  humanLabel?: string;
  prompt?: string;
}

// Task 9.1: Convert app actions into LLM-compatible tool definitions
export interface LLMToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export function actionsToToolDefinitions(
  actions: AppAction[],
  controlMode: "agent" | "human" | "copilot"
): LLMToolDefinition[] {
  return actions
    .filter((action) => {
      // Task 10.3: Action routing enforcement per control mode
      if (controlMode === "agent" && action.humanOnly) return false;
      if (controlMode === "human" && action.agentOnly) return false;
      // Task 10.4: Copilot mode — filter based on humanOnly/agentOnly flags
      if (controlMode === "copilot" && action.humanOnly) return false;
      return true;
    })
    .map((action) => ({
      name: action.name,
      description: action.description,
      input_schema: {
        type: "object" as const,
        properties: action.params ?? {},
      },
    }));
}

// Task 9.2: Validate and route an agent action
export interface ActionValidationResult {
  valid: boolean;
  error?: string;
}

export function validateAction(
  actionName: string,
  actions: AppAction[],
  controlMode: "agent" | "human" | "copilot"
): ActionValidationResult {
  const action = actions.find((a) => a.name === actionName);

  if (!action) {
    return { valid: false, error: `Unknown action: ${actionName}` };
  }

  if (controlMode === "human" && !action.agentOnly) {
    return { valid: false, error: "Agent cannot act in human control mode" };
  }

  if (action.humanOnly) {
    return { valid: false, error: `Action '${actionName}' is human-only` };
  }

  return { valid: true };
}

// Task 9.4: Format app event as agent system message
export function formatEventForAgent(eventName: string, payload: Record<string, unknown>): string {
  const payloadStr = Object.keys(payload).length > 0
    ? `\nPayload: ${JSON.stringify(payload, null, 2)}`
    : "";
  return `[App Event: ${eventName}]${payloadStr}`;
}

// Task 9.5: Per-role state isolation
export interface RoleStates {
  [role: string]: AppState;
}

export function getStateForRole(roleStates: RoleStates, role: string): AppState | null {
  return roleStates[role] ?? null;
}

// Task 9.6: Build agent session context
export interface AgentSessionContext {
  systemPrompt: string;
  tools: LLMToolDefinition[];
  stateDescription: string;
}

export function buildAgentContext(
  appState: AppState,
  controlMode: "agent" | "human" | "copilot",
  appName: string
): AgentSessionContext {
  const tools = actionsToToolDefinitions(appState.actions, controlMode);

  const stateJson = JSON.stringify(appState.state, null, 2);
  const stateDescription = `Current ${appName} state:\n${stateJson}`;

  const systemPrompt = appState.prompt
    ? `You are interacting with the app "${appName}".\n\n${appState.prompt}\n\nCurrent state:\n${stateJson}`
    : `You are interacting with the app "${appName}". Use the available tools to take actions.\n\nCurrent state:\n${stateJson}`;

  return {
    systemPrompt,
    tools,
    stateDescription,
  };
}

// Task 10.1: Control mode state machine
export type ControlMode = "agent" | "human" | "copilot";

export interface ControlModeTransition {
  from: ControlMode;
  to: ControlMode;
  allowed: boolean;
  message: string;
}

const VALID_TRANSITIONS: Array<[ControlMode, ControlMode]> = [
  ["agent", "human"],
  ["agent", "copilot"],
  ["human", "agent"],
  ["human", "copilot"],
  ["copilot", "agent"],
  ["copilot", "human"],
];

export function isTransitionAllowed(from: ControlMode, to: ControlMode): boolean {
  if (from === to) return false;
  return VALID_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function getTransitionMessage(from: ControlMode, to: ControlMode): string {
  const messages: Record<string, string> = {
    "agent->human": "You took control",
    "agent->copilot": "Copilot mode activated",
    "human->agent": "Agent resumed control",
    "human->copilot": "Copilot mode activated",
    "copilot->agent": "Agent took full control",
    "copilot->human": "You took full control",
  };
  return messages[`${from}->${to}`] ?? `Control changed to ${to}`;
}

// Task 9.3: Track dynamic tool updates
export class AppSession {
  private currentState: AppState = { state: {}, actions: [] };
  private roleStates: RoleStates = {};
  private controlMode: ControlMode = "agent";
  private eventHistory: Array<{ eventName: string; payload: Record<string, unknown>; timestamp: number }> = [];

  constructor(
    private appName: string,
    private initialMode: ControlMode = "agent"
  ) {
    this.controlMode = initialMode;
  }

  updateState(state: AppState): void {
    this.currentState = state;
  }

  updateRoleState(role: string, state: AppState): void {
    this.roleStates[role] = state;
  }

  setControlMode(mode: ControlMode): ControlModeTransition {
    const from = this.controlMode;
    const allowed = isTransitionAllowed(from, mode);
    if (allowed) {
      this.controlMode = mode;
    }
    return {
      from,
      to: mode,
      allowed,
      message: allowed ? getTransitionMessage(from, mode) : `Transition from ${from} to ${mode} not allowed`,
    };
  }

  recordEvent(eventName: string, payload: Record<string, unknown>): void {
    this.eventHistory.push({ eventName, payload, timestamp: Date.now() });
    // Keep last 50 events
    if (this.eventHistory.length > 50) {
      this.eventHistory = this.eventHistory.slice(-50);
    }
  }

  getAgentContext(role?: string): AgentSessionContext {
    const state = role ? (this.roleStates[role] ?? this.currentState) : this.currentState;
    return buildAgentContext(state, this.controlMode, this.appName);
  }

  getControlMode(): ControlMode {
    return this.controlMode;
  }

  getTools(role?: string): LLMToolDefinition[] {
    const state = role ? (this.roleStates[role] ?? this.currentState) : this.currentState;
    return actionsToToolDefinitions(state.actions, this.controlMode);
  }

  validateAction(actionName: string, role?: string): ActionValidationResult {
    const state = role ? (this.roleStates[role] ?? this.currentState) : this.currentState;
    return validateAction(actionName, state.actions, this.controlMode);
  }
}
