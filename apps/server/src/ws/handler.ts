import type { FastifyInstance } from "fastify";
import type { WebSocket, RawData } from "ws";
import { auth } from "../auth.js";
import { db } from "../db/index.js";
import { messages, conversations, conversationMembers, agents } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { wsClientEventSchema } from "@arinova/shared/schemas";
import type { WSServerEvent } from "@arinova/shared/types";
import { isAgentConnected, sendTaskToAgent } from "./agent-handler.js";
import { getNextSeq } from "../lib/message-seq.js";
import { sendPushToUser } from "../lib/push.js";
import { shouldSendPush } from "../lib/push-trigger.js";

// Active connections: userId -> Set of WebSockets
const wsConnections = new Map<string, Set<WebSocket>>();

// Active stream cancellers: messageId -> { cancel }
const streamCancellers = new Map<string, { cancel: () => void }>();

// Rate limiting: userId -> { count, resetAt }
const wsRateLimits = new Map<string, { count: number; resetAt: number }>();
const WS_RATE_LIMIT = 60; // messages per minute
const WS_RATE_WINDOW = 60000; // 1 minute

function send(ws: WebSocket, event: WSServerEvent) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

export function isUserOnline(userId: string): boolean {
  const sockets = wsConnections.get(userId);
  return Boolean(sockets && sockets.size > 0);
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
          const canceller = streamCancellers.get(event.messageId);
          if (canceller) {
            canceller.cancel();
            streamCancellers.delete(event.messageId);
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

/**
 * Trigger an agent response for a conversation.
 * Creates a streaming agent message, sends the task to the agent,
 * and streams chunks back to the user via WebSocket.
 *
 * Set `skipUserMessage` to true when the user message was already created
 * (e.g. by the upload endpoint).
 */
export async function triggerAgentResponse(
  userId: string,
  conversationId: string,
  content: string,
  options?: { skipUserMessage?: boolean }
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

  if (!conv) return;

  // Group conversations: trigger each member agent and return
  if (!conv.agentId) {
    const members = await db
      .select({ agentId: conversationMembers.agentId })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId));

    if (members.length === 0) return;

    // Save user message once
    if (!options?.skipUserMessage) {
      const seq = await getNextSeq(conversationId);
      await db.insert(messages).values({
        conversationId,
        seq,
        role: "user",
        content,
        status: "completed",
      });
    }

    // Trigger each agent
    for (const member of members) {
      await triggerGroupAgentResponse(userId, conversationId, content, member.agentId);
    }
    return;
  }

  // Get agent info
  const [agent] = await db
    .select({
      name: agents.name,
    })
    .from(agents)
    .where(eq(agents.id, conv.agentId));

  if (!agent) return;

  // Check if agent is connected via WebSocket
  if (!isAgentConnected(conv.agentId)) {
    const hint = `Copy the **Bot Token** from bot settings, then run:\n\`\`\`\nopenclaw arinova-setup --token <bot-token>\n\`\`\``;

    const errSeq = await getNextSeq(conversationId);
    const [errMsg] = await db
      .insert(messages)
      .values({
        conversationId,
        seq: errSeq,
        role: "agent",
        content: `**${agent.name}** is not connected yet. An AI agent needs to connect to this bot before it can respond.\n\n${hint}`,
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
      error: `${agent.name} is not connected. Copy the Bot Token from bot settings and run: openclaw arinova-setup --token <bot-token>`,
    });
    return;
  }

  // Save user message (unless already created, e.g. by upload)
  if (!options?.skipUserMessage) {
    const userSeq = await getNextSeq(conversationId);
    await db.insert(messages).values({
      conversationId,
      seq: userSeq,
      role: "user",
      content,
      status: "completed",
    });
  }

  // Create pending agent message
  const agentSeq = await getNextSeq(conversationId);
  const [agentMsg] = await db
    .insert(messages)
    .values({
      conversationId,
      seq: agentSeq,
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

  // Send task to agent via WebSocket
  const { cancel } = sendTaskToAgent({
    agentId: conv.agentId,
    taskId: agentMsg.id,
    conversationId,
    content,
    onChunk: (chunk) => {
      sendToUser(userId, {
        type: "stream_chunk",
        conversationId,
        messageId: agentMsg.id,
        chunk,
      });
    },
    onComplete: async (fullContent) => {
      streamCancellers.delete(agentMsg.id);

      await db
        .update(messages)
        .set({ content: fullContent, status: "completed", updatedAt: new Date() })
        .where(eq(messages.id, agentMsg.id));

      sendToUser(userId, {
        type: "stream_end",
        conversationId,
        messageId: agentMsg.id,
      });

      // Push notification if user is offline
      if (!isUserOnline(userId)) {
        const ok = await shouldSendPush(userId, "message");
        if (ok) {
          const preview = fullContent.length > 100
            ? fullContent.slice(0, 100) + "…"
            : fullContent;
          sendPushToUser(userId, {
            type: "message",
            title: agent.name,
            body: preview,
            url: `/chat/${conversationId}`,
          }).catch(() => {});
        }
      }
    },
    onError: async (error) => {
      streamCancellers.delete(agentMsg.id);

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

  streamCancellers.set(agentMsg.id, { cancel });
}

async function handleSendMessage(
  userId: string,
  conversationId: string,
  content: string
) {
  await triggerAgentResponse(userId, conversationId, content);
}

async function triggerGroupAgentResponse(
  userId: string,
  conversationId: string,
  content: string,
  agentId: string,
) {
  const [agent] = await db
    .select({ name: agents.name })
    .from(agents)
    .where(eq(agents.id, agentId));

  if (!agent) return;

  if (!isAgentConnected(agentId)) return;

  const agentSeq = await getNextSeq(conversationId);
  const [agentMsg] = await db
    .insert(messages)
    .values({
      conversationId,
      seq: agentSeq,
      role: "agent",
      content: "",
      status: "streaming",
    })
    .returning();

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  sendToUser(userId, {
    type: "stream_start",
    conversationId,
    messageId: agentMsg.id,
  });

  const { cancel } = sendTaskToAgent({
    agentId,
    taskId: agentMsg.id,
    conversationId,
    content,
    onChunk: (chunk) => {
      sendToUser(userId, {
        type: "stream_chunk",
        conversationId,
        messageId: agentMsg.id,
        chunk,
      });
    },
    onComplete: async (fullContent) => {
      streamCancellers.delete(agentMsg.id);

      await db
        .update(messages)
        .set({ content: fullContent, status: "completed", updatedAt: new Date() })
        .where(eq(messages.id, agentMsg.id));

      sendToUser(userId, {
        type: "stream_end",
        conversationId,
        messageId: agentMsg.id,
      });

      // Push notification if user is offline
      if (!isUserOnline(userId)) {
        const ok = await shouldSendPush(userId, "message");
        if (ok) {
          const preview = fullContent.length > 100
            ? fullContent.slice(0, 100) + "…"
            : fullContent;
          sendPushToUser(userId, {
            type: "message",
            title: agent.name,
            body: preview,
            url: `/chat/${conversationId}`,
          }).catch(() => {});
        }
      }
    },
    onError: async (error) => {
      streamCancellers.delete(agentMsg.id);

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

  streamCancellers.set(agentMsg.id, { cancel });
}
