import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { InternalEvent } from "./types.js";
import { officeState } from "./state.js";

/**
 * Register hook listeners with the OpenClaw plugin API.
 * Each hook normalizes the raw event and feeds it into the state store.
 */
export function registerHooks(api: OpenClawPluginApi): void {
  // ── Session lifecycle ──────────────────────────────────

  api.on("session_start", (event, ctx) => {
    emit({
      type: "session_start",
      agentId: ctx.agentId ?? "unknown",
      sessionId: event.sessionId,
      timestamp: Date.now(),
      data: { resumedFrom: event.resumedFrom },
    });
  });

  api.on("session_end", (event, ctx) => {
    emit({
      type: "session_end",
      agentId: ctx.agentId ?? "unknown",
      sessionId: event.sessionId,
      timestamp: Date.now(),
      data: {
        messageCount: event.messageCount,
        durationMs: event.durationMs,
      },
    });
  });

  // ── LLM activity ──────────────────────────────────────

  api.on("llm_output", (event, ctx) => {
    emit({
      type: "llm_output",
      agentId: ctx.agentId ?? "unknown",
      sessionId: event.sessionId,
      timestamp: Date.now(),
      data: {
        model: event.model,
        provider: event.provider,
        usage: event.usage,
      },
    });
  });

  // ── Tool calls ────────────────────────────────────────

  api.on("after_tool_call", (event, ctx) => {
    const hasError = Boolean(event.error);
    emit({
      type: hasError ? "tool_result" : "tool_call",
      agentId: ctx.agentId ?? "unknown",
      sessionId: ctx.sessionKey ?? "",
      timestamp: Date.now(),
      data: {
        toolName: event.toolName,
        durationMs: event.durationMs,
        error: event.error,
      },
    });

    // Persistent tool errors → blocked
    if (hasError) {
      emit({
        type: "agent_error",
        agentId: ctx.agentId ?? "unknown",
        sessionId: ctx.sessionKey ?? "",
        timestamp: Date.now(),
        data: { error: event.error, toolName: event.toolName },
      });
    }
  });

  // ── Messages ──────────────────────────────────────────

  api.on("message_received", (event, ctx) => {
    // Use event.from as agentId — this is the sender's identity.
    // ctx.accountId/channelId are channel-level, not agent-level.
    emit({
      type: "message_in",
      agentId: event.from ?? ctx.accountId ?? "unknown",
      sessionId: ctx.conversationId ?? "",
      timestamp: event.timestamp ?? Date.now(),
      data: { from: event.from, channelId: ctx.channelId },
    });
  });

  api.on("message_sent", (event, ctx) => {
    // Use event.to as agentId — this is the target agent identity.
    emit({
      type: "message_out",
      agentId: event.to ?? ctx.accountId ?? "unknown",
      sessionId: ctx.conversationId ?? "",
      timestamp: Date.now(),
      data: { to: event.to, success: event.success, error: event.error, channelId: ctx.channelId },
    });
  });

  // ── Agent run completion ──────────────────────────────

  api.on("agent_end", (event, ctx) => {
    if (!event.success && event.error) {
      emit({
        type: "agent_error",
        agentId: ctx.agentId ?? "unknown",
        sessionId: ctx.sessionKey ?? "",
        timestamp: Date.now(),
        data: { error: event.error, durationMs: event.durationMs },
      });
    } else {
      emit({
        type: "agent_end",
        agentId: ctx.agentId ?? "unknown",
        sessionId: ctx.sessionKey ?? "",
        timestamp: Date.now(),
        data: { durationMs: event.durationMs },
      });
    }
  });

  // ── Subagent collaboration ────────────────────────────

  api.on("subagent_spawned", (event, ctx) => {
    emit({
      type: "subagent_start",
      agentId: event.agentId,
      sessionId: event.childSessionKey,
      timestamp: Date.now(),
      data: {
        parentSessionKey: ctx.requesterSessionKey,
        label: event.label,
        mode: event.mode,
      },
    });
  });

  api.on("subagent_ended", (event, ctx) => {
    emit({
      type: "subagent_end",
      agentId: ctx.childSessionKey ?? event.targetSessionKey,
      sessionId: event.targetSessionKey,
      timestamp: Date.now(),
      data: {
        parentSessionKey: ctx.requesterSessionKey,
        outcome: event.outcome,
        reason: event.reason,
      },
    });
  });
}

function emit(event: InternalEvent): void {
  officeState.ingest(event);
}

/**
 * Manually ingest a hook event (for testing or direct integration).
 */
export function ingestHookEvent(
  type: InternalEvent["type"],
  sessionId: string,
  agentId: string,
  data: Record<string, unknown> = {},
): void {
  emit({
    type,
    sessionId,
    agentId,
    timestamp: Date.now(),
    data,
  });
}
