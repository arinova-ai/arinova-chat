import { Command } from "commander";
import { get, post, patch, del } from "../client.js";
import { printResult, printError, printSuccess, table } from "../output.js";

export function registerConversation(program: Command): void {
  const conversation = program
    .command("conversation")
    .description("Conversation management");

  conversation
    .command("list")
    .description("List conversations")
    .action(async () => {
      try {
        const data = await get("/api/conversations");
        const convos =
          (data as Record<string, unknown>).conversations ?? data;
        if (Array.isArray(convos)) {
          table(convos as Record<string, unknown>[], [
            { key: "id", label: "ID" },
            { key: "title", label: "Title" },
            { key: "created_at", label: "Created" },
          ]);
        } else {
          printResult(data);
        }
      } catch (err) {
        printError(err);
      }
    });

  conversation
    .command("create")
    .description("Create a new conversation")
    .requiredOption("--title <title>", "Conversation title")
    .action(async (opts: { title: string }) => {
      try {
        const data = await post("/api/conversations", { title: opts.title });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  conversation
    .command("delete")
    .description("Delete a conversation")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .action(async (opts: { conversationId: string }) => {
      try {
        await del(`/api/conversations/${opts.conversationId}`);
        printSuccess(`Conversation ${opts.conversationId} deleted.`);
      } catch (err) {
        printError(err);
      }
    });

  conversation
    .command("update")
    .description("Update a conversation")
    .requiredOption("--conversation-id <id>", "Conversation ID")
    .requiredOption("--title <title>", "New title")
    .action(async (opts: { conversationId: string; title: string }) => {
      try {
        const data = await patch(`/api/conversations/${opts.conversationId}`, {
          title: opts.title,
        });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });
}
