export type CommandCategory = "session" | "display" | "navigation" | "agent";

export interface PlatformCommand {
  id: string;
  name: string;
  description: string;
  category: CommandCategory;
  args?: string;
  handler: "local" | "store" | "navigate" | "forward";
}

export const PLATFORM_COMMANDS: PlatformCommand[] = [
  // Session
  { id: "help", name: "Help", description: "Show all available commands", category: "session", handler: "local" },
  { id: "new", name: "New Chat", description: "Start a new conversation", category: "session", handler: "store" },
  { id: "clear", name: "Clear", description: "Clear conversation history", category: "session", handler: "store" },
  { id: "stop", name: "Stop", description: "Cancel current streaming response", category: "session", handler: "store" },
  { id: "status", name: "Status", description: "Show conversation and agent status", category: "session", handler: "store" },
  { id: "reset", name: "Reset", description: "Start fresh session", category: "session", handler: "store" },

  // Display
  { id: "tts", name: "Text-to-Speech", description: "Toggle text-to-speech", category: "display", args: "[on|off]", handler: "local" },
  { id: "compact", name: "Compact", description: "Compress conversation context", category: "display", handler: "forward" },

  // Navigation
  { id: "settings", name: "Settings", description: "Open settings page", category: "navigation", handler: "navigate" },
  { id: "search", name: "Search", description: "Search conversations", category: "navigation", args: "[query]", handler: "store" },
  { id: "whoami", name: "Who Am I", description: "Show your profile info", category: "navigation", handler: "store" },

  // Agent hints (forwarded as messages)
  { id: "model", name: "Model", description: "Request model change", category: "agent", args: "[model_name]", handler: "forward" },
  { id: "think", name: "Think", description: "Set reasoning depth", category: "agent", args: "[off|low|medium|high]", handler: "forward" },
  { id: "reasoning", name: "Reasoning", description: "Toggle reasoning display", category: "agent", args: "[on|off|stream]", handler: "forward" },
  { id: "verbose", name: "Verbose", description: "Toggle verbose output", category: "agent", args: "[on|off]", handler: "forward" },
];

export const CATEGORY_LABELS: Record<CommandCategory, string> = {
  session: "SESSION",
  display: "DISPLAY",
  navigation: "NAVIGATION",
  agent: "AGENT HINTS",
};

export const CATEGORY_ORDER: CommandCategory[] = ["session", "display", "navigation", "agent"];

export function filterCommands(commands: PlatformCommand[], query: string): PlatformCommand[] {
  if (!query) return commands;
  const q = query.toLowerCase();
  return commands.filter(
    (c) =>
      c.id.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
  );
}

/**
 * Build a formatted help text string showing all commands + agent skills.
 */
export function buildHelpText(agentSkills: { id: string; name: string; description: string }[]): string {
  const lines: string[] = ["**Available Commands**\n"];

  for (const category of CATEGORY_ORDER) {
    const cmds = PLATFORM_COMMANDS.filter((c) => c.category === category);
    if (cmds.length === 0) continue;
    const label = CATEGORY_LABELS[category];
    const suffix = category === "agent" ? " _(sent to agent)_" : "";
    lines.push(`**${label}**${suffix}`);
    for (const cmd of cmds) {
      const argsHint = cmd.args ? ` ${cmd.args}` : "";
      lines.push(`\`/${cmd.id}${argsHint}\` — ${cmd.description}`);
    }
    lines.push("");
  }

  if (agentSkills.length > 0) {
    lines.push("**AGENT SKILLS**");
    for (const skill of agentSkills) {
      lines.push(`\`/${skill.id}\` — ${skill.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
