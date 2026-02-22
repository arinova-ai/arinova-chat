import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { agents, agentApiCalls } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { agentChatRequestSchema } from "@arinova/shared/schemas";
import { requireAppAuthFromRequest } from "./oauth.js";
import { isAgentConnected, sendTaskToAgent } from "../ws/agent-handler.js";
import { randomUUID } from "crypto";
import { redis } from "../db/redis.js";

const RATE_LIMIT_WINDOW = 60; // seconds
const RATE_LIMIT_MAX = 30; // per app per user per minute

export async function agentProxyRoutes(app: FastifyInstance) {
  // POST /api/v1/agent/chat - Synchronous mode
  app.post("/api/v1/agent/chat", async (request, reply) => {
    const tokenData = await requireAppAuthFromRequest(request, reply);
    if (!tokenData) return;
    if (!tokenData.scope.includes("agents")) {
      return reply.status(403).send({ error: "insufficient_scope" });
    }

    const body = agentChatRequestSchema.parse(request.body);

    // Rate limit check
    const rateLimitResult = await checkRateLimit(tokenData.appId, tokenData.userId);
    if (!rateLimitResult.allowed) {
      return reply.status(429).send({ error: "rate_limit_exceeded", retryAfter: rateLimitResult.retryAfter });
    }

    // Verify agent belongs to user
    const [agent] = await db.select().from(agents).where(eq(agents.id, body.agentId));
    if (!agent || agent.ownerId !== tokenData.userId) {
      return reply.status(403).send({ error: "agent_not_owned" });
    }

    if (!isAgentConnected(body.agentId)) {
      return reply.status(400).send({ error: "agent_offline" });
    }

    const taskId = randomUUID();
    const content = body.systemPrompt ? `[System: ${body.systemPrompt}]\n\n${body.prompt}` : body.prompt;

    const response = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 120_000);
      sendTaskToAgent({
        agentId: body.agentId,
        taskId,
        conversationId: taskId,
        content,
        onChunk: () => {},
        onComplete: (content) => { clearTimeout(timeout); resolve(content); },
        onError: (error) => { clearTimeout(timeout); reject(new Error(error)); },
      });
    });

    // Record API call
    await db.insert(agentApiCalls).values({
      appId: tokenData.appId,
      userId: tokenData.userId,
      agentId: body.agentId,
      tokenCount: response.length,
    });

    return { response, agentId: body.agentId };
  });

  // POST /api/v1/agent/chat/stream - SSE streaming mode
  app.post("/api/v1/agent/chat/stream", async (request, reply) => {
    const tokenData = await requireAppAuthFromRequest(request, reply);
    if (!tokenData) return;
    if (!tokenData.scope.includes("agents")) {
      return reply.status(403).send({ error: "insufficient_scope" });
    }

    const body = agentChatRequestSchema.parse(request.body);

    const rateLimitResult = await checkRateLimit(tokenData.appId, tokenData.userId);
    if (!rateLimitResult.allowed) {
      return reply.status(429).send({ error: "rate_limit_exceeded", retryAfter: rateLimitResult.retryAfter });
    }

    const [agent] = await db.select().from(agents).where(eq(agents.id, body.agentId));
    if (!agent || agent.ownerId !== tokenData.userId) {
      return reply.status(403).send({ error: "agent_not_owned" });
    }

    if (!isAgentConnected(body.agentId)) {
      return reply.status(400).send({ error: "agent_offline" });
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });

    const taskId = randomUUID();
    const content = body.systemPrompt ? `[System: ${body.systemPrompt}]\n\n${body.prompt}` : body.prompt;

    sendTaskToAgent({
      agentId: body.agentId,
      taskId,
      conversationId: taskId,
      content,
      onChunk: (chunk) => {
        reply.raw.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
      },
      onComplete: async (fullContent) => {
        reply.raw.write(`data: ${JSON.stringify({ type: "done", content: fullContent })}\n\n`);
        reply.raw.end();
        await db.insert(agentApiCalls).values({
          appId: tokenData.appId,
          userId: tokenData.userId,
          agentId: body.agentId,
          tokenCount: fullContent.length,
        });
      },
      onError: (error) => {
        reply.raw.write(`data: ${JSON.stringify({ type: "error", error })}\n\n`);
        reply.raw.end();
      },
    });

    // Handle client disconnect
    request.raw.on("close", () => {
      // Task will be cleaned up by agent-handler timeout
    });
  });
}

async function checkRateLimit(appId: string, userId: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const key = `ratelimit:agent:${appId}:${userId}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, RATE_LIMIT_WINDOW);
    }
    if (count > RATE_LIMIT_MAX) {
      const ttl = await redis.ttl(key);
      return { allowed: false, retryAfter: ttl > 0 ? ttl : RATE_LIMIT_WINDOW };
    }
    return { allowed: true };
  } catch {
    // If Redis is down, allow the request
    return { allowed: true };
  }
}
