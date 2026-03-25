import { Command } from "commander";
import { get, post, del } from "../client.js";
import { printResult, printError, printSuccess, table } from "../output.js";

export function registerMemory(program: Command): void {
  const memory = program.command("memory").description("Agent memory management");

  memory
    .command("list")
    .description("List memories for an agent")
    .requiredOption("--agent-id <id>", "Agent ID")
    .action(async (opts: { agentId: string }) => {
      try {
        const data = await get(`/api/v1/memories?agent_id=${opts.agentId}`);
        const memories =
          (data as Record<string, unknown>).memories ?? data;
        if (Array.isArray(memories)) {
          table(memories as Record<string, unknown>[], [
            { key: "id", label: "ID" },
            { key: "category", label: "Category" },
            { key: "summary", label: "Summary" },
          ]);
        } else {
          printResult(data);
        }
      } catch (err) {
        printError(err);
      }
    });

  memory
    .command("create")
    .description("Create a memory entry")
    .requiredOption("--agent-id <id>", "Agent ID")
    .requiredOption("--category <cat>", "Category")
    .requiredOption("--summary <text>", "Summary text")
    .action(async (opts: { agentId: string; category: string; summary: string }) => {
      try {
        const data = await post("/api/v1/memories", {
          agent_id: opts.agentId,
          category: opts.category,
          summary: opts.summary,
        });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  memory
    .command("delete")
    .description("Delete a memory entry")
    .requiredOption("--memory-id <id>", "Memory ID")
    .action(async (opts: { memoryId: string }) => {
      try {
        await del(`/api/v1/memories/${opts.memoryId}`);
        printSuccess(`Memory ${opts.memoryId} deleted.`);
      } catch (err) {
        printError(err);
      }
    });
}
