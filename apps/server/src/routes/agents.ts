import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { agents } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { createAgentSchema, updateAgentSchema } from "@arinova/shared/schemas";

export async function agentRoutes(app: FastifyInstance) {
  // Create agent
  app.post("/api/agents", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const body = createAgentSchema.parse(request.body);

    const [agent] = await db
      .insert(agents)
      .values({
        name: body.name,
        description: body.description ?? null,
        a2aEndpoint: body.a2aEndpoint,
        ownerId: user.id,
      })
      .returning();

    return reply.status(201).send(agent);
  });

  // List user's agents
  app.get("/api/agents", async (request, reply) => {
    const user = await requireAuth(request, reply);

    const result = await db
      .select()
      .from(agents)
      .where(eq(agents.ownerId, user.id))
      .orderBy(agents.createdAt);

    return reply.send(result);
  });

  // Get single agent
  app.get<{ Params: { id: string } }>(
    "/api/agents/:id",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [agent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, request.params.id), eq(agents.ownerId, user.id)));

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      return reply.send(agent);
    }
  );

  // Update agent
  app.put<{ Params: { id: string } }>(
    "/api/agents/:id",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      const body = updateAgentSchema.parse(request.body);

      const [agent] = await db
        .update(agents)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(agents.id, request.params.id), eq(agents.ownerId, user.id)))
        .returning();

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      return reply.send(agent);
    }
  );

  // Delete agent
  app.delete<{ Params: { id: string } }>(
    "/api/agents/:id",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [agent] = await db
        .delete(agents)
        .where(and(eq(agents.id, request.params.id), eq(agents.ownerId, user.id)))
        .returning();

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      return reply.status(204).send();
    }
  );
}
