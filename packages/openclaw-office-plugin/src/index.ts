import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerHooks, setForwardTarget } from "./hooks.js";
import { officeState } from "./state.js";

// Re-export public API
export { officeState } from "./state.js";
export { handleSSEConnection } from "./sse.js";
export { ingestHookEvent } from "./hooks.js";
export type { AgentState, AgentStatus, OfficeStatusEvent, InternalEvent, InternalEventType } from "./types.js";
// Legacy aliases
export type { HookEvent, HookEventType } from "./types.js";

/** Idle-check interval handle */
let tickInterval: NodeJS.Timeout | null = null;

/** Returns true when the tick loop is running (plugin registered or standalone init) */
export function isHealthy(): boolean {
  return tickInterval !== null;
}

/**
 * Configure HTTP forwarding so every hook event is also POSTed to a remote
 * server (e.g. the Rust backend's POST /api/office/event endpoint).
 */
export function configure(opts: { forwardUrl: string; forwardToken: string }): void {
  setForwardTarget(opts.forwardUrl, opts.forwardToken);
}

/**
 * Start the idle-check tick loop without full OpenClaw plugin registration.
 * Call this from the server process so isHealthy() returns true and
 * events fed via ingestHookEvent() are properly aged out.
 */
export function initialize(): void {
  if (tickInterval) return; // Already running
  tickInterval = setInterval(() => {
    officeState.tick();
  }, 15_000);
}

/** Stop the tick loop (inverse of initialize / destroy). */
export function shutdown(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
}

const plugin = {
  id: "openclaw-office-plugin",
  name: "Virtual Office",
  description: "Tracks agent session activity and exposes real-time status via SSE for the Virtual Office UI.",

  register(api: OpenClawPluginApi): void {
    // Auto-configure HTTP forwarding from env vars
    const url = process.env.OFFICE_FORWARD_URL;
    const token = process.env.OFFICE_EVENT_TOKEN;
    if (url && token) {
      setForwardTarget(url, token);
    }

    registerHooks(api);
    initialize(); // reuse standalone init
  },

  destroy(): void {
    shutdown(); // reuse standalone shutdown
  },
};

export default plugin;
