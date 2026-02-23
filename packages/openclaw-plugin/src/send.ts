import type { ArinovaChatSendResult, CoreConfig } from "./types.js";
import { resolveArinovaChatAccount } from "./accounts.js";
import { getArinovaChatRuntime, getAgentInstance } from "./runtime.js";

type ArinovaChatSendOpts = {
  accountId?: string;
};

/**
 * Send a proactive text message via Arinova Chat.
 *
 * Uses the Agent SDK's sendMessage method to deliver messages
 * outside of an A2A request context (e.g. @mention responses,
 * scheduled messages, notifications).
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

  const agent = getAgentInstance(account.accountId);
  if (agent) {
    console.log(
      `[openclaw-arinova-ai] sendMessage accountId=${account.accountId} conversationId=${conversationId} textLen=${text.length}`,
    );
    agent.sendMessage(conversationId, text);
  } else {
    console.warn(
      `[openclaw-arinova-ai] No agent instance for accountId="${account.accountId}" — message dropped`,
    );
  }

  getArinovaChatRuntime().channel.activity.record({
    channel: "openclaw-arinova-ai",
    accountId: account.accountId,
    direction: "outbound",
  });

  return {};
}
