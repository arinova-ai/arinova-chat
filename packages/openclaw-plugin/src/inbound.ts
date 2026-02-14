import type { ServerResponse } from "node:http";
import { createReplyPrefixOptions, type OpenClawConfig, type RuntimeEnv } from "openclaw/plugin-sdk";
import type { ResolvedArinovaChatAccount } from "./accounts.js";
import type { ArinovaChatInboundMessage, CoreConfig } from "./types.js";
import { getArinovaChatRuntime } from "./runtime.js";
import { writeA2ASSEEvent } from "./a2a-server.js";

const CHANNEL_ID = "arinova-chat" as const;

/**
 * Handle an inbound A2A message: route it to the OpenClaw agent,
 * and stream the reply back as A2A SSE events on the response.
 */
export async function handleArinovaChatInbound(params: {
  message: ArinovaChatInboundMessage;
  res: ServerResponse;
  account: ResolvedArinovaChatAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { message, res, account, config, runtime, statusSink } = params;
  const core = getArinovaChatRuntime();

  const rawBody = message.text.trim();
  if (!rawBody) {
    writeA2ASSEEvent(res, message.taskId, "completed", "");
    res.end();
    return;
  }

  statusSink?.({ lastInboundAt: message.timestamp });

  // The sender is the Arinova backend on behalf of the user.
  // A2A protocol doesn't expose user identity, so we use a fixed sender ID.
  const senderId = "arinova-user";
  const senderName = "Arinova User";

  // DM policy check
  const dmPolicy = account.config.dmPolicy ?? "open";
  if (dmPolicy === "disabled") {
    runtime.log?.(`arinova-chat: drop DM (dmPolicy=disabled)`);
    writeA2ASSEEvent(res, message.taskId, "completed", "");
    res.end();
    return;
  }

  // Resolve agent route
  const route = core.channel.routing.resolveAgentRoute({
    cfg: config as OpenClawConfig,
    channel: CHANNEL_ID,
    accountId: account.accountId,
    peer: {
      kind: "direct",
      id: senderId,
    },
  });

  const fromLabel = senderName;
  const storePath = core.channel.session.resolveStorePath(
    (config.session as Record<string, unknown> | undefined)?.store as string | undefined,
    { agentId: route.agentId },
  );
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config as OpenClawConfig);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "Arinova Chat",
    from: fromLabel,
    timestamp: message.timestamp,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    BodyForAgent: rawBody,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: `arinova-chat:${senderId}`,
    To: `arinova-chat:${account.agentId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: "direct",
    ConversationLabel: fromLabel,
    SenderName: senderName,
    SenderId: senderId,
    Provider: CHANNEL_ID,
    Surface: CHANNEL_ID,
    MessageSid: message.taskId,
    Timestamp: message.timestamp,
    OriginatingChannel: CHANNEL_ID,
    OriginatingTo: `arinova-chat:${account.agentId}`,
    CommandAuthorized: true,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`arinova-chat: failed updating session meta: ${String(err)}`);
    },
  });

  const { onModelSelected, ...prefixOptions } = createReplyPrefixOptions({
    cfg: config as OpenClawConfig,
    agentId: route.agentId,
    channel: CHANNEL_ID,
    accountId: account.accountId,
  });

  // Track accumulated text for SSE streaming
  let accumulated = "";

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config as OpenClawConfig,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload) => {
        const text = (payload as { text?: string }).text ?? "";
        if (!text.trim()) return;

        accumulated += (accumulated ? "\n\n" : "") + text;

        // Send "working" SSE event with accumulated text
        if (!res.writableEnded) {
          writeA2ASSEEvent(res, message.taskId, "working", accumulated);
        }

        statusSink?.({ lastOutboundAt: Date.now() });
      },
      onError: (err, info) => {
        runtime.error?.(`arinova-chat ${info.kind} reply failed: ${String(err)}`);
      },
    },
    replyOptions: {
      onModelSelected,
      disableBlockStreaming: true,
    },
  });

  // Send final "completed" event and close the SSE stream
  if (!res.writableEnded) {
    writeA2ASSEEvent(res, message.taskId, "completed", accumulated);
    res.end();
  }
}
