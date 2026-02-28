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

  api.on("llm_input", (event, ctx) => {
    emit({
      type: "llm_input",
      agentId: ctx.agentId ?? "unknown",
      sessionId: event.runId ?? ctx.sessionKey ?? "",
      timestamp: Date.now(),
      data: {
        model: event.model,
        provider: event.provider,
      },
    });
  });

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
  // These hooks may not be in the SDK type definitions yet — cast to avoid TS errors.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apiAny = api as any;

  apiAny.on("subagent_spawned", (event: Record<string, unknown>, ctx: Record<string, unknown>) => {
    emit({
      type: "subagent_start",
      agentId: event.agentId as string,
      sessionId: event.childSessionKey as string,
      timestamp: Date.now(),
      data: {
        parentSessionKey: ctx.requesterSessionKey,
        label: event.label,
        mode: event.mode,
      },
    });
  });

  apiAny.on("subagent_ended", (event: Record<string, unknown>, ctx: Record<string, unknown>) => {
    emit({
      type: "subagent_end",
      agentId: (ctx.childSessionKey ?? event.targetSessionKey) as string,
      sessionId: event.targetSessionKey as string,
      timestamp: Date.now(),
      data: {
        parentSessionKey: ctx.requesterSessionKey,
        outcome: event.outcome,
        reason: event.reason,
      },
    });
  });
}

/** Forward URL + token for HTTP POST to Rust server */
let forwardUrl: string | null = null;
let forwardToken: string | null = null;

export function setForwardTarget(url: string, token: string): void {
  forwardUrl = url;
  forwardToken = token;
}

function emit(event: InternalEvent): void {
  officeState.ingest(event);

  // Forward to Rust server if configured
  if (forwardUrl && forwardToken) {
    fetch(forwardUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${forwardToken}`,
      },
      body: JSON.stringify(event),
    }).catch(() => {
      // Swallow — server may be temporarily unavailable
    });
  }
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
