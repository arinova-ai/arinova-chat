import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  playgrounds,
  playgroundSessions,
  playgroundParticipants,
  playgroundMessages,
} from "../db/schema.js";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import {
  createPlaygroundSchema,
  joinPlaygroundSchema,
} from "@arinova/shared/schemas";
import type { PlaygroundDefinition } from "@arinova/shared/types";
import {
  BUILT_IN_TEMPLATES,
  getTemplateList,
} from "../lib/playground-templates.js";

export async function playgroundRoutes(app: FastifyInstance) {
  // ===== Templates =====

  // List available templates
  app.get("/api/playgrounds/templates", async (request, reply) => {
    await requireAuth(request, reply);
    return reply.send(getTemplateList());
  });

  // Deploy a template as a new playground
  app.post<{ Params: { slug: string } }>(
    "/api/playgrounds/templates/:slug/deploy",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      const template = BUILT_IN_TEMPLATES[request.params.slug];

      if (!template) {
        return reply.status(404).send({ error: "Template not found" });
      }

      const [playground] = await db
        .insert(playgrounds)
        .values({
          ownerId: user.id,
          name: template.metadata.name,
          description: template.metadata.description,
          category: template.metadata.category,
          tags: template.metadata.tags ?? [],
          definition: template,
          isPublic: true,
        })
        .returning();

      return reply.status(201).send(playground);
    }
  );

  // ===== Playground CRUD =====

  // Create playground
  app.post("/api/playgrounds", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const body = createPlaygroundSchema.parse(request.body);
    const def = body.definition;

    const [playground] = await db
      .insert(playgrounds)
      .values({
        ownerId: user.id,
        name: def.metadata.name,
        description: def.metadata.description,
        category: def.metadata.category,
        tags: def.metadata.tags ?? [],
        definition: def,
        isPublic: body.isPublic ?? true,
      })
      .returning();

    return reply.status(201).send(playground);
  });

  // List playgrounds (public + own private)
  app.get<{
    Querystring: {
      page?: string;
      limit?: string;
      search?: string;
      category?: string;
    };
  }>("/api/playgrounds", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(request.query.limit ?? "20", 10)));
    const offset = (page - 1) * limit;
    const { search, category } = request.query;

    const conditions = [
      or(eq(playgrounds.isPublic, true), eq(playgrounds.ownerId, user.id)),
    ];

    if (category) {
      conditions.push(
        eq(playgrounds.category, category as typeof playgrounds.category.enumValues[number])
      );
    }

    if (search) {
      conditions.push(
        or(
          ilike(playgrounds.name, `%${search}%`),
          ilike(playgrounds.description, `%${search}%`),
        )!
      );
    }

    const where = and(...conditions);

    const [items, [{ count }]] = await Promise.all([
      db
        .select({
          id: playgrounds.id,
          ownerId: playgrounds.ownerId,
          name: playgrounds.name,
          description: playgrounds.description,
          category: playgrounds.category,
          tags: playgrounds.tags,
          isPublic: playgrounds.isPublic,
          definition: playgrounds.definition,
          createdAt: playgrounds.createdAt,
          updatedAt: playgrounds.updatedAt,
        })
        .from(playgrounds)
        .where(where)
        .orderBy(desc(playgrounds.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(playgrounds)
        .where(where),
    ]);

    return reply.send({
      items,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  });

  // Get playground detail
  app.get<{ Params: { id: string } }>(
    "/api/playgrounds/:id",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [playground] = await db
        .select()
        .from(playgrounds)
        .where(
          and(
            eq(playgrounds.id, request.params.id),
            or(eq(playgrounds.isPublic, true), eq(playgrounds.ownerId, user.id)),
          )
        );

      if (!playground) {
        return reply.status(404).send({ error: "Playground not found" });
      }

      // Get active session info
      const [activeSession] = await db
        .select({
          id: playgroundSessions.id,
          status: playgroundSessions.status,
          currentPhase: playgroundSessions.currentPhase,
          participantCount: sql<number>`(
            SELECT count(*)::int FROM ${playgroundParticipants}
            WHERE ${playgroundParticipants.sessionId} = ${playgroundSessions.id}
          )`,
          createdAt: playgroundSessions.createdAt,
        })
        .from(playgroundSessions)
        .where(
          and(
            eq(playgroundSessions.playgroundId, playground.id),
            sql`${playgroundSessions.status} IN ('waiting', 'active', 'paused')`,
          )
        )
        .orderBy(desc(playgroundSessions.createdAt))
        .limit(1);

      return reply.send({
        ...playground,
        activeSession: activeSession ?? null,
      });
    }
  );

  // Delete playground (owner only)
  app.delete<{ Params: { id: string } }>(
    "/api/playgrounds/:id",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [playground] = await db
        .select({ id: playgrounds.id })
        .from(playgrounds)
        .where(
          and(eq(playgrounds.id, request.params.id), eq(playgrounds.ownerId, user.id))
        );

      if (!playground) {
        return reply.status(404).send({ error: "Playground not found" });
      }

      // Sessions, participants, messages cascade via FK
      await db.delete(playgrounds).where(eq(playgrounds.id, playground.id));

      return reply.status(204).send();
    }
  );

  // ===== Session API =====

  // Create a new session for a playground
  app.post<{ Params: { id: string } }>(
    "/api/playgrounds/:id/sessions",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [playground] = await db
        .select()
        .from(playgrounds)
        .where(
          and(
            eq(playgrounds.id, request.params.id),
            or(eq(playgrounds.isPublic, true), eq(playgrounds.ownerId, user.id)),
          )
        );

      if (!playground) {
        return reply.status(404).send({ error: "Playground not found" });
      }

      // Check no active session already exists
      const [existing] = await db
        .select({ id: playgroundSessions.id })
        .from(playgroundSessions)
        .where(
          and(
            eq(playgroundSessions.playgroundId, playground.id),
            sql`${playgroundSessions.status} IN ('waiting', 'active', 'paused')`,
          )
        );

      if (existing) {
        return reply.status(409).send({
          error: "An active session already exists for this playground",
          sessionId: existing.id,
        });
      }

      const def = playground.definition as PlaygroundDefinition;

      const [session] = await db
        .insert(playgroundSessions)
        .values({
          playgroundId: playground.id,
          status: "waiting",
          state: def.initialState,
        })
        .returning();

      // Auto-join the creator as host (first participant)
      const body = joinPlaygroundSchema.parse(request.body ?? {});

      const [participant] = await db
        .insert(playgroundParticipants)
        .values({
          sessionId: session.id,
          userId: user.id,
          agentId: body.agentId ?? null,
          controlMode: body.controlMode ?? "human",
        })
        .returning();

      return reply.status(201).send({ ...session, participants: [participant] });
    }
  );

  // Join a session
  app.post<{ Params: { id: string; sessionId: string } }>(
    "/api/playgrounds/:id/sessions/:sessionId/join",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      const body = joinPlaygroundSchema.parse(request.body);

      const [session] = await db
        .select()
        .from(playgroundSessions)
        .where(
          and(
            eq(playgroundSessions.id, request.params.sessionId),
            eq(playgroundSessions.playgroundId, request.params.id),
          )
        );

      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }

      if (session.status !== "waiting") {
        return reply.status(400).send({ error: "Session is not accepting new players" });
      }

      // Check if already joined
      const [existing] = await db
        .select({ id: playgroundParticipants.id })
        .from(playgroundParticipants)
        .where(
          and(
            eq(playgroundParticipants.sessionId, session.id),
            eq(playgroundParticipants.userId, user.id),
          )
        );

      if (existing) {
        return reply.status(409).send({ error: "Already joined this session" });
      }

      // Check max players
      const [playground] = await db
        .select({ definition: playgrounds.definition })
        .from(playgrounds)
        .where(eq(playgrounds.id, request.params.id));

      const def = playground!.definition as PlaygroundDefinition;

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(playgroundParticipants)
        .where(eq(playgroundParticipants.sessionId, session.id));

      if (count >= def.metadata.maxPlayers) {
        return reply.status(400).send({ error: "Session is full" });
      }

      const [participant] = await db
        .insert(playgroundParticipants)
        .values({
          sessionId: session.id,
          userId: user.id,
          agentId: body.agentId ?? null,
          controlMode: body.controlMode ?? "human",
        })
        .returning();

      return reply.status(201).send(participant);
    }
  );

  // Leave a session
  app.post<{ Params: { id: string; sessionId: string } }>(
    "/api/playgrounds/:id/sessions/:sessionId/leave",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [participant] = await db
        .select({ id: playgroundParticipants.id })
        .from(playgroundParticipants)
        .where(
          and(
            eq(playgroundParticipants.sessionId, request.params.sessionId),
            eq(playgroundParticipants.userId, user.id),
          )
        );

      if (!participant) {
        return reply.status(404).send({ error: "Not a participant in this session" });
      }

      await db
        .delete(playgroundParticipants)
        .where(eq(playgroundParticipants.id, participant.id));

      return reply.status(204).send();
    }
  );

  // Start a session (host only — first participant)
  app.post<{ Params: { id: string; sessionId: string } }>(
    "/api/playgrounds/:id/sessions/:sessionId/start",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [session] = await db
        .select()
        .from(playgroundSessions)
        .where(
          and(
            eq(playgroundSessions.id, request.params.sessionId),
            eq(playgroundSessions.playgroundId, request.params.id),
          )
        );

      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }

      if (session.status !== "waiting") {
        return reply.status(400).send({ error: "Session is not in waiting state" });
      }

      // Verify host (first participant by joinedAt)
      const participants = await db
        .select()
        .from(playgroundParticipants)
        .where(eq(playgroundParticipants.sessionId, session.id))
        .orderBy(playgroundParticipants.joinedAt);

      if (participants.length === 0 || participants[0].userId !== user.id) {
        return reply.status(403).send({ error: "Only the host can start the session" });
      }

      // Check min players
      const [playground] = await db
        .select({ definition: playgrounds.definition })
        .from(playgrounds)
        .where(eq(playgrounds.id, request.params.id));

      const def = playground!.definition as PlaygroundDefinition;

      if (participants.length < def.metadata.minPlayers) {
        return reply.status(400).send({
          error: `Need at least ${def.metadata.minPlayers} players to start (currently ${participants.length})`,
        });
      }

      // Assign roles randomly
      const roleAssignments = assignRoles(def.roles, participants.length);

      for (let i = 0; i < participants.length; i++) {
        await db
          .update(playgroundParticipants)
          .set({ role: roleAssignments[i] })
          .where(eq(playgroundParticipants.id, participants[i].id));
      }

      // Start session
      const firstPhase = def.phases[0].name;
      const [updated] = await db
        .update(playgroundSessions)
        .set({
          status: "active",
          currentPhase: firstPhase,
          startedAt: new Date(),
        })
        .where(eq(playgroundSessions.id, session.id))
        .returning();

      // Build role map for response
      const roleMap: Record<string, string> = {};
      for (let i = 0; i < participants.length; i++) {
        roleMap[participants[i].id] = roleAssignments[i];
      }

      // Log phase transition
      await db.insert(playgroundMessages).values({
        sessionId: session.id,
        type: "phase_transition",
        content: JSON.stringify({ from: null, to: firstPhase }),
      });

      return reply.send({
        ...updated,
        roles: roleMap,
        phase: firstPhase,
      });
    }
  );

  // Get session detail (with role-filtered state — simplified for now)
  app.get<{ Params: { id: string; sessionId: string } }>(
    "/api/playgrounds/:id/sessions/:sessionId",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [session] = await db
        .select()
        .from(playgroundSessions)
        .where(
          and(
            eq(playgroundSessions.id, request.params.sessionId),
            eq(playgroundSessions.playgroundId, request.params.id),
          )
        );

      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }

      const participants = await db
        .select()
        .from(playgroundParticipants)
        .where(eq(playgroundParticipants.sessionId, session.id))
        .orderBy(playgroundParticipants.joinedAt);

      // Find current user's participant record for role filtering
      const myParticipant = participants.find((p) => p.userId === user.id);

      // Get playground definition for role-based filtering
      const [playground] = await db
        .select({ definition: playgrounds.definition })
        .from(playgrounds)
        .where(eq(playgrounds.id, request.params.id));

      const def = playground!.definition as PlaygroundDefinition;

      // Filter state based on user's role
      let filteredState = session.state;
      if (myParticipant?.role && session.status === "active") {
        const roleDef = def.roles.find((r) => r.name === myParticipant.role);
        if (roleDef) {
          filteredState = filterStateByRole(
            session.state as Record<string, unknown>,
            roleDef.visibleState,
          );
        }
      }

      return reply.send({
        ...session,
        state: filteredState,
        participants,
        myParticipantId: myParticipant?.id ?? null,
        myRole: myParticipant?.role ?? null,
      });
    }
  );
}

// ===== Helpers =====

/**
 * Assign roles to participants based on role definitions.
 * Respects minCount/maxCount constraints, fills randomly.
 */
function assignRoles(
  roles: PlaygroundDefinition["roles"],
  playerCount: number,
): string[] {
  const assignments: string[] = [];
  const pool: string[] = [];

  // First, fill mandatory minimums
  for (const role of roles) {
    const min = role.minCount ?? 0;
    for (let i = 0; i < min; i++) {
      assignments.push(role.name);
    }
  }

  // Build pool for remaining slots
  for (const role of roles) {
    const min = role.minCount ?? 0;
    const max = role.maxCount ?? playerCount;
    const remaining = max - min;
    for (let i = 0; i < remaining; i++) {
      pool.push(role.name);
    }
  }

  // Fill remaining slots from pool
  while (assignments.length < playerCount && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    assignments.push(pool[idx]);
    pool.splice(idx, 1);
  }

  // If still not enough (edge case), repeat last role
  while (assignments.length < playerCount) {
    assignments.push(roles[roles.length - 1].name);
  }

  // Shuffle assignments
  for (let i = assignments.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
  }

  return assignments;
}

/**
 * Filter playground state to only include keys visible to a role.
 */
function filterStateByRole(
  state: Record<string, unknown>,
  visibleState: string[],
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const key of visibleState) {
    if (key in state) {
      filtered[key] = state[key];
    }
  }
  return filtered;
}
