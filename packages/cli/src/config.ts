import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface CliConfig {
  apiKey?: string;
  endpoint?: string;
}

const CONFIG_DIR = join(homedir(), ".arinova-cli");
const CONFIG_FILE = join(CONFIG_DIR, "config");

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

export function loadConfig(): CliConfig {
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw) as CliConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: CliConfig): void {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
  chmodSync(CONFIG_FILE, 0o600);
}

export function getEndpoint(): string {
  return loadConfig().endpoint ?? "https://chat.arinova.ai";
}

export function getApiKey(): string | undefined {
  return loadConfig().apiKey;
}
