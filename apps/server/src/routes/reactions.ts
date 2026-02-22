import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { messageReactions, messages, conversations } from "../db/schema.js";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { z } from "zod";

const addReactionSchema = z.object({
  emoji: z.string().min(1).max(32),
});

/** Fetch reactions for a list of messages (batch). Returns Map<messageId, reactions[]> */
export async function getReactionsForMessages(messageIds: string[]) {
  if (messageIds.length === 0) return new Map<string, typeof rows>();
  const rows = await db
    .select()
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, messageIds));

  const byMsg = new Map<string, typeof rows>();
  for (const r of rows) {
    const existing = byMsg.get(r.messageId) ?? [];
    existing.push(r);
    byMsg.set(r.messageId, existing);
  }
  return byMsg;
}

export async function reactionRoutes(app: FastifyInstance) {
  // Add reaction to a message
  app.post<{
    Params: { messageId: string };
  }>("/api/messages/:messageId/reactions", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const { messageId } = request.params;
    const body = addReactionSchema.parse(request.body);

    // Verify message exists and belongs to user's conversation
    const [msg] = await db
      .select({ conversationId: messages.conversationId })
      .from(messages)
      .where(eq(messages.id, messageId));

    if (!msg) {
      return reply.status(404).send({ error: "Message not found" });
    }

    const [conv] = await db
      .select({ userId: conversations.userId })
      .from(conversations)
      .where(eq(conversations.id, msg.conversationId));

    if (!conv || conv.userId !== user.id) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    // Upsert reaction (ignore if already exists)
    try {
      const [reaction] = await db
        .insert(messageReactions)
        .values({
          messageId,
          userId: user.id,
          emoji: body.emoji,
        })
        .onConflictDoNothing()
        .returning();

      return reply.status(201).send(reaction ?? { messageId, userId: user.id, emoji: body.emoji });
    } catch {
      return reply.status(409).send({ error: "Reaction already exists" });
    }
  });

  // Remove reaction from a message
  app.delete<{
    Params: { messageId: string; emoji: string };
  }>("/api/messages/:messageId/reactions/:emoji", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const { messageId, emoji } = request.params;

    const [deleted] = await db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, user.id),
          eq(messageReactions.emoji, decodeURIComponent(emoji))
        )
      )
      .returning();

    if (!deleted) {
      return reply.status(404).send({ error: "Reaction not found" });
    }

    return reply.status(204).send();
  });

  // Get reactions for a message
  app.get<{
    Params: { messageId: string };
  }>("/api/messages/:messageId/reactions", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const { messageId } = request.params;

    const reactions = await db
      .select()
      .from(messageReactions)
      .where(eq(messageReactions.messageId, messageId));

    // Group by emoji
    const grouped: Record<string, { emoji: string; count: number; userReacted: boolean }> = {};
    for (const r of reactions) {
      if (!grouped[r.emoji]) {
        grouped[r.emoji] = { emoji: r.emoji, count: 0, userReacted: false };
      }
      grouped[r.emoji].count++;
      if (r.userId === user.id) grouped[r.emoji].userReacted = true;
    }

    return reply.send(Object.values(grouped));
  });
}
