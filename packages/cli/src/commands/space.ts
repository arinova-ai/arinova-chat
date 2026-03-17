import { Command } from "commander";
import { get, post, put, patch, del } from "../client.js";
import { printResult, printError, printSuccess, table } from "../output.js";

export function registerSpace(program: Command): void {
  const space = program.command("space").description("Space management");

  space
    .command("list")
    .description("List your spaces")
    .action(async () => {
      try {
        const data = await get("/api/creator/spaces");
        const spaces = (data as Record<string, unknown>).spaces ?? data;
        if (Array.isArray(spaces)) {
          table(spaces as Record<string, unknown>[], [
            { key: "id", label: "ID" },
            { key: "name", label: "Name" },
            { key: "status", label: "Status" },
          ]);
        } else {
          printResult(data);
        }
      } catch (err) {
        printError(err);
      }
    });

  space
    .command("create")
    .description("Create a new space")
    .requiredOption("--name <name>", "Space name")
    .option("--description <desc>", "Description")
    .action(async (opts: { name: string; description?: string }) => {
      try {
        const data = await post("/api/spaces", {
          name: opts.name,
          description: opts.description ?? "",
        });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  space
    .command("update <id>")
    .description("Update a space")
    .option("--name <name>", "New name")
    .option("--description <desc>", "New description")
    .action(async (id: string, opts: { name?: string; description?: string }) => {
      try {
        const body: Record<string, unknown> = {};
        if (opts.name) body.name = opts.name;
        if (opts.description) body.description = opts.description;
        const data = await put(`/api/spaces/${id}`, body);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  space
    .command("delete <id>")
    .description("Delete a space")
    .action(async (id: string) => {
      try {
        await del(`/api/spaces/${id}`);
        printSuccess(`Space ${id} deleted.`);
      } catch (err) {
        printError(err);
      }
    });

  space
    .command("publish <id>")
    .description("Publish a space")
    .action(async (id: string) => {
      try {
        const data = await patch(`/api/spaces/${id}`, { status: "published" });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  space
    .command("unpublish <id>")
    .description("Unpublish a space")
    .action(async (id: string) => {
      try {
        const data = await patch(`/api/spaces/${id}`, { status: "draft" });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });
}
