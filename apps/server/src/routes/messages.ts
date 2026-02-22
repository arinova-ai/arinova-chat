import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { messages, conversations, attachments, agents } from "../db/schema.js";
import { eq, and, lt, gt, desc, asc, inArray, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { isR2Configured } from "../lib/r2.js";
import { env } from "../env.js";

/** Attach attachment data to a list of messages */
async function withAttachments(items: (typeof messages.$inferSelect)[]) {
  if (items.length === 0) return [];
  const messageIds = items.map((m) => m.id);
  const messageAttachments = await db
    .select()
    .from(attachments)
    .where(inArray(attachments.messageId, messageIds));

  const byMsg = new Map<string, (typeof messageAttachments)>();
  for (const att of messageAttachments) {
    const existing = byMsg.get(att.messageId) ?? [];
    existing.push(att);
    byMsg.set(att.messageId, existing);
  }

  return items.map((m) => {
    const atts = byMsg.get(m.id) ?? [];
    return {
      ...m,
      attachments: atts.map((a) => ({
        id: a.id,
        messageId: a.messageId,
        fileName: a.fileName,
        fileType: a.fileType,
        fileSize: a.fileSize,
        url: isR2Configured
          ? `${env.R2_PUBLIC_URL}/${a.storagePath}`
          : `/uploads/${a.storagePath}`,
        createdAt: a.createdAt,
      })),
    };
  });
}

export async function messageRoutes(app: FastifyInstance) {
  // Search messages across all user's conversations
  app.get<{
    Querystring: { q: string; limit?: string; offset?: string };
  }>("/api/messages/search", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const { q, limit: limitStr, offset: offsetStr } = request.query;

    if (!q || q.trim().length === 0) {
      return reply.send({ results: [], total: 0 });
    }

    const limit = Math.min(parseInt(limitStr ?? "20", 10), 50);
    const offset = parseInt(offsetStr ?? "0", 10);
    const pattern = `%${q}%`;

    // Get all conversation IDs belonging to this user
    const userConvs = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.userId, user.id));
    const convIds = userConvs.map((c) => c.id);

    if (convIds.length === 0) {
      return reply.send({ results: [], total: 0 });
    }

    // Count total matches
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          inArray(messages.conversationId, convIds),
          ilike(messages.content, pattern)
        )
      );

    // Fetch matching messages with conversation + agent info
    const results = await db
      .select({
        messageId: messages.id,
        conversationId: messages.conversationId,
        content: messages.content,
        role: messages.role,
        createdAt: messages.createdAt,
        conversationTitle: conversations.title,
        agentId: conversations.agentId,
        agentName: agents.name,
        agentAvatarUrl: agents.avatarUrl,
      })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .leftJoin(agents, eq(conversations.agentId, agents.id))
      .where(
        and(
          inArray(messages.conversationId, convIds),
          ilike(messages.content, pattern)
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit)
      .offset(offset);

    return reply.send({ results, total: count });
  });

  // Get messages for a conversation (cursor-based pagination)
  // Supports: ?before=id, ?after=id, ?around=id
  app.get<{
    Params: { id: string };
    Querystring: { before?: string; after?: string; around?: string; limit?: string };
  }>("/api/conversations/:id/messages", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const { before, after, around, limit: limitStr } = request.query;
    const limit = Math.min(parseInt(limitStr ?? "50", 10), 100);

    // Verify conversation belongs to user
    const [conv] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, request.params.id),
          eq(conversations.userId, user.id)
        )
      );

    if (!conv) {
      return reply.status(404).send({ error: "Conversation not found" });
    }

    // --- Around mode: load messages centered on target ---
    if (around) {
      const [targetMsg] = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.id, around),
            eq(messages.conversationId, request.params.id)
          )
        );

      if (!targetMsg) {
        return reply.status(404).send({ error: "Target message not found" });
      }

      const half = Math.floor(limit / 2);

      // Messages before target (older)
      const olderRows = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, request.params.id),
            lt(messages.createdAt, targetMsg.createdAt)
          )
        )
        .orderBy(desc(messages.createdAt))
        .limit(half + 1);

      // Messages after target (newer)
      const newerRows = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, request.params.id),
            gt(messages.createdAt, targetMsg.createdAt)
          )
        )
        .orderBy(asc(messages.createdAt))
        .limit(half + 1);

      const hasMoreUp = olderRows.length > half;
      const hasMoreDown = newerRows.length > half;

      const olderItems = olderRows.slice(0, half).reverse();
      const newerItems = newerRows.slice(0, half);

      const allItems = [...olderItems, targetMsg, ...newerItems];
      const messagesWithAtts = await withAttachments(allItems);

      return reply.send({
        messages: messagesWithAtts,
        hasMore: hasMoreUp, // backwards compat
        hasMoreUp,
        hasMoreDown,
        nextCursor: hasMoreUp ? olderItems[0]?.id : null,
      });
    }

    // --- After mode: load newer messages (for downward scroll) ---
    if (after) {
      const [cursorMsg] = await db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.id, after));

      if (!cursorMsg) {
        return reply.send({ messages: [], hasMore: false, hasMoreDown: false });
      }

      const result = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, request.params.id),
            gt(messages.createdAt, cursorMsg.createdAt)
          )
        )
        .orderBy(asc(messages.createdAt))
        .limit(limit + 1);

      const hasMoreDown = result.length > limit;
      const items = result.slice(0, limit);
      const messagesWithAtts = await withAttachments(items);

      return reply.send({
        messages: messagesWithAtts,
        hasMore: false,
        hasMoreDown,
      });
    }

    // --- Default: before mode (load older messages from bottom) ---
    const conditions = [eq(messages.conversationId, request.params.id)];

    if (before) {
      const [cursorMsg] = await db
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.id, before));

      if (cursorMsg) {
        conditions.push(lt(messages.createdAt, cursorMsg.createdAt));
      }
    }

    const result = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1);

    const hasMore = result.length > limit;
    const items = result.slice(0, limit).reverse();
    const messagesWithAtts = await withAttachments(items);

    return reply.send({
      messages: messagesWithAtts,
      hasMore,
      nextCursor: hasMore ? items[0]?.id : null,
    });
  });

  // Delete a message
  app.delete<{
    Params: { conversationId: string; messageId: string };
  }>("/api/conversations/:conversationId/messages/:messageId", async (request, reply) => {
    const user = await requireAuth(request, reply);

    // Verify conversation belongs to user
    const [conv] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, request.params.conversationId),
          eq(conversations.userId, user.id)
        )
      );

    if (!conv) {
      return reply.status(404).send({ error: "Conversation not found" });
    }

    const [msg] = await db
      .delete(messages)
      .where(
        and(
          eq(messages.id, request.params.messageId),
          eq(messages.conversationId, request.params.conversationId)
        )
      )
      .returning();

    if (!msg) {
      return reply.status(404).send({ error: "Message not found" });
    }

    return reply.status(204).send();
  });
}
