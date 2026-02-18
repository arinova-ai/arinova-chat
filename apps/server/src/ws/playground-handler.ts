/**
 * Playground WebSocket Handler — /ws/playground
 *
 * Dedicated WebSocket namespace for playground real-time interactions.
 * Supports: auth, action submission, chat, control mode switching.
 * Broadcasts: state updates, phase transitions, participant events, session results.
 */

import type { FastifyInstance } from "fastify";
import type { WebSocket, RawData } from "ws";
import { randomUUID } from "node:crypto";
import { auth } from "../auth.js";
import { db } from "../db/index.js";
import { redis } from "../db/redis.js";
import Redis from "ioredis";
import { env } from "../env.js";
import {
  playgroundSessions,
  playgroundParticipants,
  playgroundMessages,
  playgrounds,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { playgroundWSClientEventSchema } from "@arinova/shared/schemas";
import type {
  PlaygroundWSServerEvent,
  PlaygroundDefinition,
} from "@arinova/shared/types";
import {
  processAction,
  filterStateForRole,
  setBroadcastCallback,
  startPhaseTimer,
  clearPhaseTimer,
} from "../lib/playground-runtime.js";

// ===== Redis Pub/Sub for cross-instance broadcast =====

const INSTANCE_ID = randomUUID();
const PG_CHANNEL = "pg:broadcast";

// Separate Redis connection for subscribing (ioredis requirement)
const redisSub = new Redis(env.REDIS_URL);

interface PgPubSubMessage {
  instanceId: string;
  sessionId: string;
  event: PlaygroundWSServerEvent;
  excludeParticipantId?: string;
}

function publishToRedis(
  sessionId: string,
  event: PlaygroundWSServerEvent,
  excludeParticipantId?: string,
) {
  const msg: PgPubSubMessage = {
    instanceId: INSTANCE_ID,
    sessionId,
    event,
    excludeParticipantId,
  };
  redis.publish(PG_CHANNEL, JSON.stringify(msg));
}

// Subscribe and relay messages from other instances
redisSub.subscribe(PG_CHANNEL);
redisSub.on("message", (_channel: string, message: string) => {
  try {
    const msg = JSON.parse(message) as PgPubSubMessage;
    // Skip messages from this instance (already broadcast locally)
    if (msg.instanceId === INSTANCE_ID) return;

    if (msg.event.type === "pg_state_update") {
      // Each instance does its own role-filtered broadcast from DB
      broadcastStateUpdate(msg.sessionId);
    } else {
      broadcastToSession(msg.sessionId, msg.event, msg.excludeParticipantId);
    }
  } catch {
    // Ignore malformed messages
  }
});

// Active connections: sessionId → Map<participantId, WebSocket>
const sessionConnections = new Map<string, Map<string, WebSocket>>();

// Reverse lookup: WebSocket → { sessionId, participantId, userId }
const wsMetadata = new WeakMap<
  WebSocket,
  { sessionId: string; participantId: string; userId: string }
>();

function send(ws: WebSocket, event: PlaygroundWSServerEvent) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function broadcastToSession(
  sessionId: string,
  event: PlaygroundWSServerEvent,
  excludeParticipantId?: string,
) {
  const connections = sessionConnections.get(sessionId);
  if (!connections) return;
  for (const [pid, ws] of connections) {
    if (pid !== excludeParticipantId) {
      send(ws, event);
    }
  }
}

/**
 * Broadcast with per-role state filtering.
 * Each participant only sees state keys allowed by their role.
 */
async function broadcastStateUpdate(sessionId: string) {
  const connections = sessionConnections.get(sessionId);
  if (!connections || connections.size === 0) return;

  const [session] = await db
    .select()
    .from(playgroundSessions)
    .where(eq(playgroundSessions.id, sessionId));
  if (!session) return;

  const [pg] = await db
    .select({ definition: playgrounds.definition })
    .from(playgrounds)
    .where(eq(playgrounds.id, session.playgroundId));
  if (!pg) return;

  const def = pg.definition as PlaygroundDefinition;
  const state = session.state as Record<string, unknown>;

  // Get all participants for role info
  const participants = await db
    .select()
    .from(playgroundParticipants)
    .where(eq(playgroundParticipants.sessionId, sessionId));

  const participantMap = new Map(participants.map((p) => [p.id, p]));

  for (const [pid, ws] of connections) {
    const participant = participantMap.get(pid);
    let filteredState = state;

    if (participant?.role && session.status === "active") {
      filteredState = filterStateForRole(state, participant.role, def);
    }

    send(ws, {
      type: "pg_state_update",
      state: filteredState,
      currentPhase: session.currentPhase,
    });
  }
}

// Register broadcast callback with runtime engine
setBroadcastCallback(async (sessionId: string, event: Record<string, unknown>) => {
  if (event.type === "pg_state_update") {
    // Role-filtered broadcast — each instance reads DB independently
    await broadcastStateUpdate(sessionId);
    // Notify other instances to do the same
    publishToRedis(sessionId, { type: "pg_state_update" } as PlaygroundWSServerEvent);
  } else {
    // Other events broadcast as-is to local + remote
    broadcastToSession(sessionId, event as PlaygroundWSServerEvent);
    publishToRedis(sessionId, event as PlaygroundWSServerEvent);
  }
});

export async function playgroundWsRoutes(app: FastifyInstance) {
  app.get("/ws/playground", { websocket: true }, async (socket, request) => {
    // Auth from cookie (same as user WS)
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value) {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.append(key, value);
        }
      }
    }

    const session = await auth.api.getSession({ headers });
    if (!session) {
      socket.close(4401, "Unauthorized");
      return;
    }

    const userId = session.user.id;
    let authenticated = false;

    socket.on("message", async (data: RawData) => {
      try {
        const raw = JSON.parse(data.toString());
        const event = playgroundWSClientEventSchema.parse(raw);

        if (event.type === "ping") {
          send(socket, { type: "pong" });
          return;
        }

        // ===== Auth =====
        if (event.type === "pg_auth") {
          // Verify user is a participant in this session
          const [participant] = await db
            .select()
            .from(playgroundParticipants)
            .where(
              and(
                eq(playgroundParticipants.sessionId, event.sessionId),
                eq(playgroundParticipants.userId, userId),
              )
            );

          if (!participant) {
            send(socket, {
              type: "pg_auth_error",
              error: "Not a participant in this session",
            });
            return;
          }

          // Check session exists
          const [pgSession] = await db
            .select()
            .from(playgroundSessions)
            .where(eq(playgroundSessions.id, event.sessionId));

          if (!pgSession) {
            send(socket, { type: "pg_auth_error", error: "Session not found" });
            return;
          }

          // Close existing connection for this participant if any
          const existingConns = sessionConnections.get(event.sessionId);
          if (existingConns?.has(participant.id)) {
            const oldWs = existingConns.get(participant.id)!;
            if (oldWs !== socket) {
              oldWs.close(4409, "Replaced by new connection");
            }
          }

          // Register connection
          authenticated = true;
          wsMetadata.set(socket, {
            sessionId: event.sessionId,
            participantId: participant.id,
            userId,
          });

          if (!sessionConnections.has(event.sessionId)) {
            sessionConnections.set(event.sessionId, new Map());
          }
          sessionConnections.get(event.sessionId)!.set(participant.id, socket);

          // Mark connected
          await db
            .update(playgroundParticipants)
            .set({ isConnected: true })
            .where(eq(playgroundParticipants.id, participant.id));

          send(socket, {
            type: "pg_auth_ok",
            sessionId: event.sessionId,
            participantId: participant.id,
          });

          // Send current state (role-filtered)
          const [pg] = await db
            .select({ definition: playgrounds.definition })
            .from(playgrounds)
            .where(eq(playgrounds.id, pgSession.playgroundId));

          if (pg && participant.role && pgSession.status === "active") {
            const def = pg.definition as PlaygroundDefinition;
            const filteredState = filterStateForRole(
              pgSession.state as Record<string, unknown>,
              participant.role,
              def,
            );
            send(socket, {
              type: "pg_state_update",
              state: filteredState,
              currentPhase: pgSession.currentPhase,
            });
          } else {
            send(socket, {
              type: "pg_state_update",
              state: pgSession.state as Record<string, unknown>,
              currentPhase: pgSession.currentPhase,
            });
          }

          // Notify others
          broadcastToSession(
            event.sessionId,
            {
              type: "pg_participant_joined",
              participant: {
                ...participant,
                isConnected: true,
              },
            } as unknown as PlaygroundWSServerEvent,
            participant.id,
          );

          app.log.info(
            `Playground WS connected: session=${event.sessionId} user=${userId} participant=${participant.id}`,
          );
          return;
        }

        // All other events require authentication
        if (!authenticated) {
          send(socket, { type: "pg_error", error: "Not authenticated. Send pg_auth first." });
          return;
        }

        const meta = wsMetadata.get(socket)!;

        // ===== Action =====
        if (event.type === "pg_action") {
          const result = await processAction(
            meta.sessionId,
            meta.participantId,
            event.actionName,
            event.params,
          );

          send(socket, {
            type: "pg_action_result",
            success: result.success,
            error: result.error,
          });

          // State broadcasting is handled by the runtime engine via broadcastCallback
          return;
        }

        // ===== Chat =====
        if (event.type === "pg_chat") {
          // Save message
          await db.insert(playgroundMessages).values({
            sessionId: meta.sessionId,
            participantId: meta.participantId,
            type: "chat",
            content: event.content,
          });

          // Broadcast to all (including sender for confirmation)
          broadcastToSession(meta.sessionId, {
            type: "pg_chat",
            participantId: meta.participantId,
            content: event.content,
          });
          return;
        }

        // ===== Control Mode =====
        if (event.type === "pg_control_mode") {
          await db
            .update(playgroundParticipants)
            .set({ controlMode: event.mode })
            .where(eq(playgroundParticipants.id, meta.participantId));
          return;
        }
      } catch (err) {
        app.log.error(err, "Playground WS message error");
        send(socket, { type: "pg_error", error: "Invalid message format" });
      }
    });

    socket.on("close", async () => {
      const meta = wsMetadata.get(socket);
      if (!meta) return;

      // Remove from session connections
      const connections = sessionConnections.get(meta.sessionId);
      if (connections) {
        connections.delete(meta.participantId);
        if (connections.size === 0) {
          sessionConnections.delete(meta.sessionId);
        }
      }

      // Mark disconnected
      await db
        .update(playgroundParticipants)
        .set({ isConnected: false })
        .where(eq(playgroundParticipants.id, meta.participantId));

      // Notify others
      broadcastToSession(meta.sessionId, {
        type: "pg_participant_left",
        participantId: meta.participantId,
      });

      app.log.info(
        `Playground WS disconnected: session=${meta.sessionId} participant=${meta.participantId}`,
      );
    });
  });
}
