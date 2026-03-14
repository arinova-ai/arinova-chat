export type CommandCategory = "session" | "display" | "agent";

export interface PlatformCommand {
  id: string;
  name: string;
  description: string;
  category: CommandCategory;
  args?: string;
  handler: "local" | "store" | "forward";
}

export const PLATFORM_COMMANDS: PlatformCommand[] = [
  // Session
  { id: "help", name: "Help", description: "Show all available commands", category: "session", handler: "local" },
  { id: "commands", name: "Commands", description: "List all slash commands", category: "session", handler: "local" },
  { id: "new", name: "New Chat", description: "Start a new conversation", category: "session", handler: "store" },
  { id: "stop", name: "Stop", description: "Cancel current streaming response", category: "session", handler: "store" },
  { id: "status", name: "Status", description: "Show conversation and agent status", category: "session", handler: "store" },
{ id: "whoami", name: "Who Am I", description: "Show your profile info", category: "session", handler: "store" },

  // Display
  { id: "tts", name: "Text-to-Speech", description: "Toggle text-to-speech", category: "display", args: "[on|off]", handler: "local" },
  { id: "compact", name: "Compact", description: "Compress conversation context", category: "display", handler: "forward" },

  // Agent hints (forwarded as messages)
  { id: "model", name: "Model", description: "Request model change", category: "agent", args: "[model_name]", handler: "forward" },
  { id: "think", name: "Think", description: "Set reasoning depth", category: "agent", args: "[off|low|medium|high]", handler: "forward" },
  { id: "reasoning", name: "Reasoning", description: "Toggle reasoning display", category: "agent", args: "[on|off|stream]", handler: "forward" },
  { id: "verbose", name: "Verbose", description: "Toggle verbose output", category: "agent", args: "[on|off]", handler: "forward" },
  { id: "skill", name: "Skill", description: "Run a skill by name", category: "agent", args: "<name> [input]", handler: "forward" },
  { id: "context", name: "Context", description: "Explain how context is built", category: "agent", handler: "forward" },
  { id: "approve", name: "Approve", description: "Approve or deny exec requests", category: "agent", handler: "forward" },
  { id: "config", name: "Config", description: "Show or set config values", category: "agent", args: "[show|get|set|unset] [path] [value]", handler: "forward" },
  { id: "debug", name: "Debug", description: "Set runtime debug overrides", category: "agent", args: "[show|reset|set|unset] [path] [value]", handler: "forward" },
  { id: "activation", name: "Activation", description: "Set group activation mode", category: "agent", args: "[mention|always]", handler: "forward" },
  { id: "send", name: "Send", description: "Set send policy", category: "agent", args: "[on|off|inherit]", handler: "forward" },
  { id: "models", name: "Models", description: "List available model providers", category: "agent", handler: "forward" },
  { id: "usage", name: "Usage", description: "Show usage and cost summary", category: "agent", args: "[off|tokens|full|cost]", handler: "forward" },
  { id: "queue", name: "Queue", description: "Adjust queue settings", category: "agent", handler: "forward" },
  { id: "exec", name: "Exec", description: "Set exec defaults for session", category: "agent", handler: "forward" },
  { id: "elevated", name: "Elevated", description: "Toggle elevated mode", category: "agent", args: "[on|off|ask|full]", handler: "forward" },
  { id: "restart", name: "Restart", description: "Restart the agent runtime", category: "agent", handler: "forward" },
  { id: "subagents", name: "Subagents", description: "List or manage subagent runs", category: "agent", handler: "forward" },
  { id: "kill", name: "Kill", description: "Kill a running subagent", category: "agent", args: "[target]", handler: "forward" },
  { id: "steer", name: "Steer", description: "Send guidance to a running subagent", category: "agent", args: "<target> <message>", handler: "forward" },
];

export const CATEGORY_LABELS: Record<CommandCategory, string> = {
  session: "SESSION",
  display: "DISPLAY",
  agent: "AGENT HINTS",
};

export const CATEGORY_ORDER: CommandCategory[] = ["session", "display", "agent"];

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
