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
import { agentWsRoutes } from "./ws/agent-handler.js";
import { agentHealthRoutes } from "./routes/agent-health.js";
import { sandboxRoutes } from "./routes/sandbox.js";
import { groupRoutes } from "./routes/groups.js";
import { pushRoutes } from "./routes/push.js";
import { notificationRoutes } from "./routes/notifications.js";
import { oauthRoutes } from "./routes/oauth.js";
import { appRoutes } from "./routes/apps.js";
import { agentProxyRoutes } from "./routes/agent-proxy.js";
import { economyApiRoutes } from "./routes/economy-api.js";
import { voiceRoutes } from "./routes/voice.js";
import { voiceWsRoutes } from "./ws/voice-handler.js";
// Phase 2+ routes (on features/platform-extras branch)
// import { marketplaceRoutes } from "./routes/marketplace.js";
// import { communityRoutes } from "./routes/communities.js";
// import { appSubmissionRoutes } from "./routes/app-submissions.js";
// import { appMarketplaceRoutes } from "./routes/app-marketplace.js";
// import { walletRoutes } from "./routes/wallet.js";
// import { developerRoutes } from "./routes/developer.js";

const app = Fastify({ logger: true });

// CORS — support comma-separated origins; "*" allows all (dev mode)
const corsOrigins = env.CORS_ORIGIN.split(",").map((s) => s.trim());
await app.register(cors, {
  origin: corsOrigins.includes("*") ? true : corsOrigins,
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH"],
});

// Rate limiting
await app.register(rateLimit, {
  max: 300,
  timeWindow: "1 minute",
  allowList: ["/health", "/ws", "/ws/agent", "/ws/voice"],
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
await app.register(agentWsRoutes);
await app.register(agentHealthRoutes);
await app.register(sandboxRoutes);
await app.register(pushRoutes);
await app.register(notificationRoutes);
await app.register(oauthRoutes);
await app.register(appRoutes);
await app.register(agentProxyRoutes);
await app.register(economyApiRoutes);
await app.register(voiceRoutes);
await app.register(voiceWsRoutes);
// Phase 2+ routes (on features/platform-extras branch)
// await app.register(marketplaceRoutes);
// await app.register(communityRoutes);
// await app.register(appSubmissionRoutes);
// await app.register(appMarketplaceRoutes);
// await app.register(walletRoutes);
// await app.register(developerRoutes);

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`Server running on http://localhost:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
