import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { InternalEvent } from "./types.js";
import { officeState } from "./state.js";

/**
 * Register hook listeners with the OpenClaw plugin API.
 * Each hook normalizes the raw event and feeds it into the state store.
 */
export function registerHooks(api: OpenClawPluginApi): void {
  // accountId may not be on all SDK context types yet — extract safely
  const acct = (ctx: Record<string, unknown>) =>
    ctx.accountId as string | undefined;

  // ── Session lifecycle ──────────────────────────────────

  api.on("session_start", (event, ctx) => {
    emit({
      type: "session_start",
      agentId: ctx.agentId ?? "unknown",
      sessionId: event.sessionId,
      timestamp: Date.now(),
      data: { resumedFrom: event.resumedFrom },
    }, acct(ctx));
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
    }, acct(ctx));
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
    }, acct(ctx));
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
    }, acct(ctx));
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
    }, acct(ctx));

    // Persistent tool errors → blocked
    if (hasError) {
      emit({
        type: "agent_error",
        agentId: ctx.agentId ?? "unknown",
        sessionId: ctx.sessionKey ?? "",
        timestamp: Date.now(),
        data: { error: event.error, toolName: event.toolName },
      }, acct(ctx));
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
    }, ctx.accountId);
  });

  api.on("message_sent", (event, ctx) => {
    // Use event.to as agentId — this is the target agent identity.
    emit({
      type: "message_out",
      agentId: event.to ?? ctx.accountId ?? "unknown",
      sessionId: ctx.conversationId ?? "",
      timestamp: Date.now(),
      data: { to: event.to, success: event.success, error: event.error, channelId: ctx.channelId },
    }, ctx.accountId);
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
      }, acct(ctx));
    } else {
      emit({
        type: "agent_end",
        agentId: ctx.agentId ?? "unknown",
        sessionId: ctx.sessionKey ?? "",
        timestamp: Date.now(),
        data: { durationMs: event.durationMs },
      }, acct(ctx));
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
    }, ctx.accountId as string | undefined);
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
    }, ctx.accountId as string | undefined);
  });
}

/** Forward URL + per-account tokens for HTTP POST to Rust server */
let forwardUrl: string | null = null;
let accountTokens: Map<string, string> = new Map();

export function setForwardTarget(url: string, tokens: Map<string, string>): void {
  forwardUrl = url;
  accountTokens = tokens;
}

function emit(event: InternalEvent, accountId?: string): void {
  officeState.ingest(event);

  if (!forwardUrl) return;

  // Only forward with the exact account's token — no fallback
  const token = accountId ? accountTokens.get(accountId) : undefined;
  if (!token) return;

  fetch(forwardUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(event),
  }).catch(() => {
    // Swallow — server may be temporarily unavailable
  });
}

/**
 * Manually ingest a hook event (for testing or direct integration).
 */
export function ingestHookEvent(
  type: InternalEvent["type"],
  sessionId: string,
  agentId: string,
  data: Record<string, unknown> = {},
  accountId?: string,
): void {
  emit({
    type,
    sessionId,
    agentId,
    timestamp: Date.now(),
    data,
  }, accountId);
}
