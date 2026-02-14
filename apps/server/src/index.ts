import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "path";
import { env } from "./env.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { agentRoutes } from "./routes/agents.js";
import { conversationRoutes } from "./routes/conversations.js";
import { messageRoutes } from "./routes/messages.js";
import { uploadRoutes } from "./routes/uploads.js";
import { wsRoutes } from "./ws/handler.js";
import { agentHealthRoutes } from "./routes/agent-health.js";
import { sandboxRoutes } from "./routes/sandbox.js";
import { groupRoutes } from "./routes/groups.js";
import { marketplaceRoutes } from "./routes/marketplace.js";
import { communityRoutes } from "./routes/communities.js";

const app = Fastify({ logger: true });

// CORS
await app.register(cors, {
  origin: env.CORS_ORIGIN,
  credentials: true,
});

// Rate limiting
await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
  allowList: ["/health", "/ws"],
});

// Multipart (file upload)
await app.register(multipart, {
  limits: { fileSize: env.MAX_FILE_SIZE },
});

// Static file serving for uploads
await app.register(fastifyStatic, {
  root: path.resolve(env.UPLOAD_DIR),
  prefix: "/uploads/",
  decorateReply: false,
});

// WebSocket
await app.register(websocket);

// Global error handler
app.setErrorHandler((error: Error & { validation?: unknown; statusCode?: number }, request, reply) => {
  if (error.validation) {
    return reply.status(400).send({ error: "Validation error", details: error.message });
  }

  if (error.statusCode === 429) {
    return reply.status(429).send({ error: "Too many requests. Please try again later." });
  }

  app.log.error(error);
  return reply.status(error.statusCode ?? 500).send({
    error: error.message ?? "Internal server error",
  });
});

// Routes
await app.register(healthRoutes);
await app.register(authRoutes);
await app.register(agentRoutes);
await app.register(groupRoutes);
await app.register(conversationRoutes);
await app.register(messageRoutes);
await app.register(uploadRoutes);
await app.register(wsRoutes);
await app.register(agentHealthRoutes);
await app.register(sandboxRoutes);
await app.register(marketplaceRoutes);
await app.register(communityRoutes);

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`Server running on http://localhost:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
