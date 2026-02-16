import type { FastifyInstance } from "fastify";
import type { WebSocket, RawData } from "ws";
import { db } from "../db/index.js";
import { agents } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { agentWSClientEventSchema } from "@arinova/shared/schemas";
import type { AgentWSServerEvent } from "@arinova/shared/types";

// Active agent connections: agentId -> WebSocket
const agentConnections = new Map<string, WebSocket>();

// Pending tasks: taskId -> handler callbacks
interface PendingTask {
  agentId: string;
  onChunk: (chunk: string) => void;
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
    onChunk: (chunk) => {
      resetIdleTimeout();
      onChunk(chunk);
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

function cleanupAgentTasks(agentId: string) {
  for (const [taskId, task] of pendingTasks) {
    if (task.agentId === agentId) {
      cleanupTask(taskId, "Agent disconnected");
    }
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
        const raw = JSON.parse(data.toString());
        const event = agentWSClientEventSchema.parse(raw);

        if (event.type === "ping") {
          sendToAgent(socket, { type: "pong" });
          return;
        }

        if (event.type === "agent_auth") {
          clearTimeout(authTimer);

          // Verify agentId exists in DB
          const [agent] = await db
            .select({ id: agents.id, name: agents.name })
            .from(agents)
            .where(eq(agents.id, event.agentId));

          if (!agent) {
            sendToAgent(socket, { type: "auth_error", error: "Agent not found" });
            socket.close(4404, "Agent not found");
            return;
          }

          // Close any existing connection for this agent
          const existingWs = agentConnections.get(event.agentId);
          if (existingWs && existingWs !== socket) {
            existingWs.close(4409, "Replaced by new connection");
          }

          authenticatedAgentId = event.agentId;
          agentConnections.set(event.agentId, socket);
          sendToAgent(socket, { type: "auth_ok", agentName: agent.name });
          app.log.info(`Agent WS connected: agentId=${event.agentId} name="${agent.name}"`);
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
            task.onChunk(event.chunk);
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
          cleanupAgentTasks(authenticatedAgentId);
        }
        app.log.info(`Agent WS disconnected: agentId=${authenticatedAgentId}`);
      }
    });
  });
}
