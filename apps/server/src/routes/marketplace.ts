import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { agents } from "../db/schema.js";
import { eq, and, ilike, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

export async function marketplaceRoutes(app: FastifyInstance) {
  // Browse public agents
  app.get<{
    Querystring: { q?: string; category?: string; page?: string; limit?: string };
  }>("/api/marketplace", async (request, reply) => {
    await requireAuth(request, reply);

    const { q, category, page: pageStr, limit: limitStr } = request.query;
    const page = Math.max(1, parseInt(pageStr ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(limitStr ?? "20", 10)));
    const offset = (page - 1) * limit;

    const conditions = [eq(agents.isPublic, true)];

    if (q) {
      conditions.push(ilike(agents.name, `%${q}%`));
    }
    if (category) {
      conditions.push(eq(agents.category, category));
    }

    const [items, countResult] = await Promise.all([
      db
        .select({
          id: agents.id,
          name: agents.name,
          description: agents.description,
          avatarUrl: agents.avatarUrl,
          category: agents.category,
          usageCount: agents.usageCount,
          ownerId: agents.ownerId,
          createdAt: agents.createdAt,
        })
        .from(agents)
        .where(and(...conditions))
        .orderBy(desc(agents.usageCount))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(agents)
        .where(and(...conditions)),
    ]);

    const total = countResult[0]?.count ?? 0;

    return reply.send({
      agents: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  });

  // Add a public agent to your own collection (clone)
  app.post<{ Params: { id: string } }>(
    "/api/marketplace/:id/add",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [publicAgent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, request.params.id), eq(agents.isPublic, true)));

      if (!publicAgent) {
        return reply.status(404).send({ error: "Agent not found in marketplace" });
      }

      // Check if user already has an agent with the same endpoint
      const [existing] = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.ownerId, user.id),
            eq(agents.a2aEndpoint, publicAgent.a2aEndpoint)
          )
        );

      if (existing) {
        return reply.status(409).send({
          error: "You already have this agent",
          agent: existing,
        });
      }

      // Clone the agent for this user
      const [newAgent] = await db
        .insert(agents)
        .values({
          name: publicAgent.name,
          description: publicAgent.description,
          avatarUrl: publicAgent.avatarUrl,
          a2aEndpoint: publicAgent.a2aEndpoint,
          ownerId: user.id,
          category: publicAgent.category,
        })
        .returning();

      // Increment usage count on the original
      await db
        .update(agents)
        .set({ usageCount: sql`${agents.usageCount} + 1` })
        .where(eq(agents.id, publicAgent.id));

      return reply.status(201).send(newAgent);
    }
  );

  // Publish your agent to the marketplace
  app.post<{ Params: { id: string }; Body: { category?: string } }>(
    "/api/agents/:id/publish",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [agent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, request.params.id), eq(agents.ownerId, user.id)));

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      const body = request.body as { category?: string } | null;

      const [updated] = await db
        .update(agents)
        .set({
          isPublic: true,
          category: body?.category ?? agent.category,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agent.id))
        .returning();

      return reply.send(updated);
    }
  );

  // Unpublish your agent
  app.post<{ Params: { id: string } }>(
    "/api/agents/:id/unpublish",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [agent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, request.params.id), eq(agents.ownerId, user.id)));

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      const [updated] = await db
        .update(agents)
        .set({ isPublic: false, updatedAt: new Date() })
        .where(eq(agents.id, agent.id))
        .returning();

      return reply.send(updated);
    }
  );

  // Get marketplace categories
  app.get("/api/marketplace/categories", async (request, reply) => {
    await requireAuth(request, reply);

    const result = await db
      .select({
        category: agents.category,
        count: sql<number>`count(*)::int`,
      })
      .from(agents)
      .where(and(eq(agents.isPublic, true), sql`${agents.category} IS NOT NULL`))
      .groupBy(agents.category);

    return reply.send(result);
  });
}
