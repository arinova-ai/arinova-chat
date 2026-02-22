import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  conversations,
  agents,
  messages,
  conversationMembers,
  conversationReads,
} from "../db/schema.js";
import { eq, and, desc, sql, ilike } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { createConversationSchema } from "@arinova/shared/schemas";

export async function conversationRoutes(app: FastifyInstance) {
  // Create conversation
  app.post("/api/conversations", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const body = createConversationSchema.parse(request.body);

    // Verify agent exists and belongs to user
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, body.agentId), eq(agents.ownerId, user.id)));

    if (!agent) {
      return reply.status(404).send({ error: "Agent not found" });
    }

    const [conversation] = await db
      .insert(conversations)
      .values({
        title: body.title ?? null,
        type: "direct",
        userId: user.id,
        agentId: body.agentId,
      })
      .returning();

    return reply.status(201).send(conversation);
  });

  // List conversations with last message preview and agent info (JOIN-based)
  app.get<{ Querystring: { q?: string } }>(
    "/api/conversations",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      const query = request.query.q;

      // Subquery: last message per conversation
      const lastMsgSq = db
        .select({
          conversationId: messages.conversationId,
          maxCreatedAt: sql<Date>`MAX(${messages.createdAt})`.as("max_created_at"),
        })
        .from(messages)
        .groupBy(messages.conversationId)
        .as("last_msg_sq");

      // Build conditions
      const conditions = [eq(conversations.userId, user.id)];
      if (query) {
        const pattern = `%${query}%`;
        conditions.push(
          sql`(${conversations.title} ILIKE ${pattern} OR ${agents.name} ILIKE ${pattern})`
        );
      }

      // Main query with LEFT JOINs
      const rows = await db
        .select({
          // Conversation fields
          id: conversations.id,
          title: conversations.title,
          type: conversations.type,
          userId: conversations.userId,
          agentId: conversations.agentId,
          mentionOnly: conversations.mentionOnly,
          pinnedAt: conversations.pinnedAt,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
          // Agent fields
          agentName: agents.name,
          agentDescription: agents.description,
          agentAvatarUrl: agents.avatarUrl,
          // Last message fields
          lastMsgId: messages.id,
          lastMsgSeq: messages.seq,
          lastMsgRole: messages.role,
          lastMsgContent: messages.content,
          lastMsgStatus: messages.status,
          lastMsgCreatedAt: messages.createdAt,
          lastMsgUpdatedAt: messages.updatedAt,
        })
        .from(conversations)
        .leftJoin(agents, eq(conversations.agentId, agents.id))
        .leftJoin(lastMsgSq, eq(conversations.id, lastMsgSq.conversationId))
        .leftJoin(
          messages,
          and(
            eq(messages.conversationId, conversations.id),
            eq(messages.createdAt, lastMsgSq.maxCreatedAt)
          )
        )
        .where(and(...conditions))
        .orderBy(desc(conversations.pinnedAt), desc(conversations.updatedAt));

      // For group conversations, batch-fetch member names
      const groupIds = rows.filter((r) => r.type === "group").map((r) => r.id);
      const groupMemberNames = new Map<string, string[]>();
      if (groupIds.length > 0) {
        const members = await db
          .select({
            conversationId: conversationMembers.conversationId,
            name: agents.name,
          })
          .from(conversationMembers)
          .innerJoin(agents, eq(conversationMembers.agentId, agents.id))
          .where(sql`${conversationMembers.conversationId} IN (${sql.join(groupIds.map(id => sql`${id}`), sql`, `)})`);
        for (const m of members) {
          const list = groupMemberNames.get(m.conversationId) ?? [];
          list.push(m.name);
          groupMemberNames.set(m.conversationId, list);
        }
      }

      const result = rows.map((row) => {
        let agentName = row.agentName ?? "Unknown";
        let agentDescription = row.agentDescription;
        const agentAvatarUrl = row.agentAvatarUrl;

        if (row.type === "group") {
          const names = groupMemberNames.get(row.id) ?? [];
          agentName = names.join(", ") || "Empty group";
          agentDescription = `${names.length} agent${names.length !== 1 ? "s" : ""}`;
        }

        return {
          id: row.id,
          title: row.title,
          type: row.type,
          userId: row.userId,
          agentId: row.agentId,
          mentionOnly: row.mentionOnly,
          pinnedAt: row.pinnedAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          agentName,
          agentDescription,
          agentAvatarUrl,
          lastMessage: row.lastMsgId
            ? {
                id: row.lastMsgId,
                conversationId: row.id,
                seq: row.lastMsgSeq,
                role: row.lastMsgRole,
                content: row.lastMsgContent,
                status: row.lastMsgStatus,
                createdAt: row.lastMsgCreatedAt,
                updatedAt: row.lastMsgUpdatedAt,
              }
            : null,
        };
      });

      return reply.send(result);
    }
  );

  // Get single conversation
  app.get<{ Params: { id: string } }>(
    "/api/conversations/:id",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

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

      return reply.send(conv);
    }
  );

  // Update conversation (rename, pin/unpin)
  app.put<{ Params: { id: string } }>(
    "/api/conversations/:id",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      const body = request.body as { title?: string; pinned?: boolean; mentionOnly?: boolean };

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.title !== undefined) updates.title = body.title;
      if (body.pinned !== undefined) {
        updates.pinnedAt = body.pinned ? new Date() : null;
      }
      if (body.mentionOnly !== undefined) updates.mentionOnly = body.mentionOnly;

      const [conv] = await db
        .update(conversations)
        .set(updates)
        .where(
          and(
            eq(conversations.id, request.params.id),
            eq(conversations.userId, user.id)
          )
        )
        .returning();

      if (!conv) {
        return reply.status(404).send({ error: "Conversation not found" });
      }

      return reply.send(conv);
    }
  );

  // Delete conversation (messages cascade)
  app.delete<{ Params: { id: string } }>(
    "/api/conversations/:id",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [conv] = await db
        .delete(conversations)
        .where(
          and(
            eq(conversations.id, request.params.id),
            eq(conversations.userId, user.id)
          )
        )
        .returning();

      if (!conv) {
        return reply.status(404).send({ error: "Conversation not found" });
      }

      return reply.status(204).send();
    }
  );

  // Clear all messages in a conversation (/clear command)
  app.delete<{ Params: { id: string } }>(
    "/api/conversations/:id/messages",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      // Verify ownership
      const [conv] = await db
        .select({ id: conversations.id })
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

      // Count messages before deleting
      const [{ count: msgCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.conversationId, request.params.id));

      // Delete all messages
      await db
        .delete(messages)
        .where(eq(messages.conversationId, request.params.id));

      return reply.send({ success: true, deleted: msgCount });
    }
  );

  // Mark conversation as read
  app.put<{ Params: { id: string } }>(
    "/api/conversations/:id/read",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      // Verify conversation belongs to user
      const [conv] = await db
        .select({ id: conversations.id })
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

      // Get max seq
      const [{ maxSeq }] = await db
        .select({
          maxSeq: sql<number>`COALESCE(MAX(${messages.seq}), 0)`,
        })
        .from(messages)
        .where(eq(messages.conversationId, conv.id));

      // Upsert conversation_reads
      await db.execute(sql`
        INSERT INTO conversation_reads (id, user_id, conversation_id, last_read_seq, updated_at)
        VALUES (gen_random_uuid(), ${user.id}, ${conv.id}, ${maxSeq}, NOW())
        ON CONFLICT (user_id, conversation_id)
        DO UPDATE SET
          last_read_seq = GREATEST(conversation_reads.last_read_seq, EXCLUDED.last_read_seq),
          updated_at = NOW()
      `);

      return reply.send({ lastReadSeq: maxSeq });
    }
  );

  // Toggle mute on a conversation
  app.put<{ Params: { id: string } }>(
    "/api/conversations/:id/mute",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      const { muted } = request.body as { muted: boolean };

      // Verify conversation belongs to user
      const [conv] = await db
        .select({ id: conversations.id })
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

      // Upsert conversation_reads with muted flag
      await db.execute(sql`
        INSERT INTO conversation_reads (id, user_id, conversation_id, last_read_seq, muted, updated_at)
        VALUES (gen_random_uuid(), ${user.id}, ${conv.id}, 0, ${muted}, NOW())
        ON CONFLICT (user_id, conversation_id)
        DO UPDATE SET muted = ${muted}, updated_at = NOW()
      `);

      return reply.send({ muted });
    }
  );

  // Get conversation status info (/status command)
  app.get<{ Params: { id: string } }>(
    "/api/conversations/:id/status",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

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

      // Count messages
      const [{ count: msgCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.conversationId, conv.id));

      // Get agent info
      let agentInfo = null;
      if (conv.agentId) {
        const [agent] = await db
          .select()
          .from(agents)
          .where(eq(agents.id, conv.agentId));

        if (agent) {
          let status: "online" | "offline" | "error" = "offline";
          let latencyMs: number | null = null;

          if (agent.a2aEndpoint) {
            try {
              const start = Date.now();
              const res = await fetch(agent.a2aEndpoint, {
                method: "GET",
                signal: AbortSignal.timeout(5000),
              });
              latencyMs = Date.now() - start;
              status = res.ok ? "online" : "error";
            } catch {
              status = "offline";
            }
          }

          agentInfo = {
            id: agent.id,
            name: agent.name,
            a2aEndpoint: agent.a2aEndpoint,
            status,
            latencyMs,
          };
        }
      }

      return reply.send({
        conversation: {
          id: conv.id,
          title: conv.title,
          type: conv.type,
          createdAt: conv.createdAt,
          messageCount: msgCount,
        },
        agent: agentInfo,
      });
    }
  );
}
