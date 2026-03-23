import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";

export function registerKanbanCommands(program: Command): void {
  const kanban = program.command("kanban").description("Kanban board commands");

  // Board commands
  const board = kanban.command("board").description("Board management");
  board.command("list").action(async () => {
    const { token, apiUrl } = getOpts(board);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/agent/kanban/boards`, token }));
  });
  board.command("create").requiredOption("--name <name>", "Board name").action(async (opts: { name: string }) => {
    const { token, apiUrl } = getOpts(board);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/agent/kanban/boards`, token, body: { name: opts.name } }));
  });
  board.command("update").requiredOption("--board-id <id>", "Board ID").requiredOption("--name <name>", "New name").option("--auto-archive-days <n>", "Auto-archive days (0=off)").action(async (opts: { boardId: string; name: string; autoArchiveDays?: string }) => {
    const { token, apiUrl } = getOpts(board);
    const body: Record<string, unknown> = { name: opts.name };
    if (opts.autoArchiveDays != null) body.autoArchiveDays = parseInt(opts.autoArchiveDays);
    output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/agent/kanban/boards/${opts.boardId}`, token, body }));
  });
  board.command("archive").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    const { token, apiUrl } = getOpts(board);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/agent/kanban/boards/${opts.boardId}/archive`, token }));
  });

  // Card commands
  const card = kanban.command("card").description("Card management");
  card.command("list").action(async () => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/agent/kanban/cards`, token }));
  });
  card.command("create").requiredOption("--title <title>", "Card title").option("--board-id <id>", "Board ID").option("--column-name <name>", "Column name").option("--description <desc>", "Description").action(async (opts: { title: string; boardId?: string; columnName?: string; description?: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/agent/kanban/cards`, token, body: opts }));
  });
  card.command("update").requiredOption("--card-id <id>", "Card ID").option("--title <text>", "New title").option("--description <text>", "New description").option("--column-id <id>", "Move to column").action(async (opts: { cardId: string; title?: string; description?: string; columnId?: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/agent/kanban/cards/${opts.cardId}`, token, body: { title: opts.title, description: opts.description, columnId: opts.columnId } }));
  });
  card.command("complete").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/agent/kanban/cards/${opts.cardId}/complete`, token }));
  });
  card.command("archive").requiredOption("--card-id <id>", "Card ID").action(async (opts: { cardId: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/agent/kanban/cards/${opts.cardId}/archive`, token }));
  });
  card.command("add-commit").requiredOption("--card-id <id>", "Card ID").requiredOption("--sha <sha>", "Commit SHA").requiredOption("--message <msg>", "Commit message").option("--url <url>", "Commit URL").action(async (opts: { cardId: string; sha: string; message: string; url?: string }) => {
    const { token, apiUrl } = getOpts(card);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/agent/kanban/cards/${opts.cardId}/commits`, token, body: { sha: opts.sha, message: opts.message, url: opts.url } }));
  });

  // Label commands
  const label = kanban.command("label").description("Label management");
  label.command("list").requiredOption("--board-id <id>", "Board ID").action(async (opts: { boardId: string }) => {
    const { token, apiUrl } = getOpts(label);
    output(await apiCall({ method: "GET", url: `${apiUrl}/api/agent/kanban/boards/${opts.boardId}/labels`, token }));
  });
  label.command("create").requiredOption("--board-id <id>", "Board ID").requiredOption("--name <name>", "Label name").requiredOption("--color <color>", "Color hex").action(async (opts: { boardId: string; name: string; color: string }) => {
    const { token, apiUrl } = getOpts(label);
    output(await apiCall({ method: "POST", url: `${apiUrl}/api/agent/kanban/boards/${opts.boardId}/labels`, token, body: { name: opts.name, color: opts.color } }));
  });
}
