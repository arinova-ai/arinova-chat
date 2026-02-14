import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { conversations, conversationMembers, agents } from "../db/schema.js";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import {
  createGroupConversationSchema,
  addGroupMemberSchema,
} from "@arinova/shared/schemas";

export async function groupRoutes(app: FastifyInstance) {
  // Create group conversation
  app.post("/api/conversations/group", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const body = createGroupConversationSchema.parse(request.body);

    // Verify all agents exist and belong to user
    const userAgents = await db
      .select()
      .from(agents)
      .where(and(eq(agents.ownerId, user.id), inArray(agents.id, body.agentIds)));

    if (userAgents.length !== body.agentIds.length) {
      return reply.status(400).send({
        error: "One or more agents not found or not owned by you",
      });
    }

    // Create the group conversation
    const [conversation] = await db
      .insert(conversations)
      .values({
        title: body.title,
        type: "group",
        userId: user.id,
        agentId: null,
      })
      .returning();

    // Add all agents as members
    const members = await db
      .insert(conversationMembers)
      .values(
        body.agentIds.map((agentId) => ({
          conversationId: conversation.id,
          agentId,
        }))
      )
      .returning();

    return reply.status(201).send({
      ...conversation,
      members,
    });
  });

  // Get group members
  app.get<{ Params: { id: string } }>(
    "/api/conversations/:id/members",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      // Verify conversation exists and belongs to user
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

      // Get members with agent info
      const members = await db
        .select({
          id: conversationMembers.id,
          conversationId: conversationMembers.conversationId,
          agentId: conversationMembers.agentId,
          addedAt: conversationMembers.addedAt,
          agentName: agents.name,
          agentDescription: agents.description,
          agentAvatarUrl: agents.avatarUrl,
        })
        .from(conversationMembers)
        .innerJoin(agents, eq(conversationMembers.agentId, agents.id))
        .where(eq(conversationMembers.conversationId, request.params.id));

      return reply.send(members);
    }
  );

  // Add agent to group
  app.post<{ Params: { id: string } }>(
    "/api/conversations/:id/members",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      const body = addGroupMemberSchema.parse(request.body);

      // Verify conversation exists, belongs to user, and is a group
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

      if (conv.type !== "group") {
        return reply
          .status(400)
          .send({ error: "Cannot add members to a direct conversation" });
      }

      // Verify agent exists and belongs to user
      const [agent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, body.agentId), eq(agents.ownerId, user.id)));

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      // Check if agent is already a member
      const [existing] = await db
        .select()
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, request.params.id),
            eq(conversationMembers.agentId, body.agentId)
          )
        );

      if (existing) {
        return reply
          .status(409)
          .send({ error: "Agent is already a member of this group" });
      }

      const [member] = await db
        .insert(conversationMembers)
        .values({
          conversationId: request.params.id,
          agentId: body.agentId,
        })
        .returning();

      return reply.status(201).send(member);
    }
  );

  // Remove agent from group
  app.delete<{ Params: { id: string; agentId: string } }>(
    "/api/conversations/:id/members/:agentId",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      // Verify conversation exists, belongs to user, and is a group
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

      if (conv.type !== "group") {
        return reply
          .status(400)
          .send({ error: "Cannot remove members from a direct conversation" });
      }

      // Remove the member
      const [removed] = await db
        .delete(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, request.params.id),
            eq(conversationMembers.agentId, request.params.agentId)
          )
        )
        .returning();

      if (!removed) {
        return reply.status(404).send({ error: "Member not found in group" });
      }

      return reply.status(204).send();
    }
  );
}
