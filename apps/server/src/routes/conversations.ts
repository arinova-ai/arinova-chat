import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  conversations,
  agents,
  messages,
  conversationMembers,
} from "../db/schema.js";
import { eq, and, desc, ilike, or, sql } from "drizzle-orm";
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
        .where(
          query
            ? and(
                eq(conversations.userId, user.id),
                ilike(conversations.title, `%${query}%`)
              )
            : eq(conversations.userId, user.id)
        )
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

          // Also search by agent name for direct conversations
          if (query && conv.type === "direct") {
            const nameMatch = agentName
              .toLowerCase()
              .includes(query.toLowerCase());
            const titleMatch = conv.title
              ?.toLowerCase()
              .includes(query.toLowerCase());
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
}
