import type { FastifyInstance } from "fastify";
import type { WebSocket, RawData } from "ws";
import { auth } from "../auth.js";
import { db } from "../db/index.js";
import { messages, conversations, agents } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { wsClientEventSchema } from "@arinova/shared/schemas";
import type { WSServerEvent } from "@arinova/shared/types";
import { streamA2AResponse } from "../a2a/client.js";

// Active connections: userId -> Set of WebSockets
const wsConnections = new Map<string, Set<WebSocket>>();

// Active streaming abort controllers
const streamAbortControllers = new Map<string, AbortController>();

// Rate limiting: userId -> { count, resetAt }
const wsRateLimits = new Map<string, { count: number; resetAt: number }>();
const WS_RATE_LIMIT = 10; // messages per minute
const WS_RATE_WINDOW = 60000; // 1 minute

function send(ws: WebSocket, event: WSServerEvent) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function sendToUser(userId: string, event: WSServerEvent) {
  const sockets = wsConnections.get(userId);
  if (sockets) {
    for (const ws of sockets) {
      send(ws, event);
    }
  }
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const limit = wsRateLimits.get(userId);

  if (!limit || now > limit.resetAt) {
    wsRateLimits.set(userId, { count: 1, resetAt: now + WS_RATE_WINDOW });
    return true;
  }

  if (limit.count >= WS_RATE_LIMIT) {
    return false;
  }

  limit.count++;
  return true;
}

export async function wsRoutes(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, async (socket, request) => {
    // Auth from cookie
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

    // Register connection
    if (!wsConnections.has(userId)) {
      wsConnections.set(userId, new Set());
    }
    wsConnections.get(userId)!.add(socket);

    app.log.info(`WS connected: user=${userId}`);

    socket.on("message", async (data: RawData) => {
      try {
        const raw = JSON.parse(data.toString());
        const event = wsClientEventSchema.parse(raw);

        if (event.type === "ping") {
          send(socket, { type: "pong" });
          return;
        }

        if (event.type === "send_message") {
          if (!checkRateLimit(userId)) {
            send(socket, {
              type: "stream_error",
              conversationId: event.conversationId,
              messageId: "",
              error: "Rate limit exceeded. Please wait before sending more messages.",
            });
            return;
          }
          await handleSendMessage(userId, event.conversationId, event.content);
          return;
        }

        if (event.type === "cancel_stream") {
          const controller = streamAbortControllers.get(event.messageId);
          if (controller) {
            controller.abort();
            streamAbortControllers.delete(event.messageId);
          }
          return;
        }
      } catch (err) {
        app.log.error(err, "WS message error");
      }
    });

    socket.on("close", () => {
      const sockets = wsConnections.get(userId);
      if (sockets) {
        sockets.delete(socket);
        if (sockets.size === 0) {
          wsConnections.delete(userId);
        }
      }
      app.log.info(`WS disconnected: user=${userId}`);
    });
  });
}

async function handleSendMessage(
  userId: string,
  conversationId: string,
  content: string
) {
  // Verify conversation belongs to user and get agent info
  const [conv] = await db
    .select({
      id: conversations.id,
      agentId: conversations.agentId,
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId)
      )
    );

  if (!conv || !conv.agentId) return;

  // Get agent endpoint
  const [agent] = await db
    .select({
      a2aEndpoint: agents.a2aEndpoint,
      name: agents.name,
      pairingCode: agents.pairingCode,
    })
    .from(agents)
    .where(eq(agents.id, conv.agentId));

  if (!agent) return;

  if (!agent.a2aEndpoint) {
    // Agent has no endpoint configured — cannot send messages
    const codeHint = agent.pairingCode
      ? `Use pairing code: \`${agent.pairingCode}\``
      : `Configure your AI agent with this bot's ID: \`${conv.agentId}\``;
    const shortHint = agent.pairingCode
      ? `Use pairing code: ${agent.pairingCode}`
      : `Configure your AI agent with bot ID: ${conv.agentId}`;

    const [errMsg] = await db
      .insert(messages)
      .values({
        conversationId,
        role: "agent",
        content: `**${agent.name}** is not connected yet. An AI agent needs to connect to this bot before it can respond.\n\n${codeHint}`,
        status: "error",
      })
      .returning();

    sendToUser(userId, {
      type: "stream_start",
      conversationId,
      messageId: errMsg.id,
    });
    sendToUser(userId, {
      type: "stream_error",
      conversationId,
      messageId: errMsg.id,
      error: `${agent.name} is not connected. ${shortHint}`,
    });
    return;
  }

  // Save user message
  await db.insert(messages).values({
    conversationId,
    role: "user",
    content,
    status: "completed",
  });

  // Create pending agent message
  const [agentMsg] = await db
    .insert(messages)
    .values({
      conversationId,
      role: "agent",
      content: "",
      status: "streaming",
    })
    .returning();

  // Update conversation timestamp
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  // Notify user of stream start
  sendToUser(userId, {
    type: "stream_start",
    conversationId,
    messageId: agentMsg.id,
  });

  // Stream response via A2A (with fallback to mock)
  const abortController = new AbortController();
  streamAbortControllers.set(agentMsg.id, abortController);

  // Idle timeout — resets on each chunk (600s allows for long reasoning/tool chains)
  let timeout: ReturnType<typeof setTimeout>;
  const resetIdleTimeout = () => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      abortController.abort();
    }, 600_000);
  };
  resetIdleTimeout();

  await streamA2AResponse({
    endpoint: agent.a2aEndpoint,
    content,
    conversationId,
    messageId: agentMsg.id,
    signal: abortController.signal,
    onChunk: (chunk) => {
      resetIdleTimeout();
      sendToUser(userId, {
        type: "stream_chunk",
        conversationId,
        messageId: agentMsg.id,
        chunk,
      });
    },
    onComplete: async (fullContent) => {
      clearTimeout(timeout);
      streamAbortControllers.delete(agentMsg.id);

      await db
        .update(messages)
        .set({ content: fullContent, status: "completed", updatedAt: new Date() })
        .where(eq(messages.id, agentMsg.id));

      sendToUser(userId, {
        type: "stream_end",
        conversationId,
        messageId: agentMsg.id,
      });
    },
    onError: async (error) => {
      clearTimeout(timeout);
      streamAbortControllers.delete(agentMsg.id);

      await db
        .update(messages)
        .set({ content: error, status: "error", updatedAt: new Date() })
        .where(eq(messages.id, agentMsg.id));

      sendToUser(userId, {
        type: "stream_error",
        conversationId,
        messageId: agentMsg.id,
        error,
      });
    },
  });
}
