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

    // CLI: openclaw arinova-setup <pairing-code> [--api-url <url>]
    api.registerCli(
      async (ctx) => {
        ctx.program
          .command("arinova-setup")
          .description("Pair with an Arinova Chat bot using a pairing code")
          .argument("<pairing-code>", "6-character pairing code from Arinova Chat web UI")
          .option("--api-url <url>", "Arinova Chat backend URL (reads from config if not provided)")
          .action(async (pairingCode: string, opts: { apiUrl?: string }) => {
            const channelCfg = (ctx.config as Record<string, unknown>).channels as Record<string, unknown> | undefined;
            const arinovaCfg = (channelCfg?.["arinova-chat"] ?? {}) as Record<string, unknown>;
            const apiUrl = opts.apiUrl ?? (arinovaCfg.apiUrl as string | undefined);

            if (!apiUrl) {
              console.error("Error: No API URL found. Either set channels.arinova-chat.apiUrl in config or use --api-url <url>");
              process.exit(1);
            }

            console.log(`Pairing with ${apiUrl} using code ${pairingCode}...`);

            try {
              const result = await exchangePairingCode({ apiUrl, pairingCode });
              console.log(`Paired successfully! Agent: "${result.name}" (id: ${result.agentId})`);

              // Persist to config
              const updatedCfg = {
                ...ctx.config,
                channels: {
                  ...channelCfg,
                  "arinova-chat": {
                    ...arinovaCfg,
                    enabled: true,
                    apiUrl,
                    agentId: result.agentId,
                  },
                },
              };
              // Remove pairingCode from config since we now have agentId
              delete (updatedCfg.channels as Record<string, Record<string, unknown>>)["arinova-chat"].pairingCode;

              await api.runtime.config.writeConfigFile(updatedCfg);
              console.log("Config saved! agentId written, pairingCode removed.");
              console.log("\nRestart the gateway to connect: openclaw gateway start");
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`Pairing failed: ${msg}`);
              process.exit(1);
            }
          });
      },
      { commands: ["arinova-setup"] },
    );
  },
};

export default plugin;
