import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { agents } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { redis } from "../db/redis.js";

const HEALTH_CACHE_TTL = 60; // seconds

export async function agentHealthRoutes(app: FastifyInstance) {
  // Check health of a single agent
  app.get<{ Params: { id: string } }>(
    "/api/agents/:id/health",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [agent] = await db
        .select()
        .from(agents)
        .where(eq(agents.id, request.params.id));

      if (!agent || agent.ownerId !== user.id) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      // Check cache first
      const cacheKey = `agent:health:${agent.id}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }

      const result = await checkAgentHealth(agent.a2aEndpoint);

      // Cache the result
      await redis.setex(cacheKey, HEALTH_CACHE_TTL, JSON.stringify(result));

      return reply.send(result);
    }
  );

  // Batch check health of all user's agents
  app.get("/api/agents/health", async (request, reply) => {
    const user = await requireAuth(request, reply);

    const userAgents = await db
      .select()
      .from(agents)
      .where(eq(agents.ownerId, user.id));

    const results = await Promise.all(
      userAgents.map(async (agent) => {
        const cacheKey = `agent:health:${agent.id}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          return { agentId: agent.id, ...JSON.parse(cached) };
        }

        const result = await checkAgentHealth(agent.a2aEndpoint);
        await redis.setex(cacheKey, HEALTH_CACHE_TTL, JSON.stringify(result));
        return { agentId: agent.id, ...result };
      })
    );

    return reply.send(results);
  });
}

async function checkAgentHealth(endpoint: string): Promise<{
  status: "online" | "offline" | "error";
  latencyMs: number | null;
  checkedAt: string;
}> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(endpoint, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - start;

    return {
      status: res.ok ? "online" : "error",
      latencyMs,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      status: "offline",
      latencyMs: null,
      checkedAt: new Date().toISOString(),
    };
  }
}
