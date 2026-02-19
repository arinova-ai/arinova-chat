import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  conversations,
  agents,
  messages,
  conversationMembers,
  conversationReads,
} from "../db/schema.js";
import { eq, and, desc, or, sql } from "drizzle-orm";
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

  // List conversations with last message preview and agent info
  app.get<{ Querystring: { q?: string } }>(
    "/api/conversations",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      const query = request.query.q;

      // Get all conversations (both direct and group)
      const allConvs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, user.id))
        .orderBy(
          desc(conversations.pinnedAt),
          desc(conversations.updatedAt)
        );

      // Enrich each conversation with agent info and last message
      const result = await Promise.all(
        allConvs.map(async (conv) => {
          let agentName = "Unknown";
          let agentDescription: string | null = null;
          let agentAvatarUrl: string | null = null;

          if (conv.type === "direct" && conv.agentId) {
            // Direct: get single agent info
            const [agent] = await db
              .select()
              .from(agents)
              .where(eq(agents.id, conv.agentId));
            if (agent) {
              agentName = agent.name;
              agentDescription = agent.description;
              agentAvatarUrl = agent.avatarUrl;
            }
          } else if (conv.type === "group") {
            // Group: get member names
            const members = await db
              .select({ name: agents.name })
              .from(conversationMembers)
              .innerJoin(agents, eq(conversationMembers.agentId, agents.id))
              .where(eq(conversationMembers.conversationId, conv.id));
            agentName = members.map((m) => m.name).join(", ") || "Empty group";
            agentDescription = `${members.length} agent${members.length !== 1 ? "s" : ""}`;
          }

          // Filter by search query (title or agent name)
          if (query) {
            const q = query.toLowerCase();
            const nameMatch = agentName.toLowerCase().includes(q);
            const titleMatch = conv.title?.toLowerCase().includes(q);
            if (!nameMatch && !titleMatch) return null;
          }

          const [lastMessage] = await db
            .select()
            .from(messages)
            .where(eq(messages.conversationId, conv.id))
            .orderBy(desc(messages.createdAt))
            .limit(1);

          return {
            ...conv,
            agentName,
            agentDescription,
            agentAvatarUrl,
            lastMessage: lastMessage ?? null,
          };
        })
      );

      // Filter out nulls (from search mismatches)
      return reply.send(result.filter(Boolean));
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
      const body = request.body as { title?: string; pinned?: boolean };

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.title !== undefined) updates.title = body.title;
      if (body.pinned !== undefined) {
        updates.pinnedAt = body.pinned ? new Date() : null;
      }

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
