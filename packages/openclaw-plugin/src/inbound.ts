import { createReplyPrefixOptions, type OpenClawConfig, type RuntimeEnv } from "openclaw/plugin-sdk";
import type { ResolvedArinovaChatAccount } from "./accounts.js";
import type { ArinovaChatInboundMessage, CoreConfig } from "./types.js";
import { getArinovaChatRuntime } from "./runtime.js";
import { replaceImagePaths } from "./image-upload.js";

const CHANNEL_ID = "arinova-chat" as const;

// Known tool names from Claude Code CLI bridge
const TOOL_LINE_RE = /^\[(Bash|Read|Write|Edit|Grep|Glob|WebFetch|WebSearch|Task|Skill|NotebookEdit)\]/;
const RESULT_PREFIX = "📎";

// MEDIA: token regex — matches lines like `MEDIA: https://example.com/img.png`
const MEDIA_LINE_RE = /^\s*MEDIA:\s/i;

/**
 * Collapse consecutive tool blocks, keeping only the latest one.
 * When Claude Code runs multiple tools in sequence, each [Tool] line + its
 * 📎 result stacks up. Since the frontend replaces content (not appends),
 * we can show only the most recent tool activity for a cleaner UX.
 */
function collapseToolBlocks(text: string): string {
  const lines = text.split("\n");
  const output: string[] = [];
  let pendingTool: string[] | null = null;
  let inResult = false;

  for (const line of lines) {
    if (TOOL_LINE_RE.test(line)) {
      // New tool call — discard any previous pending tool block
      pendingTool = [line];
      inResult = false;
    } else if (pendingTool !== null) {
      if (line === "") {
        pendingTool.push(line);
        if (inResult) inResult = false; // blank line ends result section
      } else if (line.startsWith(RESULT_PREFIX)) {
        pendingTool.push(line);
        inResult = true;
      } else if (inResult) {
        // Content line within result section
        pendingTool.push(line);
      } else {
        // Non-tool content after tool block — flush pending tool, continue as text
        output.push(...pendingTool);
        pendingTool = null;
        output.push(line);
      }
    } else {
      output.push(line);
    }
  }

  // Flush remaining pending tool block
  if (pendingTool) {
    output.push(...pendingTool);
  }

  return output.join("\n");
}

/**
 * Strip MEDIA: lines from streaming text so the raw token doesn't flash on screen.
 * OpenClaw parses these at block-completion time, but during streaming the raw lines
 * are still present.
 */
function stripMediaLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !MEDIA_LINE_RE.test(line))
    .join("\n");
}

/**
 * Convert media URLs to markdown image syntax.
 */
function mediaUrlsToMarkdown(urls: string[]): string {
  return urls.map((url) => `![](${url})`).join("\n");
}

/**
 * Handle an inbound message from the backend via WebSocket.
 * Streams the reply back using sendChunk/sendComplete/sendError callbacks.
 */
export async function handleArinovaChatInbound(params: {
  message: ArinovaChatInboundMessage;
  sendChunk: (chunk: string) => void;
  sendComplete: (content: string) => void;
  sendError: (error: string) => void;
  account: ResolvedArinovaChatAccount;
  config: CoreConfig;
  runtime: RuntimeEnv;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}): Promise<void> {
  const { message, sendChunk, sendComplete, sendError, account, config, runtime, statusSink } = params;
  const core = getArinovaChatRuntime();

  const rawBody = message.text.trim();
  if (!rawBody) {
    sendComplete("");
    return;
  }

  statusSink?.({ lastInboundAt: message.timestamp });

  // The sender is the Arinova backend on behalf of the user.
  const senderId = "arinova-user";
  const senderName = "Arinova User";

  // DM policy check
  const dmPolicy = account.config.dmPolicy ?? "open";
  if (dmPolicy === "disabled") {
    runtime.log?.(`arinova-chat: drop DM (dmPolicy=disabled)`);
    sendComplete("");
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

  // Track final content from block delivery
  let finalText = "";

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config as OpenClawConfig,
    dispatcherOptions: {
      ...prefixOptions,
      deliver: async (payload) => {
        const p = payload as { text?: string; mediaUrls?: string[] };
        let text = p.text ?? "";

        // Convert media URLs to markdown images
        if (p.mediaUrls?.length) {
          const md = mediaUrlsToMarkdown(p.mediaUrls);
          text = text.trim() ? `${text}\n\n${md}` : md;
        }

        if (!text.trim()) return;

        // Upload local image files and replace paths with public URLs
        const workDir = process.env.OPENCLAW_WORKSPACE ?? `${process.env.HOME}/.openclaw/workspace`;
        text = await replaceImagePaths(text, workDir, (msg) => runtime.log?.(msg));

        finalText += (finalText ? "\n\n" : "") + text;
        statusSink?.({ lastOutboundAt: Date.now() });
      },
      onError: (err, info) => {
        runtime.error?.(`arinova-chat ${info.kind} reply failed: ${String(err)}`);
      },
    },
    replyOptions: {
      onModelSelected,
      disableBlockStreaming: false,
      onPartialReply: (payload) => {
        // onPartialReply gives the FULL accumulated text across ALL blocks,
        // so we must NOT prepend finalText — that would duplicate completed blocks.
        const text = (payload as { text?: string }).text ?? "";
        if (text) {
          // Strip MEDIA: lines so raw tokens don't flash during streaming
          const cleaned = stripMediaLines(text);
          if (!cleaned.trim()) return;
          sendChunk(collapseToolBlocks(cleaned));
        }
      },
    },
  });

  // Send final completed event
  sendComplete(finalText);
}
