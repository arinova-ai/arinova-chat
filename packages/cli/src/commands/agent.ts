import { Command } from "commander";
import { get, post, patch, del, upload } from "../client.js";
import { printResult, printError, printSuccess, table } from "../output.js";

export function registerAgent(program: Command): void {
  const agent = program.command("agent").description("Agent management");

  agent
    .command("list")
    .description("List your agents")
    .action(async () => {
      try {
        const data = await get("/api/creator/agents");
        const agents = (data as Record<string, unknown>).listings ?? (data as Record<string, unknown>).agents ?? data;
        if (Array.isArray(agents)) {
          table(agents as Record<string, unknown>[], [
            { key: "id", label: "ID" },
            { key: "agent_name", label: "Name" },
            { key: "status", label: "Status" },
            { key: "category", label: "Category" },
          ]);
        } else {
          printResult(data);
        }
      } catch (err) {
        printError(err);
      }
    });

  agent
    .command("create")
    .description("Create a new agent")
    .requiredOption("--name <name>", "Agent name")
    .option("--description <desc>", "Description")
    .option("--category <cat>", "Category", "general")
    .option("--model <model>", "Model", "claude-sonnet-4-20250514")
    .option("--system-prompt <prompt>", "System prompt")
    .action(
      async (opts: {
        name: string;
        description?: string;
        category: string;
        model: string;
        systemPrompt?: string;
      }) => {
        try {
          const data = await post("/api/creator/agents/create", {
            agent_name: opts.name,
            description: opts.description ?? "",
            category: opts.category,
            model: opts.model,
            system_prompt: opts.systemPrompt ?? "",
          });
          printResult(data);
        } catch (err) {
          printError(err);
        }
      },
    );

  agent
    .command("update <id>")
    .description("Update an agent")
    .option("--name <name>", "New name")
    .option("--description <desc>", "New description")
    .option("--category <cat>", "New category")
    .option("--model <model>", "New model")
    .option("--system-prompt <prompt>", "New system prompt")
    .action(
      async (
        id: string,
        opts: {
          name?: string;
          description?: string;
          category?: string;
          model?: string;
          systemPrompt?: string;
        },
      ) => {
        try {
          const body: Record<string, unknown> = {};
          if (opts.name) body.agent_name = opts.name;
          if (opts.description) body.description = opts.description;
          if (opts.category) body.category = opts.category;
          if (opts.model) body.model = opts.model;
          if (opts.systemPrompt) body.system_prompt = opts.systemPrompt;
          const data = await patch(`/api/creator/agents/${id}`, body);
          printResult(data);
        } catch (err) {
          printError(err);
        }
      },
    );

  agent
    .command("delete <id>")
    .description("Delete an agent")
    .action(async (id: string) => {
      try {
        await del(`/api/creator/agents/${id}`);
        printSuccess(`Agent ${id} deleted.`);
      } catch (err) {
        printError(err);
      }
    });

  agent
    .command("upload-kb <agentId> <file>")
    .description("Upload a knowledge base file")
    .action(async (agentId: string, file: string) => {
      try {
        const data = await upload(
          `/api/creator/agents/${agentId}/knowledge-base`,
          file,
          "file",
        );
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  agent
    .command("delete-kb <agentId> <kbId>")
    .description("Delete a knowledge base entry")
    .action(async (agentId: string, kbId: string) => {
      try {
        await del(`/api/creator/agents/${agentId}/knowledge-base/${kbId}`);
        printSuccess(`Knowledge base ${kbId} deleted.`);
      } catch (err) {
        printError(err);
      }
    });

  agent
    .command("publish <id>")
    .description("Publish an agent (set status to active)")
    .action(async (id: string) => {
      try {
        const data = await patch(`/api/creator/agents/${id}`, { status: "active" });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  agent
    .command("unpublish <id>")
    .description("Unpublish an agent (set status to draft)")
    .action(async (id: string) => {
      try {
        const data = await patch(`/api/creator/agents/${id}`, { status: "draft" });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });
}
