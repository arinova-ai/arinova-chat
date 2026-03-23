import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";

export function registerMemoryCommands(program: Command): void {
  const memory = program.command("memory").description("Memory capsule commands");

  memory.command("query")
    .requiredOption("--query <text>", "Search query")
    .option("--limit <n>", "Max results")
    .action(async (opts: { query: string; limit?: string }) => {
      const { token, apiUrl } = getOpts(memory);
      const qs = new URLSearchParams({ q: opts.query });
      if (opts.limit) qs.set("limit", opts.limit);
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/agent/memory/search?${qs}`, token }));
    });
}
