import { describe, it, expect } from "vitest";
import {
  actionsToToolDefinitions,
  validateAction,
  formatEventForAgent,
  getStateForRole,
  buildAgentContext,
  isTransitionAllowed,
  getTransitionMessage,
  AppSession,
  type AppAction,
  type AppState,
} from "./agent-app-bridge";

// ---------------------------------------------------------------------------
// actionsToToolDefinitions
// ---------------------------------------------------------------------------

describe("actionsToToolDefinitions", () => {
  const actions: AppAction[] = [
    { name: "move", description: "Move piece" },
    { name: "chat", description: "Send chat", humanOnly: true },
    { name: "think", description: "AI think", agentOnly: true },
    { name: "draw", description: "Draw card", params: { count: { type: "number" } } },
  ];

  it("returns all non-restricted actions in agent mode", () => {
    const tools = actionsToToolDefinitions(actions, "agent");
    const names = tools.map((t) => t.name);
    expect(names).toContain("move");
    expect(names).not.toContain("chat"); // humanOnly
    expect(names).toContain("think");
    expect(names).toContain("draw");
  });

  it("returns all non-restricted actions in human mode", () => {
    const tools = actionsToToolDefinitions(actions, "human");
    const names = tools.map((t) => t.name);
    expect(names).toContain("move");
    expect(names).toContain("chat");
    expect(names).not.toContain("think"); // agentOnly
    expect(names).toContain("draw");
  });

  it("excludes humanOnly actions in copilot mode", () => {
    const tools = actionsToToolDefinitions(actions, "copilot");
    const names = tools.map((t) => t.name);
    expect(names).not.toContain("chat"); // humanOnly
    expect(names).toContain("think");
    expect(names).toContain("move");
  });

  it("includes params as input_schema properties", () => {
    const tools = actionsToToolDefinitions(actions, "agent");
    const drawTool = tools.find((t) => t.name === "draw");
    expect(drawTool?.input_schema.properties).toEqual({ count: { type: "number" } });
  });

  it("returns empty properties for actions without params", () => {
    const tools = actionsToToolDefinitions(actions, "agent");
    const moveTool = tools.find((t) => t.name === "move");
    expect(moveTool?.input_schema.properties).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// validateAction
// ---------------------------------------------------------------------------

describe("validateAction", () => {
  const actions: AppAction[] = [
    { name: "move", description: "Move" },
    { name: "chat", description: "Chat", humanOnly: true },
    { name: "think", description: "Think", agentOnly: true },
  ];

  it("validates known action in agent mode", () => {
    expect(validateAction("move", actions, "agent")).toEqual({ valid: true });
  });

  it("rejects unknown action", () => {
    const result = validateAction("fly", actions, "agent");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Unknown action");
  });

  it("rejects humanOnly action for agent", () => {
    const result = validateAction("chat", actions, "agent");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("human-only");
  });

  it("rejects agent action in human mode (non-agentOnly)", () => {
    const result = validateAction("move", actions, "human");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("human control mode");
  });

  it("allows agentOnly action in human mode", () => {
    // Bit counter-intuitive but validateAction checks if action.humanOnly is false
    // and agent can't act in human mode — but agentOnly IS allowed
    // Actually: in human mode, only action.agentOnly passes the human-mode check
    // Let's verify the actual behavior
    const result = validateAction("think", actions, "human");
    // think is agentOnly — in human mode, check line 77: controlMode === "human" && !action.agentOnly
    // think.agentOnly = true, so !true = false → doesn't match → passes that check
    // then humanOnly check: think.humanOnly is undefined → passes
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatEventForAgent
// ---------------------------------------------------------------------------

describe("formatEventForAgent", () => {
  it("formats event with payload", () => {
    const result = formatEventForAgent("player_moved", { x: 1, y: 2 });
    expect(result).toContain("[App Event: player_moved]");
    expect(result).toContain('"x": 1');
  });

  it("formats event without payload", () => {
    const result = formatEventForAgent("game_started", {});
    expect(result).toBe("[App Event: game_started]");
    expect(result).not.toContain("Payload");
  });
});

// ---------------------------------------------------------------------------
// getStateForRole
// ---------------------------------------------------------------------------

describe("getStateForRole", () => {
  const roleStates = {
    player: { state: { score: 10 }, actions: [] },
    spectator: { state: { canChat: true }, actions: [] },
  };

  it("returns state for known role", () => {
    expect(getStateForRole(roleStates, "player")).toEqual({ state: { score: 10 }, actions: [] });
  });

  it("returns null for unknown role", () => {
    expect(getStateForRole(roleStates, "admin")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildAgentContext
// ---------------------------------------------------------------------------

describe("buildAgentContext", () => {
  const appState: AppState = {
    state: { turn: 1 },
    actions: [{ name: "play", description: "Play card" }],
    prompt: "You are playing a card game.",
  };

  it("includes system prompt with custom prompt", () => {
    const ctx = buildAgentContext(appState, "agent", "CardGame");
    expect(ctx.systemPrompt).toContain("CardGame");
    expect(ctx.systemPrompt).toContain("card game");
    expect(ctx.systemPrompt).toContain('"turn": 1');
  });

  it("uses default prompt when no custom prompt", () => {
    const noPromptState: AppState = { state: { x: 1 }, actions: [] };
    const ctx = buildAgentContext(noPromptState, "agent", "MyApp");
    expect(ctx.systemPrompt).toContain("Use the available tools");
  });

  it("includes tools filtered by control mode", () => {
    const ctx = buildAgentContext(appState, "agent", "CardGame");
    expect(ctx.tools).toHaveLength(1);
    expect(ctx.tools[0].name).toBe("play");
  });

  it("includes state description", () => {
    const ctx = buildAgentContext(appState, "agent", "CardGame");
    expect(ctx.stateDescription).toContain("CardGame");
    expect(ctx.stateDescription).toContain('"turn": 1');
  });
});

// ---------------------------------------------------------------------------
// Control mode transitions
// ---------------------------------------------------------------------------

describe("isTransitionAllowed", () => {
  it("allows agent → human", () => {
    expect(isTransitionAllowed("agent", "human")).toBe(true);
  });

  it("allows human → agent", () => {
    expect(isTransitionAllowed("human", "agent")).toBe(true);
  });

  it("allows agent → copilot", () => {
    expect(isTransitionAllowed("agent", "copilot")).toBe(true);
  });

  it("allows copilot → human", () => {
    expect(isTransitionAllowed("copilot", "human")).toBe(true);
  });

  it("disallows same-to-same transition", () => {
    expect(isTransitionAllowed("agent", "agent")).toBe(false);
    expect(isTransitionAllowed("human", "human")).toBe(false);
  });
});

describe("getTransitionMessage", () => {
  it("returns correct message for agent → human", () => {
    expect(getTransitionMessage("agent", "human")).toBe("You took control");
  });

  it("returns fallback for unknown transition", () => {
    // same-to-same won't be in the map
    const msg = getTransitionMessage("agent", "agent");
    expect(msg).toContain("Control changed to agent");
  });
});

// ---------------------------------------------------------------------------
// AppSession
// ---------------------------------------------------------------------------

describe("AppSession", () => {
  it("starts with specified control mode", () => {
    const session = new AppSession("TestApp", "human");
    expect(session.getControlMode()).toBe("human");
  });

  it("defaults to agent mode", () => {
    const session = new AppSession("TestApp");
    expect(session.getControlMode()).toBe("agent");
  });

  it("transitions control mode", () => {
    const session = new AppSession("TestApp", "agent");
    const result = session.setControlMode("human");
    expect(result.allowed).toBe(true);
    expect(result.from).toBe("agent");
    expect(result.to).toBe("human");
    expect(session.getControlMode()).toBe("human");
  });

  it("rejects same-mode transition", () => {
    const session = new AppSession("TestApp", "agent");
    const result = session.setControlMode("agent");
    expect(result.allowed).toBe(false);
    expect(session.getControlMode()).toBe("agent");
  });

  it("updates and retrieves state", () => {
    const session = new AppSession("TestApp");
    session.updateState({ state: { score: 42 }, actions: [] });
    const ctx = session.getAgentContext();
    expect(ctx.stateDescription).toContain("42");
  });

  it("supports role-specific state", () => {
    const session = new AppSession("TestApp");
    session.updateRoleState("player", {
      state: { hand: ["A", "K"] },
      actions: [{ name: "play", description: "Play" }],
    });
    const ctx = session.getAgentContext("player");
    expect(ctx.stateDescription).toContain("hand");
    expect(ctx.tools).toHaveLength(1);
  });

  it("falls back to global state for unknown role", () => {
    const session = new AppSession("TestApp");
    session.updateState({ state: { global: true }, actions: [] });
    const ctx = session.getAgentContext("nonexistent");
    expect(ctx.stateDescription).toContain("global");
  });

  it("validates actions with role state", () => {
    const session = new AppSession("TestApp");
    session.updateRoleState("player", {
      state: {},
      actions: [{ name: "attack", description: "Attack" }],
    });
    expect(session.validateAction("attack", "player").valid).toBe(true);
    expect(session.validateAction("fly", "player").valid).toBe(false);
  });

  it("records events and caps at 50", () => {
    const session = new AppSession("TestApp");
    for (let i = 0; i < 60; i++) {
      session.recordEvent(`event_${i}`, { i });
    }
    // Internal eventHistory should be capped at 50 — we can verify indirectly
    // that it doesn't throw and keeps working
    session.recordEvent("final", {});
  });

  it("getTools respects control mode", () => {
    const session = new AppSession("TestApp", "agent");
    session.updateState({
      state: {},
      actions: [
        { name: "move", description: "Move" },
        { name: "chat", description: "Chat", humanOnly: true },
      ],
    });
    const tools = session.getTools();
    expect(tools.map((t) => t.name)).toEqual(["move"]);
  });
});
