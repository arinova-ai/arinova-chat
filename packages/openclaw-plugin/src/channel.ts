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
import { exchangePairingCode } from "./auth.js";
import { createWSClient } from "./ws-client.js";
import { handleArinovaChatInbound } from "./inbound.js";

const meta = {
  id: "arinova-chat",
  label: "Arinova Chat",
  selectionLabel: "Arinova Chat (A2A streaming)",
  docsPath: "/channels/arinova-chat",
  docsLabel: "arinova-chat",
  blurb: "Human-to-AI messaging via Arinova Chat with native streaming.",
  aliases: ["arinova"],
  order: 70,
  quickstartAllowFrom: true,
};

export const arinovaChatPlugin: ChannelPlugin<ResolvedArinovaChatAccount> = {
  id: "arinova-chat",
  meta,
  pairing: {
    idLabel: "arinovaUserId",
    normalizeAllowEntry: (entry) =>
      entry.replace(/^(arinova-chat|arinova):/i, "").toLowerCase(),
    notifyApproval: async ({ id }) => {
      console.log(`[arinova-chat] User ${id} approved for pairing`);
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
  reload: { configPrefixes: ["channels.arinova-chat"] },
  configSchema: buildChannelConfigSchema(ArinovaChatConfigSchema),
  config: {
    listAccountIds: (cfg) => listArinovaChatAccountIds(cfg as CoreConfig),
    resolveAccount: (cfg, accountId) =>
      resolveArinovaChatAccount({ cfg: cfg as CoreConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultArinovaChatAccountId(cfg as CoreConfig),
    isConfigured: (account) =>
      Boolean(
        account.apiUrl?.trim() &&
          (account.agentId?.trim() || account.pairingCode?.trim()),
      ),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(
        account.apiUrl?.trim() &&
          (account.agentId?.trim() || account.pairingCode?.trim()),
      ),
      apiUrl: account.apiUrl ? "[set]" : "[missing]",
      pairingCode: account.pairingCode ? "[set]" : "[not set]",
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
        .map((entry) => entry.replace(/^(arinova-chat|arinova):/i, ""))
        .map((entry) => entry.toLowerCase()),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        cfg.channels?.["arinova-chat"]?.accounts?.[resolvedAccountId],
      );
      const basePath = useAccountPath
        ? `channels.arinova-chat.accounts.${resolvedAccountId}.`
        : "channels.arinova-chat.";
      return {
        policy: account.config.dmPolicy ?? "open",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("arinova-chat"),
        normalizeEntry: (raw) => raw.replace(/^(arinova-chat|arinova):/i, "").toLowerCase(),
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
        channelKey: "arinova-chat",
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
        channelKey: "arinova-chat",
        accountId,
        name: setupInput.name,
      });
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...namedConfig,
          channels: {
            ...namedConfig.channels,
            "arinova-chat": {
              ...namedConfig.channels?.["arinova-chat"],
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
          "arinova-chat": {
            ...namedConfig.channels?.["arinova-chat"],
            enabled: true,
            accounts: {
              ...namedConfig.channels?.["arinova-chat"]?.accounts,
              [accountId]: {
                ...namedConfig.channels?.["arinova-chat"]?.accounts?.[accountId],
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
      return { channel: "arinova-chat", messageId: result.messageId ?? "inline", ...result };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId }) => {
      const messageWithMedia = mediaUrl ? `${text}\n\nAttachment: ${mediaUrl}` : text;
      const result = await sendMessageArinovaChat(to, messageWithMedia, {
        accountId: accountId ?? undefined,
      });
      return { channel: "arinova-chat", messageId: result.messageId ?? "inline", ...result };
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
          (account.agentId?.trim() || account.pairingCode?.trim()),
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
      if (!account.agentId && !account.pairingCode) {
        throw new Error(
          `Arinova Chat not configured for account "${account.accountId}" (missing agentId or pairingCode)`,
        );
      }

      const core = getArinovaChatRuntime();
      const cfg = ctx.cfg as CoreConfig;
      const logger = core.logging.getChildLogger({
        channel: "arinova-chat",
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

      // Pairing code flow: exchange code for agentId, then persist to config
      if (account.pairingCode && !account.agentId) {
        logger.info(`[${account.accountId}] exchanging pairing code...`);
        try {
          const result = await exchangePairingCode({
            apiUrl: account.apiUrl,
            pairingCode: account.pairingCode,
          });
          account.agentId = result.agentId;
          logger.info(
            `[${account.accountId}] paired successfully — agentId=${result.agentId} name="${result.name}"`,
          );

          // Persist agentId to config so pairing code isn't needed on restart
          try {
            const isDefault = account.accountId === DEFAULT_ACCOUNT_ID;
            const channelCfg = (ctx.cfg as Record<string, unknown>).channels as Record<string, unknown> | undefined;
            const arinovaCfg = { ...(channelCfg?.["arinova-chat"] as Record<string, unknown> ?? {}) };

            if (isDefault) {
              arinovaCfg.agentId = result.agentId;
              delete arinovaCfg.pairingCode;
            } else {
              const accounts = { ...(arinovaCfg.accounts as Record<string, unknown> ?? {}) };
              const acct = { ...(accounts[account.accountId] as Record<string, unknown> ?? {}) };
              acct.agentId = result.agentId;
              delete acct.pairingCode;
              accounts[account.accountId] = acct;
              arinovaCfg.accounts = accounts;
            }

            const updatedCfg = {
              ...ctx.cfg,
              channels: {
                ...channelCfg,
                "arinova-chat": arinovaCfg,
              },
            };
            await core.config.writeConfigFile(updatedCfg);
            logger.info(`[${account.accountId}] agentId persisted to config (pairingCode removed)`);
          } catch (persistErr) {
            // Non-fatal: agentId is in memory, WS connection will still work this session
            logger.error(`[${account.accountId}] failed to persist agentId to config: ${String(persistErr)}`);
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error(`[${account.accountId}] pairing failed: ${errorMsg}`);
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
            channel: "arinova-chat",
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
          logger.info(`[arinova-chat:${account.accountId}] WebSocket connected`);
        },
        onDisconnected: () => {
          logger.info(`[arinova-chat:${account.accountId}] WebSocket disconnected, will reconnect...`);
        },
        onError: (error) => {
          logger.error(`[arinova-chat:${account.accountId}] WebSocket error: ${error.message}`);
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
