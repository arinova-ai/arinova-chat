import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setArinovaChatRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getArinovaChatRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Arinova Chat runtime not initialized");
  }
  return runtime;
}
