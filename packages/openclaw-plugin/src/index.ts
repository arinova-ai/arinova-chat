import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { arinovaChatPlugin } from "./channel.js";
import { setArinovaChatRuntime } from "./runtime.js";
import { exchangeBotToken } from "./auth.js";

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

    // Hint on gateway start if not configured
    api.on("gateway_start", () => {
      const channels = (api.config as Record<string, unknown>).channels as Record<string, unknown> | undefined;
      const arinova = (channels?.["arinova-chat"] ?? {}) as Record<string, unknown>;
      const hasAgent = Boolean(arinova.agentId || arinova.botToken);
      const hasUrl = Boolean(arinova.apiUrl);

      if (!hasUrl || !hasAgent) {
        api.logger.warn("[arinova-chat] Not configured yet.");
        api.logger.warn("[arinova-chat] 1. Create a bot at https://chat.arinova.ai and copy the Bot Token from bot settings");
        api.logger.warn("[arinova-chat] 2. Run:  openclaw arinova-setup --token <bot-token> --api-url https://api.chat.arinova.ai");
      }
    });

    // CLI: openclaw arinova-setup --token <bot-token> [--api-url <url>]
    api.registerCli(
      async (ctx) => {
        ctx.program
          .command("arinova-setup")
          .description("Connect to an Arinova Chat bot using a bot token")
          .requiredOption("--token <bot-token>", "Bot token from Arinova Chat bot settings (ari_...)")
          .option("--api-url <url>", "Arinova Chat backend URL (default: https://api.chat.arinova.ai)")
          .action(async (opts: { token: string; apiUrl?: string }) => {
            const channelCfg = (ctx.config as Record<string, unknown>).channels as Record<string, unknown> | undefined;
            const arinovaCfg = (channelCfg?.["arinova-chat"] ?? {}) as Record<string, unknown>;
            const apiUrl = opts.apiUrl ?? (arinovaCfg.apiUrl as string | undefined) ?? "https://api.chat.arinova.ai";

            console.log(`Connecting to ${apiUrl} using bot token...`);

            try {
              const result = await exchangeBotToken({
                apiUrl,
                botToken: opts.token,
              });
              console.log(`Connected! Agent: "${result.name}" (id: ${result.agentId})`);

              // Persist to config
              const arinovaUpdate: Record<string, unknown> = {
                ...arinovaCfg,
                enabled: true,
                apiUrl,
                agentId: result.agentId,
                botToken: opts.token,
              };

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
