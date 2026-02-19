import type { FastifyInstance } from "fastify";
import type { WebSocket, RawData } from "ws";
import { auth } from "../auth.js";
import { db } from "../db/index.js";
import {
  messages,
  conversations,
  agents,
  conversationReads,
} from "../db/schema.js";
import { eq, and, gt, desc, asc, sql, inArray } from "drizzle-orm";
import { wsClientEventSchema } from "@arinova/shared/schemas";
import type {
  WSServerEvent,
  SyncConversationSummary,
  SyncMissedMessage,
} from "@arinova/shared/types";
import { isAgentConnected, sendTaskToAgent } from "./agent-handler.js";
import { getNextSeq } from "../lib/message-seq.js";
import {
  pushEvent,
  getPendingEvents,
  clearPendingEvents,
} from "../lib/pending-events.js";

// Active connections: userId -> Set of WebSockets
const wsConnections = new Map<string, Set<WebSocket>>();

// Active stream cancellers: messageId -> { cancel }
const streamCancellers = new Map<string, { cancel: () => void }>();

// Rate limiting: userId -> { count, resetAt }
const wsRateLimits = new Map<string, { count: number; resetAt: number }>();
const WS_RATE_LIMIT = 10; // messages per minute
const WS_RATE_WINDOW = 60000; // 1 minute

// Heartbeat timeout (45 seconds without any client message -> close)
const HEARTBEAT_TIMEOUT = 45000;
const heartbeatTimers = new Map<WebSocket, ReturnType<typeof setTimeout>>();

// Per-conversation agent response queuing
const activeStreams = new Set<string>(); // conversationIds with active streams
const agentResponseQueues = new Map<
  string,
  Array<{ userId: string; conversationId: string; content: string }>
>();

function send(ws: WebSocket, event: WSServerEvent) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(event));
  }
}

function sendToUser(userId: string, event: WSServerEvent) {
  const sockets = wsConnections.get(userId);
  let delivered = false;
  if (sockets) {
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(event));
        delivered = true;
      }
    }
  }
  // Offline: push to pending events queue
  if (!delivered && event.type !== "pong") {
    pushEvent(userId, event).catch(() => {});
  }
}

function resetHeartbeat(ws: WebSocket) {
  const existing = heartbeatTimers.get(ws);
  if (existing) clearTimeout(existing);
  heartbeatTimers.set(
    ws,
    setTimeout(() => {
      ws.close(4408, "Heartbeat timeout");
    }, HEARTBEAT_TIMEOUT)
  );
}

function clearHeartbeat(ws: WebSocket) {
  const timer = heartbeatTimers.get(ws);
  if (timer) {
    clearTimeout(timer);
    heartbeatTimers.delete(ws);
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
    // Buffer messages that arrive during async auth to avoid race condition
    const earlyMessages: RawData[] = [];
    let authed = false;

    socket.on("message", (data: RawData) => {
      if (!authed) {
        earlyMessages.push(data);
        return;
      }
      handleMessage(data);
    });

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

    // Start heartbeat timeout
    resetHeartbeat(socket);

    app.log.info(`WS connected: user=${userId}`);

    // Deliver any pending events from when user was offline
    try {
      const pending = await getPendingEvents(userId);
      if (pending.length > 0) {
        for (const event of pending) {
          send(socket, event);
        }
        await clearPendingEvents(userId);
      }
    } catch (err) {
      app.log.error(err, "Failed to deliver pending events");
    }

    // Define message handler before marking auth complete
    const handleMessage = async (data: RawData) => {
      // Reset heartbeat on any message
      resetHeartbeat(socket);

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
              seq: 0,
              error:
                "Rate limit exceeded. Please wait before sending more messages.",
            });
            return;
          }
          await handleSendMessage(
            userId,
            event.conversationId,
            event.content
          );
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

        if (event.type === "sync") {
          await handleSync(app, userId, event.conversations);
          return;
        }

        if (event.type === "mark_read") {
          await handleMarkRead(userId, event.conversationId, event.seq);
          return;
        }
      } catch (err) {
        app.log.error(err, "WS message error");
      }
    }

    // Mark auth complete and replay buffered messages
    authed = true;
    for (const msg of earlyMessages) {
      handleMessage(msg);
    }
    earlyMessages.length = 0;

    socket.on("close", () => {
      clearHeartbeat(socket);
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
 * Handle sync request: returns missed messages + conversation summaries
 * with server-side unread counts.
 */
async function handleSync(
  app: FastifyInstance,
  userId: string,
  clientConversations: Record<string, number>
) {
  try {
    const allConvs = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.userId, userId));

    const convIds = allConvs.map((c) => c.id);
    if (convIds.length === 0) {
      sendToUser(userId, {
        type: "sync_response",
        conversations: [],
        missedMessages: [],
      });
      return;
    }

    // Get read positions for all conversations
    const reads = await db
      .select()
      .from(conversationReads)
      .where(
        and(
          eq(conversationReads.userId, userId),
          inArray(conversationReads.conversationId, convIds)
        )
      );
    const readMap = new Map(
      reads.map((r) => [r.conversationId, r.lastReadSeq])
    );

    const summaries: SyncConversationSummary[] = [];
    const missedMessages: SyncMissedMessage[] = [];

    for (const conv of allConvs) {
      // Get max seq
      const [seqResult] = await db
        .select({
          maxSeq: sql<number>`COALESCE(MAX(${messages.seq}), 0)`,
        })
        .from(messages)
        .where(eq(messages.conversationId, conv.id));
      const maxSeq = seqResult?.maxSeq ?? 0;

      // Get last message
      const [lastMsg] = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.seq))
        .limit(1);

      const lastReadSeq = readMap.get(conv.id) ?? 0;
      const unreadCount = Math.max(0, maxSeq - lastReadSeq);

      summaries.push({
        conversationId: conv.id,
        unreadCount,
        maxSeq,
        lastMessage: lastMsg
          ? {
              content: lastMsg.content,
              role: lastMsg.role,
              status: lastMsg.status,
              createdAt: lastMsg.createdAt.toISOString(),
            }
          : null,
      });

      // Missed messages for conversations the client knows about
      const clientLastSeq = clientConversations[conv.id];
      if (clientLastSeq !== undefined && clientLastSeq < maxSeq) {
        const missed = await db
          .select()
          .from(messages)
          .where(
            and(
              eq(messages.conversationId, conv.id),
              gt(messages.seq, clientLastSeq)
            )
          )
          .orderBy(asc(messages.seq))
          .limit(100);

        for (const m of missed) {
          // Fix stuck streaming messages that have no active stream
          let { status } = m;
          if (status === "streaming" && !activeStreams.has(conv.id)) {
            status = m.content ? "completed" : "error";
            await db
              .update(messages)
              .set({ status, updatedAt: new Date() })
              .where(eq(messages.id, m.id));
          }

          missedMessages.push({
            id: m.id,
            conversationId: m.conversationId,
            seq: m.seq,
            role: m.role,
            content: m.content,
            status,
            createdAt: m.createdAt.toISOString(),
          });
        }
      }
    }

    sendToUser(userId, {
      type: "sync_response",
      conversations: summaries,
      missedMessages,
    });
  } catch (err) {
    app.log.error(err, "Sync error");
  }
}

/**
 * Handle mark_read: upsert lastReadSeq for user's conversation.
 */
async function handleMarkRead(
  userId: string,
  conversationId: string,
  seq: number
) {
  await db.execute(sql`
    INSERT INTO conversation_reads (id, user_id, conversation_id, last_read_seq, updated_at)
    VALUES (gen_random_uuid(), ${userId}, ${conversationId}, ${seq}, NOW())
    ON CONFLICT (user_id, conversation_id)
    DO UPDATE SET
      last_read_seq = GREATEST(conversation_reads.last_read_seq, EXCLUDED.last_read_seq),
      updated_at = NOW()
  `);
}

/**
 * Trigger an agent response for a conversation.
 * Saves user message immediately, then either starts agent response
 * or queues if another stream is active for this conversation.
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

  if (!conv || !conv.agentId) return;

  // Save user message immediately (even when queuing)
  if (!options?.skipUserMessage) {
    const userSeq = await getNextSeq(conversationId);
    await db.insert(messages).values({
      conversationId,
      seq: userSeq,
      role: "user",
      content,
      status: "completed",
    });
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  }

  // If there's an active stream, queue the agent response
  if (activeStreams.has(conversationId)) {
    let queue = agentResponseQueues.get(conversationId);
    if (!queue) {
      queue = [];
      agentResponseQueues.set(conversationId, queue);
    }
    queue.push({ userId, conversationId, content });
    return;
  }

  await doTriggerAgentResponse(
    userId,
    conv.agentId,
    conversationId,
    content
  );
}

/**
 * Actually send the task to the agent and set up streaming callbacks.
 */
async function doTriggerAgentResponse(
  userId: string,
  agentId: string,
  conversationId: string,
  content: string
) {
  const [agent] = await db
    .select({ name: agents.name })
    .from(agents)
    .where(eq(agents.id, agentId));

  if (!agent) return;

  // Check if agent is connected
  if (!isAgentConnected(agentId)) {
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
      seq: errSeq,
    });
    sendToUser(userId, {
      type: "stream_error",
      conversationId,
      messageId: errMsg.id,
      seq: errSeq,
      error: `${agent.name} is not connected. Copy the Bot Token from bot settings and run: openclaw arinova-setup --token <bot-token>`,
    });
    return;
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

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  // Mark conversation as having active stream
  activeStreams.add(conversationId);

  sendToUser(userId, {
    type: "stream_start",
    conversationId,
    messageId: agentMsg.id,
    seq: agentSeq,
  });

  // Send task to agent via WebSocket
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
        seq: agentSeq,
        chunk,
      });
    },
    onComplete: async (fullContent) => {
      streamCancellers.delete(agentMsg.id);

      await db
        .update(messages)
        .set({
          content: fullContent,
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(messages.id, agentMsg.id));

      sendToUser(userId, {
        type: "stream_end",
        conversationId,
        messageId: agentMsg.id,
        seq: agentSeq,
      });

      // Dequeue next agent response
      activeStreams.delete(conversationId);
      processNextInQueue(conversationId);
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
        seq: agentSeq,
        error,
      });

      // Dequeue next agent response
      activeStreams.delete(conversationId);
      processNextInQueue(conversationId);
    },
  });

  streamCancellers.set(agentMsg.id, { cancel });
}

/**
 * Process the next queued agent response for a conversation.
 */
async function processNextInQueue(conversationId: string) {
  const queue = agentResponseQueues.get(conversationId);
  if (!queue || queue.length === 0) {
    agentResponseQueues.delete(conversationId);
    return;
  }

  const next = queue.shift()!;
  if (queue.length === 0) {
    agentResponseQueues.delete(conversationId);
  }

  const [conv] = await db
    .select({ agentId: conversations.agentId })
    .from(conversations)
    .where(eq(conversations.id, conversationId));

  if (!conv?.agentId) return;

  await doTriggerAgentResponse(
    next.userId,
    conv.agentId,
    conversationId,
    next.content
  );
}

async function handleSendMessage(
  userId: string,
  conversationId: string,
  content: string
) {
  await triggerAgentResponse(userId, conversationId, content);
}
