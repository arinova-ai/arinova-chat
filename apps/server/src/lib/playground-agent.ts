/**
 * Playground Agent Integration
 *
 * Bridges AI agents into playground sessions:
 * - Converts playground state + available actions into agent-consumable format
 * - Routes agent tool calls → playground actions
 * - Delivers phase transitions and events as agent system messages
 * - Manages control mode switching (agent/human/copilot)
 */

import { db } from "../db/index.js";
import {
  playgrounds,
  playgroundSessions,
  playgroundParticipants,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { isAgentConnected, sendTaskToAgent } from "../ws/agent-handler.js";
import type {
  PlaygroundDefinition,
  PlaygroundRoleDefinition,
  PlaygroundActionDefinition,
  PlaygroundParticipantControlMode,
} from "@arinova/shared/types";
import { filterStateForRole } from "./playground-runtime.js";

// Active agent tasks: participantId → cancel function
const activeAgentTasks = new Map<string, { cancel: () => void }>();

/**
 * Build a system prompt for an agent participating in a playground session.
 * Includes: playground context, role info, current state, available actions.
 */
export function buildAgentSystemPrompt(
  definition: PlaygroundDefinition,
  role: PlaygroundRoleDefinition,
  state: Record<string, unknown>,
  currentPhase: string | null,
  participantId: string,
): string {
  const availableActions = getAvailableActions(definition, role.name, currentPhase);

  const lines = [
    `# Playground: ${definition.metadata.name}`,
    `${definition.metadata.description}`,
    "",
    `## Your Role: ${role.name}`,
    role.description,
    "",
    "## Role Instructions",
    role.systemPrompt,
    "",
    `## Current Phase: ${currentPhase ?? "none"}`,
    "",
    "## Current State",
    "```json",
    JSON.stringify(state, null, 2),
    "```",
    "",
    `## Your Participant ID: ${participantId}`,
    "",
  ];

  if (availableActions.length > 0) {
    lines.push("## Available Actions");
    lines.push("Reply with a JSON action object to take an action:");
    lines.push("");
    for (const action of availableActions) {
      lines.push(`### ${action.name}`);
      lines.push(action.description);
      if (action.targetType) {
        lines.push(`- Target type: ${action.targetType}`);
      }
      if (action.params) {
        lines.push(`- Parameters: ${JSON.stringify(action.params)}`);
      }
      lines.push("");
    }
    lines.push("Example response format:");
    lines.push('```json');
    lines.push('{"action": "action_name", "params": {"target": "player-id"}}');
    lines.push('```');
  } else {
    lines.push("## No actions available in the current phase.");
    lines.push("You may chat with other participants.");
  }

  return lines.join("\n");
}

/**
 * Get actions available to a specific role in the current phase.
 */
function getAvailableActions(
  definition: PlaygroundDefinition,
  roleName: string,
  currentPhase: string | null,
): PlaygroundActionDefinition[] {
  const roleDef = definition.roles.find((r) => r.name === roleName);
  if (!roleDef) return [];

  const phaseDef = currentPhase
    ? definition.phases.find((p) => p.name === currentPhase)
    : null;

  return definition.actions.filter((action) => {
    // Check role has access
    if (!roleDef.availableActions.includes(action.name)) return false;

    // Check role restriction on action
    if (action.roles && action.roles.length > 0) {
      if (!action.roles.includes(roleName)) return false;
    }

    // Check phase restriction on action
    if (action.phases && action.phases.length > 0) {
      if (!currentPhase || !action.phases.includes(currentPhase)) return false;
    }

    // Check phase's allowed actions
    if (phaseDef && phaseDef.allowedActions.length > 0) {
      if (!phaseDef.allowedActions.includes(action.name)) return false;
    }

    return true;
  });
}

/**
 * Request an agent to take an action in a playground session.
 * Sends the current state as a task and parses the agent's response as an action.
 */
export async function requestAgentAction(
  sessionId: string,
  participantId: string,
): Promise<void> {
  // Load participant
  const [participant] = await db
    .select()
    .from(playgroundParticipants)
    .where(eq(playgroundParticipants.id, participantId));

  if (!participant || !participant.agentId || !participant.role) return;
  if (participant.controlMode !== "agent") return;

  // Check agent is connected
  if (!isAgentConnected(participant.agentId)) return;

  // Load session and definition
  const [session] = await db
    .select()
    .from(playgroundSessions)
    .where(eq(playgroundSessions.id, sessionId));
  if (!session || session.status !== "active") return;

  const [pg] = await db
    .select({ definition: playgrounds.definition })
    .from(playgrounds)
    .where(eq(playgrounds.id, session.playgroundId));
  if (!pg) return;

  const def = pg.definition as PlaygroundDefinition;
  const roleDef = def.roles.find((r) => r.name === participant.role);
  if (!roleDef) return;

  // Filter state for this role
  const filteredState = filterStateForRole(
    session.state as Record<string, unknown>,
    participant.role,
    def,
  );

  // Build prompt
  const prompt = buildAgentSystemPrompt(
    def,
    roleDef,
    filteredState,
    session.currentPhase,
    participantId,
  );

  // Cancel any existing task for this participant
  const existingTask = activeAgentTasks.get(participantId);
  if (existingTask) {
    existingTask.cancel();
  }

  // Send to agent
  const taskId = `pg-${sessionId}-${participantId}-${Date.now()}`;
  const { cancel } = sendTaskToAgent({
    agentId: participant.agentId,
    taskId,
    conversationId: sessionId, // reuse field for playground session
    content: prompt,
    onChunk: () => {
      // ignore streaming chunks for playground actions
    },
    onComplete: async (content) => {
      activeAgentTasks.delete(participantId);
      await handleAgentResponse(sessionId, participantId, content);
    },
    onError: () => {
      activeAgentTasks.delete(participantId);
    },
  });

  activeAgentTasks.set(participantId, { cancel });
}

/**
 * Parse agent response and execute as playground action.
 */
async function handleAgentResponse(
  sessionId: string,
  participantId: string,
  content: string,
): Promise<void> {
  // Try to extract JSON action from response
  const action = parseAgentAction(content);
  if (!action) return;

  // Import processAction dynamically to avoid circular deps
  const { processAction } = await import("./playground-runtime.js");
  await processAction(sessionId, participantId, action.action, action.params);
}

/**
 * Parse agent response to extract an action JSON.
 * Looks for ```json blocks or raw JSON objects.
 */
function parseAgentAction(
  content: string,
): { action: string; params?: Record<string, unknown> } | null {
  // Try to find JSON in code blocks
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : content.trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed.action === "string") {
      return {
        action: parsed.action,
        params: typeof parsed.params === "object" ? parsed.params : undefined,
      };
    }
  } catch {
    // Try to find JSON object anywhere in the text
    const jsonMatch = content.match(/\{[\s\S]*?"action"\s*:\s*"[^"]+[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed.action === "string") {
          return {
            action: parsed.action,
            params: typeof parsed.params === "object" ? parsed.params : undefined,
          };
        }
      } catch {
        // give up
      }
    }
  }
  return null;
}

/**
 * Notify all agents in a session about a phase transition.
 * Triggers agent action requests for the new phase.
 */
export async function notifyAgentsPhaseTransition(
  sessionId: string,
): Promise<void> {
  const participants = await db
    .select()
    .from(playgroundParticipants)
    .where(
      and(
        eq(playgroundParticipants.sessionId, sessionId),
        eq(playgroundParticipants.controlMode, "agent"),
      )
    );

  for (const participant of participants) {
    if (participant.agentId && isAgentConnected(participant.agentId)) {
      // Small stagger to avoid all agents responding simultaneously
      setTimeout(() => {
        requestAgentAction(sessionId, participant.id);
      }, Math.random() * 1000);
    }
  }
}

/**
 * Check if a participant's control mode allows the given actor (user or agent).
 */
export function canAct(
  controlMode: PlaygroundParticipantControlMode,
  actor: "user" | "agent",
): boolean {
  if (controlMode === "human") return actor === "user";
  if (controlMode === "agent") return actor === "agent";
  // copilot: both can act
  return true;
}
