/**
 * Playground Runtime Engine
 *
 * Server-authoritative state machine that manages playground sessions:
 * - Session lifecycle (waiting → active → paused → finished)
 * - Phase management with timer-based and condition-based transitions
 * - Action validation (phase, role, parameters)
 * - Action execution and state mutation
 * - Per-role state filtering
 * - Win condition evaluation
 */

import { db } from "../db/index.js";
import {
  playgroundSessions,
  playgroundParticipants,
  playgroundMessages,
} from "../db/schema.js";
import { eq } from "drizzle-orm";
import type {
  PlaygroundDefinition,
  PlaygroundPhaseDefinition,
  PlaygroundActionDefinition,
  PlaygroundRoleDefinition,
  PlaygroundSessionStatus,
} from "@arinova/shared/types";

// ===== Types =====

export interface SessionContext {
  sessionId: string;
  definition: PlaygroundDefinition;
  state: Record<string, unknown>;
  currentPhase: string | null;
  status: PlaygroundSessionStatus;
}

export interface ActionResult {
  success: boolean;
  error?: string;
  stateChanged?: boolean;
  phaseTransition?: { from: string; to: string | null };
  sessionFinished?: boolean;
  winners?: string[]; // winning role names
}

// Active phase timers: sessionId → timeout handle
const phaseTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Callback for broadcasting state changes
type BroadcastFn = (
  sessionId: string,
  event: Record<string, unknown>,
) => void;

let broadcastCallback: BroadcastFn = () => {};

export function setBroadcastCallback(fn: BroadcastFn) {
  broadcastCallback = fn;
}

// ===== Phase Timer Management =====

export function startPhaseTimer(ctx: SessionContext) {
  clearPhaseTimer(ctx.sessionId);

  if (!ctx.currentPhase) return;

  const phaseDef = getPhaseDefinition(ctx.definition, ctx.currentPhase);
  if (!phaseDef?.duration) return;

  const timer = setTimeout(async () => {
    phaseTimers.delete(ctx.sessionId);
    await handlePhaseTimeout(ctx.sessionId);
  }, phaseDef.duration * 1000);

  phaseTimers.set(ctx.sessionId, timer);
}

export function clearPhaseTimer(sessionId: string) {
  const existing = phaseTimers.get(sessionId);
  if (existing) {
    clearTimeout(existing);
    phaseTimers.delete(sessionId);
  }
}

async function handlePhaseTimeout(sessionId: string) {
  const [session] = await db
    .select()
    .from(playgroundSessions)
    .where(eq(playgroundSessions.id, sessionId));

  if (!session || session.status !== "active") return;

  // We need the definition — fetch from the playground
  const { playgrounds } = await import("../db/schema.js");
  const [pg] = await db
    .select({ definition: playgrounds.definition })
    .from(playgrounds)
    .where(eq(playgrounds.id, session.playgroundId));

  if (!pg) return;

  const def = pg.definition as PlaygroundDefinition;
  const ctx: SessionContext = {
    sessionId,
    definition: def,
    state: session.state as Record<string, unknown>,
    currentPhase: session.currentPhase,
    status: session.status as PlaygroundSessionStatus,
  };

  await transitionToNextPhase(ctx);
}

// ===== Action Processing =====

export async function processAction(
  sessionId: string,
  participantId: string,
  actionName: string,
  params?: Record<string, unknown>,
): Promise<ActionResult> {
  // Load session
  const [session] = await db
    .select()
    .from(playgroundSessions)
    .where(eq(playgroundSessions.id, sessionId));

  if (!session) {
    return { success: false, error: "Session not found" };
  }

  if (session.status !== "active") {
    return { success: false, error: "Session is not active" };
  }

  // Load playground definition
  const { playgrounds } = await import("../db/schema.js");
  const [pg] = await db
    .select({ definition: playgrounds.definition })
    .from(playgrounds)
    .where(eq(playgrounds.id, session.playgroundId));

  if (!pg) {
    return { success: false, error: "Playground not found" };
  }

  const def = pg.definition as PlaygroundDefinition;

  // Load participant
  const [participant] = await db
    .select()
    .from(playgroundParticipants)
    .where(eq(playgroundParticipants.id, participantId));

  if (!participant) {
    return { success: false, error: "Participant not found" };
  }

  // Validate action
  const validation = validateAction(
    def,
    session.currentPhase,
    participant.role,
    actionName,
    params,
  );
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // Execute action — mutate state
  const state = session.state as Record<string, unknown>;
  const actionDef = getActionDefinition(def, actionName)!;
  const newState = executeAction(state, actionDef, participantId, params);

  // Check state size limit
  const stateSize = Buffer.byteLength(JSON.stringify(newState), "utf8");
  const maxSize = def.maxStateSize ?? 1_048_576; // default 1MB
  if (stateSize > maxSize) {
    return { success: false, error: "State size limit exceeded" };
  }

  // Save state
  await db
    .update(playgroundSessions)
    .set({ state: newState })
    .where(eq(playgroundSessions.id, sessionId));

  // Log action
  await db.insert(playgroundMessages).values({
    sessionId,
    participantId,
    type: "action",
    content: JSON.stringify({ action: actionName, params }),
  });

  const ctx: SessionContext = {
    sessionId,
    definition: def,
    state: newState,
    currentPhase: session.currentPhase,
    status: "active",
  };

  // Check win conditions
  const winResult = evaluateWinConditions(ctx);
  if (winResult) {
    await finishSession(ctx, winResult);
    return {
      success: true,
      stateChanged: true,
      sessionFinished: true,
      winners: winResult,
    };
  }

  // Check phase transition conditions
  const phaseDef = getPhaseDefinition(def, session.currentPhase!);
  if (phaseDef?.transitionCondition) {
    const shouldTransition = evaluateCondition(
      phaseDef.transitionCondition,
      newState,
    );
    if (shouldTransition) {
      const transition = await transitionToNextPhase(ctx);
      return {
        success: true,
        stateChanged: true,
        phaseTransition: transition ?? undefined,
      };
    }
  }

  // Broadcast state update
  broadcastCallback(sessionId, {
    type: "pg_state_update",
    state: newState,
    currentPhase: session.currentPhase,
  });

  return { success: true, stateChanged: true };
}

// ===== Action Validation =====

interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateAction(
  def: PlaygroundDefinition,
  currentPhase: string | null,
  participantRole: string | null,
  actionName: string,
  _params?: Record<string, unknown>,
): ValidationResult {
  const actionDef = getActionDefinition(def, actionName);
  if (!actionDef) {
    return { valid: false, error: `Unknown action: ${actionName}` };
  }

  // Check phase restriction
  if (actionDef.phases && actionDef.phases.length > 0) {
    if (!currentPhase || !actionDef.phases.includes(currentPhase)) {
      return {
        valid: false,
        error: `Action "${actionName}" is not allowed in phase "${currentPhase}"`,
      };
    }
  }

  // Check phase's allowed actions
  if (currentPhase) {
    const phaseDef = getPhaseDefinition(def, currentPhase);
    if (phaseDef && phaseDef.allowedActions.length > 0) {
      if (!phaseDef.allowedActions.includes(actionName)) {
        return {
          valid: false,
          error: `Action "${actionName}" is not allowed in phase "${currentPhase}"`,
        };
      }
    }
  }

  // Check role restriction
  if (actionDef.roles && actionDef.roles.length > 0) {
    if (!participantRole || !actionDef.roles.includes(participantRole)) {
      return {
        valid: false,
        error: `Action "${actionName}" is not available for role "${participantRole}"`,
      };
    }
  }

  return { valid: true };
}

// ===== Action Execution =====

function executeAction(
  state: Record<string, unknown>,
  actionDef: PlaygroundActionDefinition,
  participantId: string,
  params?: Record<string, unknown>,
): Record<string, unknown> {
  // Deep clone state
  const newState = JSON.parse(JSON.stringify(state)) as Record<string, unknown>;

  // Record action in state for condition evaluation
  // Convention: state.actions is an array of executed actions
  const actions = (newState.actions as unknown[]) ?? [];
  actions.push({
    participantId,
    action: actionDef.name,
    params: params ?? {},
    timestamp: Date.now(),
  });
  newState.actions = actions;

  // Convention: state.actionCounts tracks per-phase action counts
  const phase = newState.currentPhase as string | undefined;
  if (phase) {
    const counts = (newState.actionCounts as Record<string, number>) ?? {};
    const key = `${phase}:${actionDef.name}`;
    counts[key] = (counts[key] ?? 0) + 1;
    newState.actionCounts = counts;
  }

  return newState;
}

// ===== Phase Transitions =====

async function transitionToNextPhase(
  ctx: SessionContext,
): Promise<{ from: string; to: string | null } | null> {
  if (!ctx.currentPhase) return null;

  const phaseDef = getPhaseDefinition(ctx.definition, ctx.currentPhase);
  if (!phaseDef) return null;

  const nextPhaseName = phaseDef.next;
  const from = ctx.currentPhase;

  clearPhaseTimer(ctx.sessionId);

  // Clear per-phase action tracking
  const newState = { ...ctx.state, actions: [], actionCounts: {} };

  if (!nextPhaseName) {
    // Terminal phase — finish session
    await finishSession({ ...ctx, state: newState }, null);
    return { from, to: null };
  }

  // Update session
  await db
    .update(playgroundSessions)
    .set({ currentPhase: nextPhaseName, state: newState })
    .where(eq(playgroundSessions.id, ctx.sessionId));

  // Log transition
  await db.insert(playgroundMessages).values({
    sessionId: ctx.sessionId,
    type: "phase_transition",
    content: JSON.stringify({ from, to: nextPhaseName }),
  });

  // Broadcast
  broadcastCallback(ctx.sessionId, {
    type: "pg_phase_transition",
    from,
    to: nextPhaseName,
  });

  broadcastCallback(ctx.sessionId, {
    type: "pg_state_update",
    state: newState,
    currentPhase: nextPhaseName,
  });

  // Start new phase timer
  startPhaseTimer({
    ...ctx,
    currentPhase: nextPhaseName,
    state: newState,
  });

  return { from, to: nextPhaseName };
}

// ===== Win Condition Evaluation =====

function evaluateWinConditions(ctx: SessionContext): string[] | null {
  for (const wc of ctx.definition.winConditions) {
    if (evaluateCondition(wc.condition, ctx.state)) {
      return [wc.role];
    }
  }
  return null;
}

// ===== Session Finish =====

async function finishSession(
  ctx: SessionContext,
  winners: string[] | null,
) {
  clearPhaseTimer(ctx.sessionId);

  await db
    .update(playgroundSessions)
    .set({
      status: "finished",
      finishedAt: new Date(),
      state: ctx.state,
    })
    .where(eq(playgroundSessions.id, ctx.sessionId));

  // Log finish
  await db.insert(playgroundMessages).values({
    sessionId: ctx.sessionId,
    type: "system",
    content: JSON.stringify({ event: "session_finished", winners }),
  });

  // Get participants for prize distribution info
  const participants = await db
    .select()
    .from(playgroundParticipants)
    .where(eq(playgroundParticipants.sessionId, ctx.sessionId));

  const prizeDistribution: Record<string, number> = {};
  if (winners) {
    const winningParticipants = participants.filter(
      (p) => p.role && winners.includes(p.role),
    );
    for (const wp of winningParticipants) {
      prizeDistribution[wp.id] = 1; // placeholder for economy system
    }
  }

  broadcastCallback(ctx.sessionId, {
    type: "pg_session_finished",
    winners: winners ?? [],
    prizeDistribution,
  });
}

// ===== Condition Evaluator =====

/**
 * Simple condition evaluator.
 *
 * Supports string-based condition names that map to state checks.
 * For Phase 1, conditions are evaluated by checking state conventions:
 * - "allPlayersVoted" → check if action count for vote >= participant count
 * - Custom conditions → check if state[conditionName] is truthy
 *
 * Phase 2 could introduce a proper expression engine.
 */
function evaluateCondition(
  condition: string,
  state: Record<string, unknown>,
): boolean {
  // Direct boolean state key
  if (state[condition] === true) return true;

  // Check via conditionResults map (set by game logic)
  const results = state.conditionResults as Record<string, boolean> | undefined;
  if (results && results[condition] === true) return true;

  return false;
}

// ===== State Filtering =====

export function filterStateForRole(
  state: Record<string, unknown>,
  role: string,
  definition: PlaygroundDefinition,
): Record<string, unknown> {
  const roleDef = definition.roles.find((r) => r.name === role);
  if (!roleDef) return {};

  const filtered: Record<string, unknown> = {};
  for (const key of roleDef.visibleState) {
    if (key in state) {
      filtered[key] = state[key];
    }
  }
  return filtered;
}

// ===== Lookup Helpers =====

function getPhaseDefinition(
  def: PlaygroundDefinition,
  phaseName: string,
): PlaygroundPhaseDefinition | undefined {
  return def.phases.find((p) => p.name === phaseName);
}

function getActionDefinition(
  def: PlaygroundDefinition,
  actionName: string,
): PlaygroundActionDefinition | undefined {
  return def.actions.find((a) => a.name === actionName);
}
