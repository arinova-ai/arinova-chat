#!/usr/bin/env node
import { Command } from "commander";
import { setJsonMode } from "./output.js";
import { getStagingEndpoint } from "./config.js";
import { registerMessageCommands } from "./commands/message.js";
import { registerFileCommands } from "./commands/file.js";
import { registerNoteCommands } from "./commands/note.js";
import { registerMemoryCommands } from "./commands/memory.js";
import { registerKanbanCommands } from "./commands/kanban.js";
import { registerAuth } from "./commands/auth.js";
import { registerSticker } from "./commands/sticker.js";
import { registerExpert } from "./commands/expert.js";
import { registerTheme } from "./commands/theme.js";
import { registerCommunity } from "./commands/community.js";
import { registerSpace } from "./commands/space.js";
import { registerStats } from "./commands/stats.js";
import { registerList } from "./commands/list.js";
import { registerApp } from "./commands/app.js";
import { registerSetupOpenclaw } from "./commands/setup-openclaw.js";
import { registerConversation } from "./commands/conversation.js";

const program = new Command();

program
  .name("arinova")
  .description("Arinova CLI — manage messages, notes, kanban, memory, creator tools, and more")
  .version("0.0.9")
  .option("--token <botToken>", "Bot/API token (ari_...)")
  .option("--api-url <url>", "API endpoint (default: https://api.chat.arinova.ai)")
  .option("--staging", "Use staging environment")
  .option("--json", "Output in JSON format")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    if (opts.json) {
      setJsonMode(true);
    }
    if (opts.staging) {
      // Override api-url with staging endpoint if --staging is used
      if (!opts.apiUrl) {
        thisCommand.setOptionValue("apiUrl", getStagingEndpoint());
      }
    }
  });

// Existing agent commands (bot token based)
registerMessageCommands(program);
registerFileCommands(program);
registerNoteCommands(program);
registerMemoryCommands(program);
registerKanbanCommands(program);
registerConversation(program);

// Creator commands (config-based auth)
registerAuth(program);
registerSticker(program);
registerExpert(program);
registerTheme(program);
registerCommunity(program);
registerSpace(program);
registerStats(program);
registerList(program);
registerApp(program);
registerSetupOpenclaw(program);

program.parseAsync().then(() => {
  // Force exit after async commands complete — Node's fetch keep-alive prevents natural exit
  setTimeout(() => process.exit(0), 100);
});
