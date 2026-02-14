import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  communities,
  channels,
  communityMembers,
  channelMessages,
  agents,
  user,
} from "../db/schema.js";
import { eq, and, desc, ilike, asc, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import {
  createCommunitySchema,
  updateCommunitySchema,
  createChannelSchema,
  updateChannelSchema,
} from "@arinova/shared/schemas";

export async function communityRoutes(app: FastifyInstance) {
  // Create community
  app.post("/api/communities", async (request, reply) => {
    const usr = await requireAuth(request, reply);
    const body = createCommunitySchema.parse(request.body);

    const [community] = await db
      .insert(communities)
      .values({
        name: body.name,
        description: body.description ?? null,
        ownerId: usr.id,
        isPublic: body.isPublic ?? true,
      })
      .returning();

    // Auto-add owner as member with "owner" role
    await db.insert(communityMembers).values({
      communityId: community.id,
      userId: usr.id,
      role: "owner",
    });

    // Create default "general" channel
    await db.insert(channels).values({
      communityId: community.id,
      name: "general",
      description: "General discussion",
      position: 0,
    });

    return reply.status(201).send(community);
  });

  // List user's communities
  app.get("/api/communities", async (request, reply) => {
    const usr = await requireAuth(request, reply);

    const result = await db
      .select({
        id: communities.id,
        name: communities.name,
        description: communities.description,
        avatarUrl: communities.avatarUrl,
        ownerId: communities.ownerId,
        isPublic: communities.isPublic,
        createdAt: communities.createdAt,
        updatedAt: communities.updatedAt,
        role: communityMembers.role,
      })
      .from(communityMembers)
      .innerJoin(
        communities,
        eq(communityMembers.communityId, communities.id)
      )
      .where(eq(communityMembers.userId, usr.id))
      .orderBy(desc(communities.updatedAt));

    return reply.send(result);
  });

  // Browse public communities
  app.get<{ Querystring: { q?: string; page?: string; limit?: string } }>(
    "/api/communities/browse",
    async (request, reply) => {
      await requireAuth(request, reply);
      const q = request.query.q;
      const page = Math.max(1, Number(request.query.page) || 1);
      const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 20));
      const offset = (page - 1) * limit;

      const where = q
        ? and(
            eq(communities.isPublic, true),
            ilike(communities.name, `%${q}%`)
          )
        : eq(communities.isPublic, true);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(communities)
        .where(where);

      const result = await db
        .select()
        .from(communities)
        .where(where)
        .orderBy(desc(communities.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send({
        communities: result,
        pagination: {
          page,
          limit,
          total: countResult.count,
          totalPages: Math.ceil(countResult.count / limit),
        },
      });
    }
  );

  // Get community details
  app.get<{ Params: { id: string } }>(
    "/api/communities/:id",
    async (request, reply) => {
      const usr = await requireAuth(request, reply);

      const [community] = await db
        .select()
        .from(communities)
        .where(eq(communities.id, request.params.id));

      if (!community) {
        return reply.status(404).send({ error: "Community not found" });
      }

      // Check membership
      const [membership] = await db
        .select()
        .from(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, community.id),
            eq(communityMembers.userId, usr.id)
          )
        );

      if (!membership && !community.isPublic) {
        return reply.status(403).send({ error: "Not a member of this community" });
      }

      const chans = await db
        .select()
        .from(channels)
        .where(eq(channels.communityId, community.id))
        .orderBy(asc(channels.position), asc(channels.createdAt));

      const memberCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(communityMembers)
        .where(eq(communityMembers.communityId, community.id));

      return reply.send({
        ...community,
        channels: chans,
        memberCount: memberCount[0].count,
        membership: membership ?? null,
      });
    }
  );

  // Update community
  app.put<{ Params: { id: string } }>(
    "/api/communities/:id",
    async (request, reply) => {
      const usr = await requireAuth(request, reply);
      const body = updateCommunitySchema.parse(request.body);

      // Check owner/admin
      const [membership] = await db
        .select()
        .from(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, usr.id)
          )
        );

      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        return reply.status(403).send({ error: "Only owners and admins can update community" });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.isPublic !== undefined) updates.isPublic = body.isPublic;

      const [updated] = await db
        .update(communities)
        .set(updates)
        .where(eq(communities.id, request.params.id))
        .returning();

      return reply.send(updated);
    }
  );

  // Delete community
  app.delete<{ Params: { id: string } }>(
    "/api/communities/:id",
    async (request, reply) => {
      const usr = await requireAuth(request, reply);

      const [community] = await db
        .select()
        .from(communities)
        .where(
          and(
            eq(communities.id, request.params.id),
            eq(communities.ownerId, usr.id)
          )
        );

      if (!community) {
        return reply.status(404).send({ error: "Community not found or not owned by you" });
      }

      await db.delete(communities).where(eq(communities.id, request.params.id));
      return reply.status(204).send();
    }
  );

  // Join community
  app.post<{ Params: { id: string } }>(
    "/api/communities/:id/join",
    async (request, reply) => {
      const usr = await requireAuth(request, reply);

      const [community] = await db
        .select()
        .from(communities)
        .where(eq(communities.id, request.params.id));

      if (!community) {
        return reply.status(404).send({ error: "Community not found" });
      }

      if (!community.isPublic) {
        return reply.status(403).send({ error: "This community is private" });
      }

      // Check if already member
      const [existing] = await db
        .select()
        .from(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, community.id),
            eq(communityMembers.userId, usr.id)
          )
        );

      if (existing) {
        return reply.status(409).send({ error: "Already a member" });
      }

      const [member] = await db
        .insert(communityMembers)
        .values({
          communityId: community.id,
          userId: usr.id,
          role: "member",
        })
        .returning();

      return reply.status(201).send(member);
    }
  );

  // Leave community
  app.post<{ Params: { id: string } }>(
    "/api/communities/:id/leave",
    async (request, reply) => {
      const usr = await requireAuth(request, reply);

      // Can't leave if owner
      const [community] = await db
        .select()
        .from(communities)
        .where(eq(communities.id, request.params.id));

      if (!community) {
        return reply.status(404).send({ error: "Community not found" });
      }

      if (community.ownerId === usr.id) {
        return reply.status(400).send({ error: "Owner cannot leave community. Transfer ownership or delete it." });
      }

      await db
        .delete(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, usr.id)
          )
        );

      return reply.status(204).send();
    }
  );

  // Get community members
  app.get<{ Params: { id: string } }>(
    "/api/communities/:id/members",
    async (request, reply) => {
      const usr = await requireAuth(request, reply);

      const members = await db
        .select({
          id: communityMembers.id,
          userId: communityMembers.userId,
          role: communityMembers.role,
          joinedAt: communityMembers.joinedAt,
          userName: user.name,
          userImage: user.image,
        })
        .from(communityMembers)
        .innerJoin(user, eq(communityMembers.userId, user.id))
        .where(eq(communityMembers.communityId, request.params.id))
        .orderBy(asc(communityMembers.joinedAt));

      return reply.send(members);
    }
  );

  // Update member role (promote/demote)
  app.put<{ Params: { id: string; userId: string } }>(
    "/api/communities/:id/members/:userId",
    async (request, reply) => {
      const usr = await requireAuth(request, reply);
      const { role } = request.body as { role: string };

      if (!["admin", "member"].includes(role)) {
        return reply.status(400).send({ error: "Invalid role. Must be 'admin' or 'member'" });
      }

      // Check that requester is owner
      const [requesterMembership] = await db
        .select()
        .from(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, usr.id)
          )
        );

      if (!requesterMembership || requesterMembership.role !== "owner") {
        return reply.status(403).send({ error: "Only the owner can change member roles" });
      }

      // Can't change owner's own role
      if (request.params.userId === usr.id) {
        return reply.status(400).send({ error: "Cannot change your own role" });
      }

      const [updated] = await db
        .update(communityMembers)
        .set({ role: role as "admin" | "member" })
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, request.params.userId)
          )
        )
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: "Member not found" });
      }

      return reply.send(updated);
    }
  );

  // Kick member
  app.delete<{ Params: { id: string; userId: string } }>(
    "/api/communities/:id/members/:userId",
    async (request, reply) => {
      const usr = await requireAuth(request, reply);

      // Check that requester is owner or admin
      const [requesterMembership] = await db
        .select()
        .from(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, usr.id)
          )
        );

      if (!requesterMembership || requesterMembership.role === "member") {
        return reply.status(403).send({ error: "Only owners and admins can kick members" });
      }

      // Check target's role
      const [targetMembership] = await db
        .select()
        .from(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, request.params.userId)
          )
        );

      if (!targetMembership) {
        return reply.status(404).send({ error: "Member not found" });
      }

      // Can't kick owner
      if (targetMembership.role === "owner") {
        return reply.status(400).send({ error: "Cannot kick the owner" });
      }

      // Admins can't kick other admins
      if (requesterMembership.role === "admin" && targetMembership.role === "admin") {
        return reply.status(403).send({ error: "Admins cannot kick other admins" });
      }

      await db
        .delete(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, request.params.userId)
          )
        );

      return reply.status(204).send();
    }
  );

  // Transfer ownership
  app.post<{ Params: { id: string } }>(
    "/api/communities/:id/transfer-ownership",
    async (request, reply) => {
      const usr = await requireAuth(request, reply);
      const { userId: newOwnerId } = request.body as { userId: string };

      if (!newOwnerId) {
        return reply.status(400).send({ error: "userId is required" });
      }

      // Verify requester is owner
      const [community] = await db
        .select()
        .from(communities)
        .where(
          and(
            eq(communities.id, request.params.id),
            eq(communities.ownerId, usr.id)
          )
        );

      if (!community) {
        return reply.status(403).send({ error: "Only the owner can transfer ownership" });
      }

      // Verify new owner is a member
      const [newOwnerMembership] = await db
        .select()
        .from(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, newOwnerId)
          )
        );

      if (!newOwnerMembership) {
        return reply.status(404).send({ error: "User is not a member of this community" });
      }

      // Transfer: update community owner, set new owner role, set old owner to admin
      await db
        .update(communities)
        .set({ ownerId: newOwnerId, updatedAt: new Date() })
        .where(eq(communities.id, request.params.id));

      await db
        .update(communityMembers)
        .set({ role: "owner" })
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, newOwnerId)
          )
        );

      await db
        .update(communityMembers)
        .set({ role: "admin" })
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, usr.id)
          )
        );

      return reply.send({ message: "Ownership transferred" });
    }
  );

  // ===== Channel routes =====

  // Create channel
  app.post<{ Params: { id: string } }>(
    "/api/communities/:id/channels",
    async (request, reply) => {
      const usr = await requireAuth(request, reply);
      const body = createChannelSchema.parse(request.body);

      // Check admin/owner
      const [membership] = await db
        .select()
        .from(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, usr.id)
          )
        );

      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        return reply.status(403).send({ error: "Only owners and admins can create channels" });
      }

      // Get max position
      const [maxPos] = await db
        .select({ max: sql<number>`coalesce(max(${channels.position}), -1)` })
        .from(channels)
        .where(eq(channels.communityId, request.params.id));

      const [channel] = await db
        .insert(channels)
        .values({
          communityId: request.params.id,
          name: body.name,
          description: body.description ?? null,
          agentId: body.agentId ?? null,
          position: (maxPos.max ?? -1) + 1,
        })
        .returning();

      return reply.status(201).send(channel);
    }
  );

  // Update channel
  app.put<{ Params: { id: string; channelId: string } }>(
    "/api/communities/:id/channels/:channelId",
    async (request, reply) => {
      const usr = await requireAuth(request, reply);
      const body = updateChannelSchema.parse(request.body);

      const [membership] = await db
        .select()
        .from(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, usr.id)
          )
        );

      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        return reply.status(403).send({ error: "Only owners and admins can update channels" });
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (body.name !== undefined) updates.name = body.name;
      if (body.description !== undefined) updates.description = body.description;
      if (body.agentId !== undefined) updates.agentId = body.agentId;

      const [updated] = await db
        .update(channels)
        .set(updates)
        .where(
          and(
            eq(channels.id, request.params.channelId),
            eq(channels.communityId, request.params.id)
          )
        )
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: "Channel not found" });
      }

      return reply.send(updated);
    }
  );

  // Delete channel
  app.delete<{ Params: { id: string; channelId: string } }>(
    "/api/communities/:id/channels/:channelId",
    async (request, reply) => {
      const usr = await requireAuth(request, reply);

      const [membership] = await db
        .select()
        .from(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, usr.id)
          )
        );

      if (!membership || membership.role !== "owner") {
        return reply.status(403).send({ error: "Only owners can delete channels" });
      }

      await db
        .delete(channels)
        .where(
          and(
            eq(channels.id, request.params.channelId),
            eq(channels.communityId, request.params.id)
          )
        );

      return reply.status(204).send();
    }
  );

  // Get channel messages
  app.get<{
    Params: { id: string; channelId: string };
    Querystring: { cursor?: string; limit?: string };
  }>(
    "/api/communities/:id/channels/:channelId/messages",
    async (request, reply) => {
      const usr = await requireAuth(request, reply);
      const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 50));

      // Verify membership
      const [membership] = await db
        .select()
        .from(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, usr.id)
          )
        );

      if (!membership) {
        return reply.status(403).send({ error: "Not a member" });
      }

      const msgs = await db
        .select({
          id: channelMessages.id,
          channelId: channelMessages.channelId,
          userId: channelMessages.userId,
          role: channelMessages.role,
          content: channelMessages.content,
          status: channelMessages.status,
          createdAt: channelMessages.createdAt,
          updatedAt: channelMessages.updatedAt,
          userName: user.name,
          userImage: user.image,
        })
        .from(channelMessages)
        .leftJoin(user, eq(channelMessages.userId, user.id))
        .where(eq(channelMessages.channelId, request.params.channelId))
        .orderBy(desc(channelMessages.createdAt))
        .limit(limit + 1);

      const hasMore = msgs.length > limit;
      const messages = msgs.slice(0, limit).reverse();

      return reply.send({ messages, hasMore });
    }
  );

  // Send message to channel
  app.post<{ Params: { id: string; channelId: string } }>(
    "/api/communities/:id/channels/:channelId/messages",
    async (request, reply) => {
      const usr = await requireAuth(request, reply);
      const { content } = request.body as { content: string };

      if (!content?.trim()) {
        return reply.status(400).send({ error: "Message content is required" });
      }

      // Verify membership
      const [membership] = await db
        .select()
        .from(communityMembers)
        .where(
          and(
            eq(communityMembers.communityId, request.params.id),
            eq(communityMembers.userId, usr.id)
          )
        );

      if (!membership) {
        return reply.status(403).send({ error: "Not a member" });
      }

      // Save user message
      const [msg] = await db
        .insert(channelMessages)
        .values({
          channelId: request.params.channelId,
          userId: usr.id,
          role: "user",
          content: content.trim(),
          status: "completed",
        })
        .returning();

      // Check if channel has an agent
      const [channel] = await db
        .select()
        .from(channels)
        .where(eq(channels.id, request.params.channelId));

      // TODO: If channel has agentId, trigger A2A streaming response
      // For now, just return the user message
      return reply.status(201).send(msg);
    }
  );
}
