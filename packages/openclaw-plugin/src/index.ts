import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { arinovaChatPlugin } from "./channel.js";
import { setArinovaChatRuntime } from "./runtime.js";
import { exchangePairingCode } from "./auth.js";

const plugin: {
  id: string;
  name: string;
  description: string;
  configSchema: ReturnType<typeof emptyPluginConfigSchema>;
  register: (api: OpenClawPluginApi) => void;
} = {
  id: "openclaw-arinova-ai",
  name: "Arinova Chat",
  description: "Arinova Chat channel plugin (A2A protocol with native streaming)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setArinovaChatRuntime(api.runtime);
    api.registerChannel({ plugin: arinovaChatPlugin });

    // CLI: openclaw arinova-setup [--token <bot-token>] [--code <pairing-code>] [--api-url <url>]
    api.registerCli(
      async (ctx) => {
        ctx.program
          .command("arinova-setup")
          .description("Connect to an Arinova Chat bot using a bot token or pairing code")
          .option("--token <bot-token>", "Permanent bot token (recommended, from bot settings)")
          .option("--code <pairing-code>", "One-time 6-char pairing code (expires in 15 min)")
          .option("--api-url <url>", "Arinova Chat backend URL (reads from config if not provided)")
          .action(async (opts: { token?: string; code?: string; apiUrl?: string }) => {
            if (!opts.token && !opts.code) {
              console.error("Error: Provide --token <bot-token> or --code <pairing-code>");
              console.error("\n  Bot token (permanent):  openclaw arinova-setup --token ari_abc123...");
              console.error("  Pairing code (one-time): openclaw arinova-setup --code JZPH79");
              process.exit(1);
            }

            const channelCfg = (ctx.config as Record<string, unknown>).channels as Record<string, unknown> | undefined;
            const arinovaCfg = (channelCfg?.["arinova-chat"] ?? {}) as Record<string, unknown>;
            const apiUrl = opts.apiUrl ?? (arinovaCfg.apiUrl as string | undefined);

            if (!apiUrl) {
              console.error("Error: No API URL found. Either set channels.arinova-chat.apiUrl in config or use --api-url <url>");
              process.exit(1);
            }

            const method = opts.token ? "bot token" : "pairing code";
            console.log(`Connecting to ${apiUrl} using ${method}...`);

            try {
              const result = await exchangePairingCode({
                apiUrl,
                ...(opts.token ? { botToken: opts.token } : { pairingCode: opts.code! }),
              });
              console.log(`Connected! Agent: "${result.name}" (id: ${result.agentId})`);

              // Persist to config
              const arinovaUpdate: Record<string, unknown> = {
                ...arinovaCfg,
                enabled: true,
                apiUrl,
                agentId: result.agentId,
              };
              // Keep botToken in config for reconnection, remove pairingCode
              if (opts.token) {
                arinovaUpdate.botToken = opts.token;
              }
              delete arinovaUpdate.pairingCode;

              const updatedCfg = {
                ...ctx.config,
                channels: {
                  ...channelCfg,
                  "arinova-chat": arinovaUpdate,
                },
              };

              await api.runtime.config.writeConfigFile(updatedCfg);
              console.log("Config saved to openclaw.json");
              console.log("\nRestart the gateway to connect: openclaw gateway start");
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`Connection failed: ${msg}`);
              process.exit(1);
            }
          });
      },
      { commands: ["arinova-setup"] },
    );
  },
};

export default plugin;
