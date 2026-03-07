import { Command } from "commander";
import { loadConfig, saveConfig, getApiKey, getEndpoint } from "../config.js";
import { printResult, printError, printSuccess } from "../output.js";

export function registerAuth(program: Command): void {
  const auth = program.command("auth").description("Authentication commands");

  auth
    .command("set-key <key>")
    .description("Set your API key")
    .action((key: string) => {
      if (!key.startsWith("ari_cli_")) {
        printError(new Error("Invalid key format. Expected: ari_cli_<hex>"));
        return;
      }
      const config = loadConfig();
      config.apiKey = key;
      saveConfig(config);
      printSuccess(`API key saved (prefix: ${key.slice(0, 12)}...)`);
    });

  auth
    .command("whoami")
    .description("Show current user info")
    .action(async () => {
      try {
        const key = getApiKey();
        if (!key) {
          printError(new Error("No API key configured. Run: arinova-cli auth set-key <key>"));
          return;
        }
        const res = await fetch(`${getEndpoint()}/api/creator/api-keys/whoami`, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) {
          const body = await res.text();
          printError(new Error(`API error ${res.status}: ${body}`));
          return;
        }
        const data = await res.json();
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  const config = program.command("config").description("Configuration commands");

  config
    .command("set <key> <value>")
    .description("Set a config value (endpoint)")
    .action((key: string, value: string) => {
      if (key !== "endpoint") {
        printError(new Error(`Unknown config key: ${key}. Supported: endpoint`));
        return;
      }
      try { new URL(value); } catch {
        printError(new Error("Invalid URL format"));
        return;
      }
      if (!value.startsWith("https://") && !value.startsWith("http://localhost")) {
        printError(new Error("Endpoint must use HTTPS (or http://localhost for dev)"));
        return;
      }
      const cfg = loadConfig();
      cfg.endpoint = value.replace(/\/+$/, "");
      saveConfig(cfg);
      printSuccess(`endpoint set to ${cfg.endpoint}`);
    });

  config
    .command("show")
    .description("Show current configuration")
    .action(() => {
      const cfg = loadConfig();
      printResult({
        endpoint: cfg.endpoint ?? "https://chat.arinova.ai (default)",
        apiKey: cfg.apiKey ? `${cfg.apiKey.slice(0, 12)}...(set)` : "(not set)",
      });
    });
}
