import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { messages, conversations, attachments } from "../db/schema.js";
import { eq, and, lt, desc, inArray } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

export async function messageRoutes(app: FastifyInstance) {
  // Get messages for a conversation (cursor-based pagination)
  app.get<{
    Params: { id: string };
    Querystring: { before?: string; limit?: string };
  }>("/api/conversations/:id/messages", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const { before, limit: limitStr } = request.query;
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

    const conditions = [eq(messages.conversationId, request.params.id)];

    if (before) {
      // Get the createdAt of the cursor message
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

    // Fetch attachments for these messages
    const messageIds = items.map((m) => m.id);
    const messageAttachments = messageIds.length > 0
      ? await db
          .select()
          .from(attachments)
          .where(inArray(attachments.messageId, messageIds))
      : [];

    const attachmentsByMessage = new Map<string, typeof messageAttachments>();
    for (const att of messageAttachments) {
      const existing = attachmentsByMessage.get(att.messageId) ?? [];
      existing.push(att);
      attachmentsByMessage.set(att.messageId, existing);
    }

    const messagesWithAttachments = items.map((m) => {
      const atts = attachmentsByMessage.get(m.id) ?? [];
      return {
        ...m,
        attachments: atts.map((a) => ({
          id: a.id,
          messageId: a.messageId,
          fileName: a.fileName,
          fileType: a.fileType,
          fileSize: a.fileSize,
          url: `/uploads/${a.storagePath}`,
          createdAt: a.createdAt,
        })),
      };
    });

    return reply.send({
      messages: messagesWithAttachments,
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
