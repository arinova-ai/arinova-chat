import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { redis } from "../db/redis.js";
import { sql } from "drizzle-orm";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async (_request, reply) => {
    let dbStatus = "ok";
    let redisStatus = "ok";

    // Check PostgreSQL
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbStatus = "error";
    }

    // Check Redis
    try {
      await redis.ping();
    } catch {
      redisStatus = "error";
    }

    const status = dbStatus === "ok" && redisStatus === "ok" ? "ok" : "degraded";
    const statusCode = status === "ok" ? 200 : 503;

    return reply.status(statusCode).send({
      status,
      db: dbStatus,
      redis: redisStatus,
      timestamp: new Date().toISOString(),
    });
  });
}
