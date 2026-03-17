#!/usr/bin/env node
import { Command } from "commander";
import { setJsonMode } from "./output.js";
import { registerAuth } from "./commands/auth.js";
import { registerSticker } from "./commands/sticker.js";
import { registerAgent } from "./commands/agent.js";
import { registerTheme } from "./commands/theme.js";
import { registerCommunity } from "./commands/community.js";
import { registerSpace } from "./commands/space.js";
import { registerStats } from "./commands/stats.js";
import { registerList } from "./commands/list.js";

const program = new Command();

program
  .name("arinova-cli")
  .description("Arinova Creator Console CLI")
  .version("0.0.1")
  .option("--json", "Output as JSON")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    if (opts.json) {
      setJsonMode(true);
    }
  });

registerAuth(program);
registerSticker(program);
registerAgent(program);
registerTheme(program);
registerCommunity(program);
registerSpace(program);
registerStats(program);
registerList(program);

program.parse();
