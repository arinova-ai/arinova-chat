import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { user } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const USERNAME_REGEX = /^[a-z][a-z0-9_]*$/;
const NO_CONSECUTIVE_UNDERSCORES = /_{2,}/;

function isValidUsername(value: string): boolean {
  if (value.length < 3 || value.length > 32) return false;
  if (!USERNAME_REGEX.test(value)) return false;
  if (NO_CONSECUTIVE_UNDERSCORES.test(value)) return false;
  return true;
}

export async function userRoutes(app: FastifyInstance) {
  // Check username availability
  app.get("/api/users/username/check", async (request, reply) => {
    await requireAuth(request, reply);

    const { username } = request.query as { username?: string };

    if (!username || !isValidUsername(username)) {
      return reply.status(400).send({ error: "Invalid username format" });
    }

    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.username, username))
      .limit(1);

    return { available: existing.length === 0 };
  });

  // Set username
  app.post("/api/users/username", async (request, reply) => {
    const authUser = await requireAuth(request, reply);

    const { username } = request.body as { username?: string };

    if (!username || !isValidUsername(username)) {
      return reply.status(400).send({ error: "Invalid username format" });
    }

    // Check if user already has a username
    const [currentUser] = await db
      .select({ username: user.username })
      .from(user)
      .where(eq(user.id, authUser.id));

    if (currentUser?.username) {
      return reply.status(409).send({ error: "Username already set" });
    }

    // Check availability
    const existing = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.username, username))
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({ error: "Username is already taken" });
    }

    // Set the username
    await db
      .update(user)
      .set({ username, updatedAt: new Date() })
      .where(eq(user.id, authUser.id));

    return { username };
  });
}
