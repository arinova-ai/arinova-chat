import { Command } from "commander";
import { get, del } from "../client.js";
import { printResult, printError, printSuccess, table } from "../output.js";

export function registerMessage(program: Command): void {
  const message = program.command("message").description("Message management");

  message
    .command("list")
    .description("List messages in a conversation")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .action(async (opts: { conversationId: string }) => {
      try {
        const data = await get(
          `/api/conversations/${opts.conversationId}/messages`,
        );
        const messages =
          (data as Record<string, unknown>).messages ?? data;
        if (Array.isArray(messages)) {
          table(messages as Record<string, unknown>[], [
            { key: "id", label: "ID" },
            { key: "role", label: "Role" },
            { key: "content", label: "Content" },
          ]);
        } else {
          printResult(data);
        }
      } catch (err) {
        printError(err);
      }
    });

  message
    .command("delete")
    .description("Delete a message")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--message-id <id>", "Message ID")
    .action(async (opts: { conversationId: string; messageId: string }) => {
      try {
        await del(
          `/api/conversations/${opts.conversationId}/messages/${opts.messageId}`,
        );
        printSuccess(`Message ${opts.messageId} deleted.`);
      } catch (err) {
        printError(err);
      }
    });

  message
    .command("search")
    .description("Search messages")
    .requiredOption("--query <text>", "Search query")
    .option("--conversation-id <id>", "Limit to a conversation")
    .action(async (opts: { query: string; conversationId?: string }) => {
      try {
        let path = `/api/agent/search?q=${encodeURIComponent(opts.query)}`;
        if (opts.conversationId) {
          path += `&conversationId=${encodeURIComponent(opts.conversationId)}`;
        }
        const data = await get(path);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });
}
