import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  formatPairingApproveHint,
  normalizeAccountId,
  type ChannelPlugin,
  type ChannelSetupInput,
  type OpenClawConfig,
  type RuntimeEnv,
} from "openclaw/plugin-sdk";
import type { CoreConfig } from "./types.js";
import {
  listArinovaChatAccountIds,
  resolveDefaultArinovaChatAccountId,
  resolveArinovaChatAccount,
  type ResolvedArinovaChatAccount,
} from "./accounts.js";
import { ArinovaChatConfigSchema } from "./config-schema.js";
import {
  looksLikeArinovaChatTargetId,
  normalizeArinovaChatMessagingTarget,
} from "./normalize.js";
import { getArinovaChatRuntime } from "./runtime.js";
import { sendMessageArinovaChat } from "./send.js";
import { exchangeBotToken } from "./auth.js";
import { createWSClient } from "./ws-client.js";
import { handleArinovaChatInbound } from "./inbound.js";

const meta = {
  id: "openclaw-arinova-ai",
  label: "Arinova Chat",
  selectionLabel: "Arinova Chat (A2A streaming)",
  docsPath: "/channels/openclaw-arinova-ai",
  docsLabel: "openclaw-arinova-ai",
  blurb: "Human-to-AI messaging via Arinova Chat with native streaming.",
  aliases: ["arinova"],
  order: 70,
  quickstartAllowFrom: true,
};

export const arinovaChatPlugin: ChannelPlugin<ResolvedArinovaChatAccount> = {
  id: "openclaw-arinova-ai",
  meta,
  pairing: {
    idLabel: "arinovaUserId",
    normalizeAllowEntry: (entry) =>
      entry.replace(/^(openclaw-arinova-ai|arinova):/i, "").toLowerCase(),
    notifyApproval: async ({ id }) => {
      console.log(`[openclaw-arinova-ai] User ${id} approved for pairing`);
    },
  },
  capabilities: {
    chatTypes: ["direct"],
    reactions: false,
    threads: false,
    media: true,
    nativeCommands: false,
    blockStreaming: false,
  },
  reload: { configPrefixes: ["channels.openclaw-arinova-ai"] },
  configSchema: buildChannelConfigSchema(ArinovaChatConfigSchema),
  config: {
    listAccountIds: (cfg) => listArinovaChatAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) =>
      resolveArinovaChatAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultArinovaChatAccountId(cfg as CoreConfig),
    isConfigured: (account) =>
      Boolean(
        account.apiUrl?.trim() &&
          (account.agentId?.trim() || account.botToken?.trim()),
      ),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(
        account.apiUrl?.trim() &&
          (account.agentId?.trim() || account.botToken?.trim()),
      ),
      apiUrl: account.apiUrl ? "[set]" : "[missing]",
      botToken: account.botToken ? "[set]" : "[not set]",
      agentId: account.agentId ? "[set]" : "[missing]",
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (
        resolveArinovaChatAccount({ cfg: cfg as CoreConfig, accountId }).config.allowFrom ?? []
      ).map((entry) => String(entry).toLowerCase()),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .map((entry) => entry.replace(/^(openclaw-arinova-ai|arinova):/i, ""))
        .map((entry) => entry.toLowerCase()),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        cfg.channels?.["openclaw-arinova-ai"]?.accounts?.[resolvedAccountId],
      );
      const basePath = useAccountPath
        ? `channels.openclaw-arinova-ai.accounts.${resolvedAccountId}.`
        : "channels.openclaw-arinova-ai.";
      return {
        policy: account.config.dmPolicy ?? "open",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("openclaw-arinova-ai"),
        normalizeEntry: (raw) => raw.replace(/^(openclaw-arinova-ai|arinova):/i, "").toLowerCase(),
      };
    },
    collectWarnings: () => [],
  },
  messaging: {
    normalizeTarget: normalizeArinovaChatMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeArinovaChatTargetId,
      hint: "<conversationId>",
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "openclaw-arinova-ai",
        accountId,
        name,
      }),
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const setupInput = input as ChannelSetupInput & {
        apiUrl?: string;
        agentId?: string;
      };
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "openclaw-arinova-ai",
        accountId,
        name: setupInput.name,
      });
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...namedConfig,
          channels: {
            ...namedConfig.channels,
            "openclaw-arinova-ai": {
              ...namedConfig.channels?.["openclaw-arinova-ai"],
              enabled: true,
              apiUrl: setupInput.apiUrl,
              agentId: setupInput.agentId,
            },
          },
        } as OpenClawConfig;
      }
      return {
        ...namedConfig,
        channels: {
          ...namedConfig.channels,
          "openclaw-arinova-ai": {
            ...namedConfig.channels?.["openclaw-arinova-ai"],
            enabled: true,
            accounts: {
              ...namedConfig.channels?.["openclaw-arinova-ai"]?.accounts,
              [accountId]: {
                ...namedConfig.channels?.["openclaw-arinova-ai"]?.accounts?.[accountId],
                enabled: true,
                apiUrl: setupInput.apiUrl,
                agentId: setupInput.agentId,
              },
            },
          },
        },
      } as OpenClawConfig;
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getArinovaChatRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 32000,
    sendText: async ({ to, text, accountId }) => {
      const result = await sendMessageArinovaChat(to, text, {
        accountId: accountId ?? undefined,
      });
      return { channel: "openclaw-arinova-ai", messageId: result.messageId ?? "inline", ...result };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId }) => {
      // Convert media URL to markdown image so frontend renders it as <img>
      const mediaMarkdown = mediaUrl ? `![](${mediaUrl})` : "";
      const messageWithMedia = [text, mediaMarkdown].filter(Boolean).join("\n\n");
      const result = await sendMessageArinovaChat(to, messageWithMedia, {
        accountId: accountId ?? undefined,
      });
      return { channel: "openclaw-arinova-ai", messageId: result.messageId ?? "inline", ...result };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      mode: "websocket",
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => {
      const configured = Boolean(
        account.apiUrl?.trim() &&
          (account.agentId?.trim() || account.botToken?.trim()),
      );
      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured,
        apiUrl: account.apiUrl ? "[set]" : "[missing]",
        agentId: account.agentId ? "[set]" : "[missing]",
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        mode: "websocket",
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      if (!account.apiUrl) {
        throw new Error(
          `Arinova Chat not configured for account "${account.accountId}" (missing apiUrl)`,
        );
      }
      if (!account.agentId && !account.botToken) {
        throw new Error(
          `Arinova Chat not configured for account "${account.accountId}" (missing agentId or botToken)`,
        );
      }

      const core = getArinovaChatRuntime();
      const cfg = ctx.cfg as CoreConfig;
      const logger = core.logging.getChildLogger({
        channel: "openclaw-arinova-ai",
        accountId: account.accountId,
      });
      const runtime: RuntimeEnv = ctx.runtime ?? {
        log: (message: string) => logger.info(message),
        error: (message: string) => logger.error(message),
        exit: () => {
          throw new Error("Runtime exit not available");
        },
      };

      // Derive WebSocket URL from apiUrl
      const wsUrl = account.apiUrl.replace(/^http/, "ws") + "/ws/agent";

      // Resolve agentId from botToken if not already set
      if (!account.agentId && account.botToken) {
        logger.info(`[${account.accountId}] exchanging bot token...`);
        try {
          const result = await exchangeBotToken({
            apiUrl: account.apiUrl,
            botToken: account.botToken,
          });
          account.agentId = result.agentId;
          logger.info(
            `[${account.accountId}] paired via bot token — agentId=${result.agentId} name="${result.name}"`,
          );

          // Persist agentId to config
          try {
            const isDefault = account.accountId === DEFAULT_ACCOUNT_ID;
            const channelCfg = (ctx.cfg as Record<string, unknown>).channels as Record<string, unknown> | undefined;
            const arinovaCfg = { ...(channelCfg?.["openclaw-arinova-ai"] as Record<string, unknown> ?? {}) };

            if (isDefault) {
              arinovaCfg.agentId = result.agentId;
            } else {
              const accounts = { ...(arinovaCfg.accounts as Record<string, unknown> ?? {}) };
              const acct = { ...(accounts[account.accountId] as Record<string, unknown> ?? {}) };
              acct.agentId = result.agentId;
              accounts[account.accountId] = acct;
              arinovaCfg.accounts = accounts;
            }

            const updatedCfg = {
              ...ctx.cfg,
              channels: {
                ...channelCfg,
                "openclaw-arinova-ai": arinovaCfg,
              },
            };
            await core.config.writeConfigFile(updatedCfg);
            logger.info(`[${account.accountId}] agentId persisted to config`);
          } catch (persistErr) {
            logger.error(`[${account.accountId}] failed to persist agentId to config: ${String(persistErr)}`);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error(`[${account.accountId}] bot token exchange failed: ${errorMsg}`);
          throw err;
        }
      }

      if (!account.agentId) {
        throw new Error(
          `Arinova Chat: agentId not available for account "${account.accountId}" after pairing`,
        );
      }

      // Connect to backend via WebSocket (Pull model)
      logger.info(`[${account.accountId}] connecting to backend WS: ${wsUrl}`);

      const client = createWSClient({
        wsUrl,
        agentId: account.agentId,
        onTask: async ({ taskId, conversationId, content, sendChunk, sendComplete, sendError }) => {
          core.channel.activity.record({
            channel: "openclaw-arinova-ai",
            accountId: account.accountId,
            direction: "inbound",
            at: Date.now(),
          });

          await handleArinovaChatInbound({
            message: { taskId, text: content, timestamp: Date.now() },
            sendChunk,
            sendComplete,
            sendError,
            account,
            config: cfg,
            runtime,
            statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
          });
        },
        onConnected: () => {
          logger.info(`[openclaw-arinova-ai:${account.accountId}] WebSocket connected`);
        },
        onDisconnected: () => {
          logger.info(`[openclaw-arinova-ai:${account.accountId}] WebSocket disconnected, will reconnect...`);
        },
        onError: (error) => {
          logger.error(`[openclaw-arinova-ai:${account.accountId}] WebSocket error: ${error.message}`);
        },
        abortSignal: ctx.abortSignal,
      });

      client.connect();

      return {
        stop: () => {
          client.disconnect();
        },
      };
    },
  },
};
