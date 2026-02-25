import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  playgrounds,
  playgroundSessions,
  playgroundParticipants,
  agents,
  user,
} from "../db/schema.js";
import { eq, and, desc, ilike, sql, count } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import {
  createSpaceSchema,
  joinSpaceSessionSchema,
} from "@arinova/shared/schemas";

export async function spaceRoutes(app: FastifyInstance) {
  // List spaces (search/category/pagination)
  app.get("/api/spaces", async (request, reply) => {
    await requireAuth(request, reply);

    const {
      search,
      category,
      page = "1",
      limit = "20",
    } = request.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(playgrounds.isPublic, true)];
    if (category) {
      conditions.push(eq(playgrounds.category, category as any));
    }
    if (search) {
      conditions.push(ilike(playgrounds.name, `%${search}%`));
    }

    const where = and(...conditions);

    const [spaces, [{ total }]] = await Promise.all([
      db
        .select({
          id: playgrounds.id,
          ownerId: playgrounds.ownerId,
          name: playgrounds.name,
          description: playgrounds.description,
          category: playgrounds.category,
          tags: playgrounds.tags,
          isPublic: playgrounds.isPublic,
          createdAt: playgrounds.createdAt,
          updatedAt: playgrounds.updatedAt,
        })
        .from(playgrounds)
        .where(where)
        .orderBy(desc(playgrounds.createdAt))
        .limit(limitNum)
        .offset(offset),
      db
        .select({ total: count() })
        .from(playgrounds)
        .where(where),
    ]);

    return reply.send({
      spaces,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  });

  // Get space detail + sessions
  app.get("/api/spaces/:id", async (request, reply) => {
    await requireAuth(request, reply);
    const { id } = request.params as { id: string };

    const [space] = await db
      .select()
      .from(playgrounds)
      .where(eq(playgrounds.id, id))
      .limit(1);

    if (!space) {
      return reply.status(404).send({ error: "Space not found" });
    }

    // Get owner info
    const [owner] = await db
      .select({ id: user.id, name: user.name, image: user.image })
      .from(user)
      .where(eq(user.id, space.ownerId))
      .limit(1);

    // Get sessions with participant counts
    const sessions = await db
      .select({
        id: playgroundSessions.id,
        playgroundId: playgroundSessions.playgroundId,
        status: playgroundSessions.status,
        state: playgroundSessions.state,
        currentPhase: playgroundSessions.currentPhase,
        prizePool: playgroundSessions.prizePool,
        startedAt: playgroundSessions.startedAt,
        finishedAt: playgroundSessions.finishedAt,
        createdAt: playgroundSessions.createdAt,
        participantCount: count(playgroundParticipants.id),
      })
      .from(playgroundSessions)
      .leftJoin(
        playgroundParticipants,
        and(
          eq(playgroundParticipants.sessionId, playgroundSessions.id),
          eq(playgroundParticipants.isConnected, true)
        )
      )
      .where(eq(playgroundSessions.playgroundId, id))
      .groupBy(playgroundSessions.id)
      .orderBy(desc(playgroundSessions.createdAt));

    return reply.send({
      ...space,
      owner,
      sessions,
    });
  });

  // Create space
  app.post("/api/spaces", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const body = createSpaceSchema.parse(request.body);

    const [space] = await db
      .insert(playgrounds)
      .values({
        ownerId: authUser.id,
        name: body.name,
        description: body.description,
        category: body.category,
        tags: body.tags ?? [],
        definition: body.definition ?? {},
        isPublic: body.isPublic ?? true,
      })
      .returning();

    return reply.status(201).send(space);
  });

  // Delete space (owner only)
  app.delete("/api/spaces/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const { id } = request.params as { id: string };

    const [space] = await db
      .select()
      .from(playgrounds)
      .where(eq(playgrounds.id, id))
      .limit(1);

    if (!space) {
      return reply.status(404).send({ error: "Space not found" });
    }
    if (space.ownerId !== authUser.id) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    await db.delete(playgrounds).where(eq(playgrounds.id, id));
    return reply.status(204).send();
  });

  // Create session
  app.post("/api/spaces/:id/sessions", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const { id } = request.params as { id: string };

    const [space] = await db
      .select()
      .from(playgrounds)
      .where(eq(playgrounds.id, id))
      .limit(1);

    if (!space) {
      return reply.status(404).send({ error: "Space not found" });
    }

    const [session] = await db
      .insert(playgroundSessions)
      .values({
        playgroundId: id,
        status: "waiting",
        state: {},
      })
      .returning();

    // Auto-join the creator
    const [participant] = await db
      .insert(playgroundParticipants)
      .values({
        sessionId: session.id,
        userId: authUser.id,
        controlMode: "human",
      })
      .returning();

    return reply.status(201).send({ ...session, participantCount: 1 });
  });

  // Join session
  app.post(
    "/api/spaces/:id/sessions/:sessionId/join",
    async (request, reply) => {
      const authUser = await requireAuth(request, reply);
      const { id, sessionId } = request.params as {
        id: string;
        sessionId: string;
      };

      const body = joinSpaceSessionSchema.parse(request.body ?? {});

      // Verify session exists and belongs to this space
      const [session] = await db
        .select()
        .from(playgroundSessions)
        .where(
          and(
            eq(playgroundSessions.id, sessionId),
            eq(playgroundSessions.playgroundId, id)
          )
        )
        .limit(1);

      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }

      if (session.status === "finished") {
        return reply.status(400).send({ error: "Session has ended" });
      }

      // Check if user already in session
      const [existing] = await db
        .select()
        .from(playgroundParticipants)
        .where(
          and(
            eq(playgroundParticipants.sessionId, sessionId),
            eq(playgroundParticipants.userId, authUser.id)
          )
        )
        .limit(1);

      if (existing) {
        // Reconnect
        await db
          .update(playgroundParticipants)
          .set({
            isConnected: true,
            agentId: body.agentId ?? existing.agentId,
          })
          .where(eq(playgroundParticipants.id, existing.id));

        return reply.send({ ...existing, isConnected: true });
      }

      // Validate agent if provided
      if (body.agentId) {
        const [agent] = await db
          .select()
          .from(agents)
          .where(eq(agents.id, body.agentId))
          .limit(1);

        if (!agent) {
          return reply.status(404).send({ error: "Agent not found" });
        }
      }

      const [participant] = await db
        .insert(playgroundParticipants)
        .values({
          sessionId,
          userId: authUser.id,
          agentId: body.agentId ?? null,
          role: body.role ?? null,
          controlMode: body.controlMode ?? "human",
        })
        .returning();

      return reply.status(201).send(participant);
    }
  );

  // Leave session (disconnect)
  app.post(
    "/api/spaces/:id/sessions/:sessionId/leave",
    async (request, reply) => {
      const authUser = await requireAuth(request, reply);
      const { sessionId } = request.params as {
        id: string;
        sessionId: string;
      };

      const [participant] = await db
        .select()
        .from(playgroundParticipants)
        .where(
          and(
            eq(playgroundParticipants.sessionId, sessionId),
            eq(playgroundParticipants.userId, authUser.id)
          )
        )
        .limit(1);

      if (!participant) {
        return reply.status(404).send({ error: "Not in this session" });
      }

      await db
        .update(playgroundParticipants)
        .set({ isConnected: false })
        .where(eq(playgroundParticipants.id, participant.id));

      return reply.status(204).send();
    }
  );
}
