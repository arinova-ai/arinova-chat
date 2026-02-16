import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { agents } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import {
  createAgentSchema,
  updateAgentSchema,
  pairingExchangeSchema,
} from "@arinova/shared/schemas";
import {
  generateUniquePairingCode,
  normalizePairingCode,
} from "../utils/pairing-code.js";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { env } from "../env.js";

export async function agentRoutes(app: FastifyInstance) {
  // Exchange pairing code for agent connection (public — no auth required)
  // MUST be registered before /api/agents/:id to avoid route conflicts
  app.post("/api/agents/pair", async (request, reply) => {
    const body = pairingExchangeSchema.parse(request.body);
    const code = normalizePairingCode(body.pairingCode);

    const [agent] = await db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(eq(agents.pairingCode, code));

    if (!agent) {
      return reply.status(404).send({ error: "Invalid pairing code" });
    }

    await db
      .update(agents)
      .set({ a2aEndpoint: body.a2aEndpoint, updatedAt: new Date() })
      .where(eq(agents.id, agent.id));

    return reply.send({ agentId: agent.id, name: agent.name });
  });

  // Create agent
  app.post("/api/agents", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const body = createAgentSchema.parse(request.body);

    const pairingCode = await generateUniquePairingCode();

    const [agent] = await db
      .insert(agents)
      .values({
        name: body.name,
        description: body.description ?? null,
        a2aEndpoint: body.a2aEndpoint ?? null,
        pairingCode,
        ownerId: user.id,
      })
      .returning();

    return reply.status(201).send(agent);
  });

  // List user's agents
  app.get("/api/agents", async (request, reply) => {
    const user = await requireAuth(request, reply);

    const result = await db
      .select()
      .from(agents)
      .where(eq(agents.ownerId, user.id))
      .orderBy(agents.createdAt);

    return reply.send(result);
  });

  // Get single agent
  app.get<{ Params: { id: string } }>(
    "/api/agents/:id",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [agent] = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, request.params.id), eq(agents.ownerId, user.id)));

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      return reply.send(agent);
    }
  );

  // Update agent
  app.put<{ Params: { id: string } }>(
    "/api/agents/:id",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      const body = updateAgentSchema.parse(request.body);

      const [agent] = await db
        .update(agents)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(agents.id, request.params.id), eq(agents.ownerId, user.id)))
        .returning();

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      return reply.send(agent);
    }
  );

  // Get agent skills from A2A card
  app.get<{ Params: { id: string } }>(
    "/api/agents/:id/skills",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [agent] = await db
        .select({ a2aEndpoint: agents.a2aEndpoint })
        .from(agents)
        .where(and(eq(agents.id, request.params.id), eq(agents.ownerId, user.id)));

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      if (!agent.a2aEndpoint) {
        return reply.send({ skills: [] });
      }

      try {
        const cardUrl = agent.a2aEndpoint;
        const res = await fetch(cardUrl, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
          return reply.send({ skills: [] });
        }

        const card = (await res.json()) as {
          skills?: { id: string; name: string; description?: string }[];
        };

        const skills = (card.skills ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description ?? "",
        }));

        return reply.send({ skills });
      } catch {
        return reply.send({ skills: [] });
      }
    }
  );

  // Upload agent avatar
  app.post<{ Params: { id: string } }>(
    "/api/agents/:id/avatar",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      // Verify ownership
      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, request.params.id), eq(agents.ownerId, user.id)));

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: "No file uploaded" });
      }

      // Validate image type
      if (!data.mimetype.startsWith("image/")) {
        return reply.status(400).send({ error: "Only image files are allowed" });
      }

      const buffer = await data.toBuffer();

      // Max 2MB for avatars
      if (buffer.length > 2 * 1024 * 1024) {
        return reply.status(400).send({ error: "Avatar must be under 2MB" });
      }

      // Save file
      const ext = data.filename.split(".").pop() ?? "jpg";
      const filename = `avatar_${agent.id}_${Date.now()}.${ext}`;
      const avatarDir = path.resolve(env.UPLOAD_DIR, "avatars");
      await mkdir(avatarDir, { recursive: true });
      await writeFile(path.join(avatarDir, filename), buffer);

      const avatarUrl = `/uploads/avatars/${filename}`;

      // Update agent
      const [updated] = await db
        .update(agents)
        .set({ avatarUrl, updatedAt: new Date() })
        .where(eq(agents.id, agent.id))
        .returning();

      return reply.send({ avatarUrl: updated.avatarUrl });
    }
  );

  // Delete agent
  app.delete<{ Params: { id: string } }>(
    "/api/agents/:id",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [agent] = await db
        .delete(agents)
        .where(and(eq(agents.id, request.params.id), eq(agents.ownerId, user.id)))
        .returning();

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      return reply.status(204).send();
    }
  );
}
