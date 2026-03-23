import type { Command } from "commander";
import { getOpts, apiCall, output } from "../api.js";

export function registerNoteCommands(program: Command): void {
  const note = program.command("note").description("Note commands");

  note.command("list")
    .option("--notebook-id <id>", "Filter by notebook")
    .action(async (opts: { notebookId?: string }) => {
      const { token, apiUrl } = getOpts(note);
      const qs = opts.notebookId ? `?notebookId=${opts.notebookId}` : "";
      output(await apiCall({ method: "GET", url: `${apiUrl}/api/agent/notes${qs}`, token }));
    });

  note.command("create")
    .requiredOption("--notebook-id <id>", "Notebook ID")
    .requiredOption("--title <title>", "Note title")
    .option("--content <text>", "Note content")
    .option("--tags <tags...>", "Tags")
    .action(async (opts: { notebookId: string; title: string; content?: string; tags?: string[] }) => {
      const { token, apiUrl } = getOpts(note);
      output(await apiCall({ method: "POST", url: `${apiUrl}/api/agent/notes`, token, body: opts }));
    });

  note.command("update")
    .requiredOption("--note-id <id>", "Note ID")
    .option("--title <text>", "New title")
    .option("--content <text>", "New content")
    .action(async (opts: { noteId: string; title?: string; content?: string }) => {
      const { token, apiUrl } = getOpts(note);
      output(await apiCall({ method: "PATCH", url: `${apiUrl}/api/agent/notes/${opts.noteId}`, token, body: { title: opts.title, content: opts.content } }));
    });

  note.command("delete")
    .requiredOption("--note-id <id>", "Note ID")
    .action(async (opts: { noteId: string }) => {
      const { token, apiUrl } = getOpts(note);
      output(await apiCall({ method: "DELETE", url: `${apiUrl}/api/agent/notes/${opts.noteId}`, token }));
    });
}
