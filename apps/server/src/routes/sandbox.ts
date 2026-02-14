import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import { executeJavaScript } from "../sandbox/executor.js";

const MAX_CODE_LENGTH = 10000;

// Simple in-memory rate limiter per user for sandbox execution
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(userId: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) ?? [];

  // Remove expired entries
  const valid = timestamps.filter((t) => now - t < windowMs);

  if (valid.length >= maxRequests) {
    rateLimitMap.set(userId, valid);
    return false;
  }

  valid.push(now);
  rateLimitMap.set(userId, valid);
  return true;
}

export async function sandboxRoutes(app: FastifyInstance) {
  app.post<{
    Body: { code: string; language: string };
  }>("/api/sandbox/execute", async (request, reply) => {
    const user = await requireAuth(request, reply);

    const { code, language } = request.body as { code: string; language: string };

    // Validate language
    if (language !== "javascript") {
      return reply.status(400).send({
        error: `Unsupported language: "${language}". Only "javascript" is supported.`,
      });
    }

    // Validate code presence and length
    if (!code || typeof code !== "string") {
      return reply.status(400).send({ error: "Code is required." });
    }

    if (code.length > MAX_CODE_LENGTH) {
      return reply.status(400).send({
        error: `Code exceeds maximum length of ${MAX_CODE_LENGTH} characters.`,
      });
    }

    // Rate limit: 10 executions per minute per user
    if (!checkRateLimit(user.id, 10, 60_000)) {
      return reply.status(429).send({
        error: "Rate limit exceeded. Max 10 executions per minute.",
      });
    }

    const result = executeJavaScript(code);

    return reply.send(result);
  });
}
