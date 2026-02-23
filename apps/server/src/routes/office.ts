import type { FastifyInstance } from "fastify";
import { officeState, handleSSEConnection, isHealthy } from "@arinova-ai/openclaw-office-plugin";
import { requireAuth } from "../middleware/auth.js";

export async function officeRoutes(app: FastifyInstance) {
  // Health check — frontend uses this to detect if the office plugin is active
  app.get("/api/office/status", async (request, reply) => {
    await requireAuth(request, reply);

    if (!isHealthy()) {
      return { connected: false, timestamp: new Date().toISOString() };
    }

    const snapshot = officeState.snapshot();
    return {
      connected: true,
      agents: snapshot.agents,
      timestamp: new Date().toISOString(),
    };
  });

  // SSE stream — real-time agent status updates
  app.get("/api/office/stream", async (request, reply) => {
    await requireAuth(request, reply);

    if (!isHealthy()) {
      return reply.status(503).send({ error: "Office plugin not connected" });
    }

    // Tell Fastify we're handling the response manually
    reply.hijack();

    handleSSEConnection(reply.raw);
  });
}
