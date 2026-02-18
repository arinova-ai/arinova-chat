/**
 * Playground Creation Specification
 *
 * This module exports the creation spec document as a string.
 * The spec is included in the system prompt when a system agent
 * is tasked with generating a PlaygroundDefinition.
 */

export const PLAYGROUND_CREATION_SPEC = `
# Playground Creation Specification

## Overview

A Playground is a structured, interactive experience hosted by AI agents on Arinova Chat.
When a user describes what they want, you (the system agent) generate a \`PlaygroundDefinition\` JSON object that defines the complete rules, roles, phases, and actions.

## Output Format

You MUST return a single JSON object that conforms to the PlaygroundDefinition schema.
Wrap it in a \`\`\`json code block.

## PlaygroundDefinition Schema

\`\`\`typescript
interface PlaygroundDefinition {
  metadata: {
    name: string;           // 1-100 chars
    description: string;    // 1-1000 chars
    category: "game" | "strategy" | "social" | "puzzle" | "roleplay" | "other";
    minPlayers: number;     // >= 1
    maxPlayers: number;     // >= minPlayers
    tags?: string[];        // max 10 tags, each 1-50 chars
    thumbnailDescription?: string; // max 200 chars, for AI image generation
  };

  roles: RoleDefinition[];   // at least 1
  phases: PhaseDefinition[]; // at least 1
  actions: ActionDefinition[]; // at least 1
  winConditions: WinCondition[]; // at least 1

  economy: {
    currency: "free" | "play" | "arinova";
    entryFee: number;       // >= 0
    prizeDistribution: "winner-takes-all" | Record<string, number>; // percentage
    betting?: {
      enabled: boolean;
      minBet: number;
      maxBet: number;       // >= minBet
    };
  };

  initialState: Record<string, unknown>; // starting game state
  maxStateSize?: number;    // bytes, default 1MB
}
\`\`\`

## Key Concepts

### Roles
Each role defines what a participant can see and do:
- \`visibleState\`: array of state keys this role can see
- \`availableActions\`: array of action names this role can use
- \`systemPrompt\`: instructions for the AI agent playing this role
- \`minCount\`/\`maxCount\`: constraints on how many players can have this role

### Phases
Phases define the flow of the game:
- Phases execute in order, with \`next\` pointing to the next phase name
- Set \`next: null\` for terminal phases (game end)
- \`duration\`: seconds before auto-transition (optional)
- \`transitionCondition\`: state key name that, when true, triggers transition
- \`allowedActions\`: which actions are available in this phase

### Actions
Actions define what participants can do:
- \`targetType\`: "player" (target a specific player), "role" (target a role), "global" (no target)
- \`phases\`: restrict to specific phases
- \`roles\`: restrict to specific roles
- \`params\`: JSON schema for additional parameters

### Win Conditions
Each win condition specifies:
- \`role\`: the winning role name
- \`condition\`: a state key name — when state.conditionResults[condition] is true, this role wins
- \`description\`: human-readable explanation

### State Conventions
- \`state.conditionResults\`: a Record<string, boolean> that maps condition names to their current status
- \`state.actions\`: array of executed actions (managed by the engine)
- \`state.actionCounts\`: per-phase action counts (managed by the engine)
- Put all game-specific state (alive players, scores, etc.) as top-level keys in initialState
- Include all condition result names in initialState.conditionResults as false

## Guidelines

1. **Be complete**: Include all roles, phases, and actions needed for the full game loop.
2. **Be explicit**: Don't leave rules ambiguous. Every action should have clear phase and role restrictions.
3. **Design for AI agents**: Write clear systemPrompts that tell the AI what to do in each situation.
4. **Balance information**: Use visibleState carefully — information asymmetry creates interesting gameplay.
5. **Default to free economy**: Unless the user specifically asks for stakes, use currency: "free".
6. **Keep state small**: Only include necessary data in the state. The engine has a 1MB limit.
7. **Use Chinese**: If the user speaks Chinese, write names and descriptions in Chinese.

## Example

See the built-in "狼人殺" (Werewolf) template for a complete reference implementation.
`;
