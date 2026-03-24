#!/usr/bin/env node
import { Command } from "commander";
import { registerMessageCommands } from "./commands/message.js";
import { registerFileCommands } from "./commands/file.js";
import { registerNoteCommands } from "./commands/note.js";
import { registerMemoryCommands } from "./commands/memory.js";
import { registerKanbanCommands } from "./commands/kanban.js";

const program = new Command();

program
  .name("arinova")
  .description("Arinova Chat CLI — manage messages, notes, kanban, memory, and more")
  .version("0.0.1")
  .requiredOption("--token <botToken>", "Bot token (ari_...)")
  .option("--api-url <url>", "API endpoint (default: https://api.chat.arinova.ai)");

registerMessageCommands(program);
registerFileCommands(program);
registerNoteCommands(program);
registerMemoryCommands(program);
registerKanbanCommands(program);

program.parseAsync().then(() => {
  // Force exit after async commands complete — Node's fetch keep-alive prevents natural exit
  setTimeout(() => process.exit(0), 100);
});
