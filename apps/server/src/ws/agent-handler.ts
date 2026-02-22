import type { FastifyInstance } from "fastify";
import type { WebSocket, RawData } from "ws";
import { db } from "../db/index.js";
import { agents } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { agentWSClientEventSchema } from "@arinova/shared/schemas";
import type { AgentWSServerEvent, VoiceAudioFormat } from "@arinova/shared/types";

// Active agent connections: agentId -> WebSocket
const agentConnections = new Map<string, WebSocket>();

// Active voice sessions per agent: agentId -> sessionId
const agentVoiceSessions = new Map<string, string>();
// sessionId -> agentId (reverse lookup)
const sessionToAgent = new Map<string, string>();

// Agent skills declared at auth time: agentId -> skills
interface AgentSkillEntry { id: string; name: string; description: string }
const agentSkills = new Map<string, AgentSkillEntry[]>();

/** Get the skills declared by a connected agent. Returns [] if offline. */
export function getAgentSkills(agentId: string): AgentSkillEntry[] {
  return agentSkills.get(agentId) ?? [];
}

// Pending tasks: taskId -> handler callbacks
interface PendingTask {
  agentId: string;
  accumulated: string; // tracks full text for auto-detecting accumulated vs delta mode
  onChunk: (delta: string) => void;
  onComplete: (content: string) => void;
  onError: (error: string) => void;
  timeout: ReturnType<typeof setTimeout>;
}
const pendingTasks = new Map<string, PendingTask>();

const AUTH_TIMEOUT_MS = 10_000; // 10 seconds to authenticate
const TASK_IDLE_TIMEOUT_MS = 600_000; // 600 seconds idle timeout per task

function sendToAgent(ws: WebSocket, event: AgentWSServerEvent) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

/** Check if an agent is currently connected via WebSocket. */
export function isAgentConnected(agentId: string): boolean {
  const ws = agentConnections.get(agentId);
  return ws !== undefined && ws.readyState === ws.OPEN;
}

/** Send a task to a connected agent. Returns a cancel function. */
export function sendTaskToAgent(params: {
  agentId: string;
  taskId: string;
  conversationId: string;
  content: string;
  onChunk: (chunk: string) => void;
  onComplete: (content: string) => void;
  onError: (error: string) => void;
}): { cancel: () => void } {
  const { agentId, taskId, conversationId, content, onChunk, onComplete, onError } = params;

  const ws = agentConnections.get(agentId);
  if (!ws || ws.readyState !== ws.OPEN) {
    onError("Agent not connected");
    return { cancel: () => {} };
  }

  // Set up idle timeout (resets on each chunk)
  const resetIdleTimeout = () => {
    const existing = pendingTasks.get(taskId);
    if (existing) {
      clearTimeout(existing.timeout);
      existing.timeout = setTimeout(() => {
        cleanupTask(taskId, "Task timed out (idle for 600s)");
      }, TASK_IDLE_TIMEOUT_MS);
    }
  };

  const timeout = setTimeout(() => {
    cleanupTask(taskId, "Task timed out (idle for 600s)");
  }, TASK_IDLE_TIMEOUT_MS);

  pendingTasks.set(taskId, {
    agentId,
    accumulated: "",
    onChunk: (delta) => {
      resetIdleTimeout();
      onChunk(delta);
    },
    onComplete,
    onError,
    timeout,
  });

  // Send task to agent
  sendToAgent(ws, { type: "task", taskId, conversationId, content });

  return {
    cancel: () => {
      cleanupTask(taskId, "Stream cancelled");
    },
  };
}

function cleanupTask(taskId: string, errorMessage?: string) {
  const task = pendingTasks.get(taskId);
  if (!task) return;
  clearTimeout(task.timeout);
  pendingTasks.delete(taskId);
  if (errorMessage) {
    task.onError(errorMessage);
  }
}

/** Cancel a pending task silently (no onError/onComplete) and notify the agent to stop. */
export function cancelAgentTask(taskId: string): void {
  const task = pendingTasks.get(taskId);
  if (!task) return;
  clearTimeout(task.timeout);
  pendingTasks.delete(taskId);

  // Notify agent to stop generating
  const ws = agentConnections.get(task.agentId);
  if (ws && ws.readyState === ws.OPEN) {
    sendToAgent(ws, { type: "cancel_task", taskId });
  }
}

function cleanupAgentTasks(agentId: string) {
  for (const [taskId, task] of pendingTasks) {
    if (task.agentId === agentId) {
      cleanupTask(taskId, "Agent disconnected");
    }
  }
}

// ===== Voice Protocol (Task 4) =====

/** Send voice_call_start to agent (Task 4.1) */
export function sendVoiceStartToAgent(
  agentId: string,
  params: { sessionId: string; conversationId: string; audioFormat: VoiceAudioFormat }
) {
  const ws = agentConnections.get(agentId);
  if (!ws || ws.readyState !== ws.OPEN) return;

  agentVoiceSessions.set(agentId, params.sessionId);
  sessionToAgent.set(params.sessionId, agentId);

  sendToAgent(ws, {
    type: "voice_call_start",
    sessionId: params.sessionId,
    conversationId: params.conversationId,
    audioFormat: params.audioFormat,
  });
}

/** Send voice_call_end to agent (Task 4.4) */
export function sendVoiceEndToAgent(
  agentId: string,
  params: { sessionId: string; reason: string }
) {
  const ws = agentConnections.get(agentId);
  if (ws && ws.readyState === ws.OPEN) {
    sendToAgent(ws, {
      type: "voice_call_end",
      sessionId: params.sessionId,
      reason: params.reason,
    });
  }

  agentVoiceSessions.delete(agentId);
  sessionToAgent.delete(params.sessionId);
}

/** Send binary audio data to agent (Task 4.2 — server → agent) */
export function sendVoiceAudioToAgent(sessionId: string, audioData: Buffer) {
  const agentId = sessionToAgent.get(sessionId);
  if (!agentId) return;

  const ws = agentConnections.get(agentId);
  if (ws && ws.readyState === ws.OPEN) {
    // Prefix binary frame with 36-byte sessionId (UUID) for demuxing
    const header = Buffer.from(sessionId);
    const frame = Buffer.concat([header, audioData]);
    ws.send(frame);
  }
}

function cleanupAgentVoiceSessions(agentId: string) {
  const sessionId = agentVoiceSessions.get(agentId);
  if (sessionId) {
    // Lazy-import to avoid circular dependency
    import("./voice-handler.js").then(({ notifyVoiceEnded }) => {
      notifyVoiceEnded(sessionId, "agent_disconnected");
    });
    agentVoiceSessions.delete(agentId);
    sessionToAgent.delete(sessionId);
  }
}

export async function agentWsRoutes(app: FastifyInstance) {
  app.get("/ws/agent", { websocket: true }, async (socket, _request) => {
    let authenticatedAgentId: string | null = null;

    // Auth timeout: agent must send agent_auth within 10 seconds
    const authTimer = setTimeout(() => {
      if (!authenticatedAgentId) {
        sendToAgent(socket, { type: "auth_error", error: "Authentication timeout" });
        socket.close(4408, "Authentication timeout");
      }
    }, AUTH_TIMEOUT_MS);

    socket.on("message", async (data: RawData) => {
      try {
        // Handle binary audio from agent (Task 4.3 — agent → server)
        if (Buffer.isBuffer(data) && authenticatedAgentId) {
          // Binary frame: first 36 bytes = sessionId (UUID), rest = audio data
          if (data.length > 36) {
            const sessionId = data.subarray(0, 36).toString();
            const audioData = data.subarray(36);
            // Forward to voice handler for user playback (Task 3.4)
            import("./voice-handler.js").then(({ sendAudioToUser }) => {
              sendAudioToUser(sessionId, audioData);
            });
          }
          return;
        }

        const raw = JSON.parse(data.toString());
        const event = agentWSClientEventSchema.parse(raw);

        if (event.type === "ping") {
          sendToAgent(socket, { type: "pong" });
          return;
        }

        if (event.type === "agent_auth") {
          clearTimeout(authTimer);

          // Look up agent by botToken (secret_token)
          const [agent] = await db
            .select({ id: agents.id, name: agents.name, secretToken: agents.secretToken })
            .from(agents)
            .where(eq(agents.secretToken, event.botToken));

          if (!agent) {
            sendToAgent(socket, { type: "auth_error", error: "Invalid bot token" });
            socket.close(4404, "Invalid bot token");
            return;
          }

          // Close any existing connection for this agent
          const existingWs = agentConnections.get(agent.id);
          if (existingWs && existingWs !== socket) {
            existingWs.close(4409, "Replaced by new connection");
          }

          authenticatedAgentId = agent.id;
          agentConnections.set(agent.id, socket);
          agentSkills.set(agent.id, event.skills ?? []);
          sendToAgent(socket, { type: "auth_ok", agentName: agent.name });
          app.log.info(`Agent WS connected: agentId=${agent.id} name="${agent.name}" skills=${(event.skills ?? []).length}`);
          return;
        }

        // All other events require authentication
        if (!authenticatedAgentId) {
          sendToAgent(socket, { type: "auth_error", error: "Not authenticated" });
          return;
        }

        if (event.type === "agent_chunk") {
          const task = pendingTasks.get(event.taskId);
          if (task && task.agentId === authenticatedAgentId) {
            const incoming = event.chunk;
            // Auto-detect: if incoming starts with accumulated text, agent is sending
            // full accumulated content (old mode). Otherwise it's a delta (new mode).
            if (task.accumulated.length > 0 && incoming.startsWith(task.accumulated)) {
              // Accumulated mode: extract only the new portion
              const delta = incoming.slice(task.accumulated.length);
              task.accumulated = incoming;
              if (delta) task.onChunk(delta);
            } else {
              // Delta mode: forward directly, track accumulated for detection
              task.accumulated += incoming;
              task.onChunk(incoming);
            }
          }
          return;
        }

        if (event.type === "agent_complete") {
          const task = pendingTasks.get(event.taskId);
          if (task && task.agentId === authenticatedAgentId) {
            clearTimeout(task.timeout);
            pendingTasks.delete(event.taskId);
            task.onComplete(event.content);
          }
          return;
        }

        if (event.type === "agent_error") {
          const task = pendingTasks.get(event.taskId);
          if (task && task.agentId === authenticatedAgentId) {
            clearTimeout(task.timeout);
            pendingTasks.delete(event.taskId);
            task.onError(event.error);
          }
          return;
        }

        // Voice call end from agent (Task 4.4)
        if (event.type === "voice_call_end") {
          const agentId = sessionToAgent.get(event.sessionId);
          if (agentId && agentId === authenticatedAgentId) {
            import("./voice-handler.js").then(({ notifyVoiceEnded }) => {
              notifyVoiceEnded(event.sessionId, event.reason);
            });
            agentVoiceSessions.delete(agentId);
            sessionToAgent.delete(event.sessionId);
          }
          return;
        }
      } catch (err) {
        app.log.error(err, "Agent WS message error");
      }
    });

    socket.on("close", () => {
      clearTimeout(authTimer);
      if (authenticatedAgentId) {
        // Only remove if this socket is still the registered one
        if (agentConnections.get(authenticatedAgentId) === socket) {
          agentConnections.delete(authenticatedAgentId);
          agentSkills.delete(authenticatedAgentId);
          cleanupAgentTasks(authenticatedAgentId);
          cleanupAgentVoiceSessions(authenticatedAgentId);
        }
        app.log.info(`Agent WS disconnected: agentId=${authenticatedAgentId}`);
      }
    });
  });
}
