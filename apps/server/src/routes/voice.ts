import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import { getIceServers } from "../lib/mediasoup.js";

export async function voiceRoutes(app: FastifyInstance) {
  // GET /api/voice/ice-servers — returns ICE server list for WebRTC
  app.get("/api/voice/ice-servers", async (request, reply) => {
    await requireAuth(request, reply);
    return reply.send({ iceServers: getIceServers() });
  });
}
