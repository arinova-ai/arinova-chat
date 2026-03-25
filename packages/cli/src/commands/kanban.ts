import { Command } from "commander";
import { get, post, patch, put, del } from "../client.js";
import { printResult, printError, printSuccess, table } from "../output.js";

export function registerKanban(program: Command): void {
  const kanban = program.command("kanban").description("Kanban board management");

  // ── column subcommands ──────────────────────────────────────────────

  const column = kanban.command("column").description("Column management");

  column
    .command("list")
    .description("List columns for a board")
    .requiredOption("--board-id <id>", "Board ID")
    .action(async (opts: { boardId: string }) => {
      try {
        const data = await get(`/api/kanban/boards/${opts.boardId}`);
        const columns =
          (data as Record<string, unknown>).columns ?? data;
        if (Array.isArray(columns)) {
          table(columns as Record<string, unknown>[], [
            { key: "id", label: "ID" },
            { key: "name", label: "Name" },
            { key: "position", label: "Position" },
          ]);
        } else {
          printResult(data);
        }
      } catch (err) {
        printError(err);
      }
    });

  column
    .command("create")
    .description("Create a column")
    .requiredOption("--board-id <id>", "Board ID")
    .requiredOption("--name <name>", "Column name")
    .action(async (opts: { boardId: string; name: string }) => {
      try {
        const data = await post(`/api/kanban/boards/${opts.boardId}/columns`, {
          name: opts.name,
        });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  column
    .command("update")
    .description("Update a column")
    .requiredOption("--column-id <id>", "Column ID")
    .requiredOption("--name <name>", "New column name")
    .action(async (opts: { columnId: string; name: string }) => {
      try {
        const data = await patch(`/api/kanban/columns/${opts.columnId}`, {
          name: opts.name,
        });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  column
    .command("delete")
    .description("Delete a column")
    .requiredOption("--column-id <id>", "Column ID")
    .action(async (opts: { columnId: string }) => {
      try {
        await del(`/api/kanban/columns/${opts.columnId}`);
        printSuccess(`Column ${opts.columnId} deleted.`);
      } catch (err) {
        printError(err);
      }
    });

  column
    .command("reorder")
    .description("Reorder columns in a board")
    .requiredOption("--board-id <id>", "Board ID")
    .requiredOption("--column-ids <ids...>", "Ordered column IDs")
    .action(async (opts: { boardId: string; columnIds: string[] }) => {
      try {
        const data = await put(
          `/api/kanban/boards/${opts.boardId}/columns/reorder`,
          { columnIds: opts.columnIds },
        );
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  // ── card subcommands ────────────────────────────────────────────────

  const card = kanban.command("card").description("Card management");

  card
    .command("link-note")
    .description("Link a note to a card")
    .requiredOption("--card-id <id>", "Card ID")
    .requiredOption("--note-id <id>", "Note ID")
    .action(async (opts: { cardId: string; noteId: string }) => {
      try {
        const data = await post(`/api/kanban/cards/${opts.cardId}/notes`, {
          noteId: opts.noteId,
        });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  card
    .command("unlink-note")
    .description("Unlink a note from a card")
    .requiredOption("--card-id <id>", "Card ID")
    .requiredOption("--note-id <id>", "Note ID")
    .action(async (opts: { cardId: string; noteId: string }) => {
      try {
        await del(`/api/kanban/cards/${opts.cardId}/notes/${opts.noteId}`);
        printSuccess(`Note ${opts.noteId} unlinked from card ${opts.cardId}.`);
      } catch (err) {
        printError(err);
      }
    });

  card
    .command("notes")
    .description("List notes linked to a card")
    .requiredOption("--card-id <id>", "Card ID")
    .action(async (opts: { cardId: string }) => {
      try {
        const data = await get(`/api/kanban/cards/${opts.cardId}/notes`);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  card
    .command("commits")
    .description("List commits linked to a card")
    .requiredOption("--card-id <id>", "Card ID")
    .action(async (opts: { cardId: string }) => {
      try {
        const data = await get(`/api/kanban/cards/${opts.cardId}/commits`);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  card
    .command("add-label")
    .description("Add a label to a card")
    .requiredOption("--card-id <id>", "Card ID")
    .requiredOption("--label-id <id>", "Label ID")
    .action(async (opts: { cardId: string; labelId: string }) => {
      try {
        const data = await post(`/api/kanban/cards/${opts.cardId}/labels`, {
          labelId: opts.labelId,
        });
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  card
    .command("remove-label")
    .description("Remove a label from a card")
    .requiredOption("--card-id <id>", "Card ID")
    .requiredOption("--label-id <id>", "Label ID")
    .action(async (opts: { cardId: string; labelId: string }) => {
      try {
        await del(`/api/kanban/cards/${opts.cardId}/labels/${opts.labelId}`);
        printSuccess(`Label ${opts.labelId} removed from card ${opts.cardId}.`);
      } catch (err) {
        printError(err);
      }
    });

  // ── label subcommands ───────────────────────────────────────────────

  const label = kanban.command("label").description("Label management");

  label
    .command("update")
    .description("Update a label")
    .requiredOption("--label-id <id>", "Label ID")
    .option("--name <name>", "New label name")
    .option("--color <color>", "New label color")
    .action(async (opts: { labelId: string; name?: string; color?: string }) => {
      try {
        const body: Record<string, unknown> = {};
        if (opts.name) body.name = opts.name;
        if (opts.color) body.color = opts.color;
        const data = await patch(`/api/kanban/labels/${opts.labelId}`, body);
        printResult(data);
      } catch (err) {
        printError(err);
      }
    });

  label
    .command("delete")
    .description("Delete a label")
    .requiredOption("--label-id <id>", "Label ID")
    .action(async (opts: { labelId: string }) => {
      try {
        await del(`/api/kanban/labels/${opts.labelId}`);
        printSuccess(`Label ${opts.labelId} deleted.`);
      } catch (err) {
        printError(err);
      }
    });
}
