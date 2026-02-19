import type { ArinovaChatSendResult, CoreConfig } from "./types.js";
import { resolveArinovaChatAccount } from "./accounts.js";
import { getArinovaChatRuntime } from "./runtime.js";

type ArinovaChatSendOpts = {
  accountId?: string;
};

/**
 * Send a text message via Arinova Chat.
 *
 * Note: For most replies, the plugin responds inline via the A2A SSE stream.
 * This function is a fallback for proactive outbound messages outside of
 * an A2A request context (e.g. scheduled messages, notifications).
 *
 * Arinova Chat uses WebSocket for 1v1 message sending, so proactive outbound
 * is not yet fully supported. Replies are delivered inline via A2A SSE.
 */
export async function sendMessageArinovaChat(
  to: string,
  text: string,
  opts: ArinovaChatSendOpts = {},
): Promise<ArinovaChatSendResult> {
  const cfg = getArinovaChatRuntime().config.loadConfig() as CoreConfig;
  const account = resolveArinovaChatAccount({
    cfg,
    accountId: opts.accountId,
  });

  if (!account.apiUrl) {
    throw new Error(
      `Arinova Chat apiUrl missing for account "${account.accountId}" (set channels.openclaw-arinova-ai.apiUrl).`,
    );
  }

  if (!text?.trim()) {
    throw new Error("Message must be non-empty for Arinova Chat sends");
  }

  // Strip channel prefix to get conversation ID
  let conversationId = to.trim();
  if (conversationId.startsWith("openclaw-arinova-ai:")) {
    conversationId = conversationId.slice("openclaw-arinova-ai:".length).trim();
  } else if (conversationId.startsWith("arinova:")) {
    conversationId = conversationId.slice("arinova:".length).trim();
  }

  if (!conversationId) {
    throw new Error("Conversation ID is required for Arinova Chat sends");
  }

  console.warn(
    `[openclaw-arinova-ai] Proactive outbound to ${conversationId} is not yet supported. ` +
      `Replies are delivered inline via A2A SSE.`,
  );

  getArinovaChatRuntime().channel.activity.record({
    channel: "openclaw-arinova-ai",
    accountId: account.accountId,
    direction: "outbound",
  });

  return {};
}
