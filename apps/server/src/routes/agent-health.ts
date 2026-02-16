import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { agents } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { redis } from "../db/redis.js";
import { isAgentConnected } from "../ws/agent-handler.js";

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

      // WS connection is real-time — skip cache if connected
      if (isAgentConnected(agent.id)) {
        return reply.send({
          status: "online",
          mode: "websocket",
          latencyMs: 0,
          checkedAt: new Date().toISOString(),
        });
      }

      // Fallback: check A2A endpoint (legacy)
      const cacheKey = `agent:health:${agent.id}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        return reply.send(JSON.parse(cached));
      }

      const result = await checkAgentHealth(agent.a2aEndpoint);

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
        // WS connection is real-time
        if (isAgentConnected(agent.id)) {
          return {
            agentId: agent.id,
            status: "online",
            mode: "websocket",
            latencyMs: 0,
            checkedAt: new Date().toISOString(),
          };
        }

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

async function checkAgentHealth(endpoint: string | null): Promise<{
  status: "online" | "offline" | "error";
  latencyMs: number | null;
  checkedAt: string;
}> {
  if (!endpoint) {
    return {
      status: "offline",
      latencyMs: null,
      checkedAt: new Date().toISOString(),
    };
  }

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
