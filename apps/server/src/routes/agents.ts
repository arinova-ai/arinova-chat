import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { agents, conversations, messages } from "../db/schema.js";
import { eq, and, sql, desc } from "drizzle-orm";
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
      .select({
        id: agents.id,
        name: agents.name,
        pairingCodeExpiresAt: agents.pairingCodeExpiresAt,
      })
      .from(agents)
      .where(eq(agents.pairingCode, code));

    if (!agent) {
      return reply.status(404).send({ error: "Invalid pairing code" });
    }

    // Check expiry
    if (agent.pairingCodeExpiresAt && agent.pairingCodeExpiresAt < new Date()) {
      return reply.status(410).send({ error: "Pairing code has expired. Please generate a new one." });
    }

    // Pair and clear the code (free it for reuse)
    const updateFields: Record<string, unknown> = {
      pairingCode: null,
      pairingCodeExpiresAt: null,
      updatedAt: new Date(),
    };
    if (body.a2aEndpoint) {
      updateFields.a2aEndpoint = body.a2aEndpoint;
    }

    await db
      .update(agents)
      .set(updateFields)
      .where(eq(agents.id, agent.id));

    // Build WS URL for the agent to connect back
    const host = request.headers.host ?? "localhost:3501";
    const protocol = request.headers["x-forwarded-proto"] === "https" ? "wss" : "ws";
    const wsUrl = `${protocol}://${host}/ws/agent`;

    return reply.send({ agentId: agent.id, name: agent.name, wsUrl });
  });

  // Create agent
  app.post("/api/agents", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const body = createAgentSchema.parse(request.body);

    const pairingCode = await generateUniquePairingCode();
    const pairingCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const [agent] = await db
      .insert(agents)
      .values({
        name: body.name,
        description: body.description ?? null,
        a2aEndpoint: body.a2aEndpoint ?? null,
        pairingCode,
        pairingCodeExpiresAt,
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

  // Regenerate pairing code (10-minute expiry)
  app.post<{ Params: { id: string } }>(
    "/api/agents/:id/regenerate-code",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, request.params.id), eq(agents.ownerId, user.id)));

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      const pairingCode = await generateUniquePairingCode();
      const pairingCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

      const [updated] = await db
        .update(agents)
        .set({ pairingCode, pairingCodeExpiresAt, updatedAt: new Date() })
        .where(eq(agents.id, agent.id))
        .returning();

      return reply.send({
        pairingCode: updated.pairingCode,
        expiresAt: updated.pairingCodeExpiresAt,
      });
    }
  );

  // Get agent usage stats
  app.get<{ Params: { id: string } }>(
    "/api/agents/:id/stats",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, request.params.id), eq(agents.ownerId, user.id)));

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      // Get conversation IDs for this agent
      const agentConvos = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(and(eq(conversations.agentId, agent.id), eq(conversations.userId, user.id)));

      const convoIds = agentConvos.map((c) => c.id);

      let totalMessages = 0;
      let lastActive: Date | null = null;

      if (convoIds.length > 0) {
        const [msgStats] = await db
          .select({
            count: sql<number>`count(*)::int`,
            lastMessage: sql<Date>`max(${messages.createdAt})`,
          })
          .from(messages)
          .where(sql`${messages.conversationId} = ANY(${convoIds})`);

        totalMessages = msgStats?.count ?? 0;
        lastActive = msgStats?.lastMessage ?? null;
      }

      return reply.send({
        totalMessages,
        totalConversations: convoIds.length,
        lastActive,
      });
    }
  );

  // Clear all conversation history for an agent
  app.delete<{ Params: { id: string } }>(
    "/api/agents/:id/history",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [agent] = await db
        .select({ id: agents.id })
        .from(agents)
        .where(and(eq(agents.id, request.params.id), eq(agents.ownerId, user.id)));

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      // Delete all conversations with this agent (messages cascade)
      await db
        .delete(conversations)
        .where(and(eq(conversations.agentId, agent.id), eq(conversations.userId, user.id)));

      return reply.status(204).send();
    }
  );

  // Export chat history for an agent
  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    "/api/agents/:id/export",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      const format = (request.query as { format?: string }).format ?? "json";

      const [agent] = await db
        .select({ id: agents.id, name: agents.name })
        .from(agents)
        .where(and(eq(agents.id, request.params.id), eq(agents.ownerId, user.id)));

      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      const convos = await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.agentId, agent.id), eq(conversations.userId, user.id)))
        .orderBy(conversations.createdAt);

      const result = [];
      for (const convo of convos) {
        const msgs = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, convo.id))
          .orderBy(messages.createdAt);

        result.push({
          conversationId: convo.id,
          title: convo.title,
          createdAt: convo.createdAt,
          messages: msgs.map((m) => ({
            role: m.role,
            content: m.content,
            status: m.status,
            createdAt: m.createdAt,
          })),
        });
      }

      if (format === "markdown") {
        let md = `# Chat Export: ${agent.name}\n\n`;
        for (const convo of result) {
          md += `## ${convo.title ?? "Untitled"} (${new Date(convo.createdAt).toLocaleDateString()})\n\n`;
          for (const msg of convo.messages) {
            const role = msg.role === "user" ? "You" : agent.name;
            const time = new Date(msg.createdAt).toLocaleTimeString();
            md += `**${role}** [${time}]\n${msg.content}\n\n`;
          }
          md += "---\n\n";
        }
        reply.header("Content-Type", "text/markdown");
        reply.header("Content-Disposition", `attachment; filename="${agent.name}-export.md"`);
        return reply.send(md);
      }

      reply.header("Content-Type", "application/json");
      reply.header("Content-Disposition", `attachment; filename="${agent.name}-export.json"`);
      return reply.send({ agent: agent.name, exportedAt: new Date(), conversations: result });
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
