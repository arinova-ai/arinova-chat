import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { agentListings, user } from "../db/schema.js";
import { eq, and, desc, asc, ilike, or, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { encryptApiKey } from "../lib/crypto.js";
import { z } from "zod";

const createListingSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1),
  avatarUrl: z.string().url().optional(),
  category: z.string().min(1).max(50),
  tags: z.array(z.string()).default([]),
  systemPrompt: z.string().min(1),
  welcomeMessage: z.string().optional(),
  exampleConversations: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .default([]),
  modelProvider: z.string().min(1).max(50),
  modelId: z.string().min(1).max(100),
  apiKey: z.string().min(1),
  pricePerMessage: z.number().int().min(0).default(1),
  freeTrialMessages: z.number().int().min(0).default(3),
});

const updateListingSchema = createListingSchema.partial().omit({ apiKey: true }).extend({
  apiKey: z.string().min(1).optional(),
});

/** Columns safe to expose publicly (no systemPrompt, no encryptedApiKey) */
const publicColumns = {
  id: agentListings.id,
  creatorId: agentListings.creatorId,
  name: agentListings.name,
  description: agentListings.description,
  avatarUrl: agentListings.avatarUrl,
  category: agentListings.category,
  tags: agentListings.tags,
  welcomeMessage: agentListings.welcomeMessage,
  exampleConversations: agentListings.exampleConversations,
  modelProvider: agentListings.modelProvider,
  modelId: agentListings.modelId,
  pricePerMessage: agentListings.pricePerMessage,
  freeTrialMessages: agentListings.freeTrialMessages,
  status: agentListings.status,
  totalConversations: agentListings.totalConversations,
  totalMessages: agentListings.totalMessages,
  totalRevenue: agentListings.totalRevenue,
  avgRating: agentListings.avgRating,
  reviewCount: agentListings.reviewCount,
  createdAt: agentListings.createdAt,
  updatedAt: agentListings.updatedAt,
} as const;

export async function marketplaceRoutes(app: FastifyInstance) {
  // ── Create listing ──────────────────────────────────────────
  app.post("/api/marketplace/agents", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const body = createListingSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() });
    }

    const { apiKey, ...rest } = body.data;
    const encrypted = encryptApiKey(apiKey);

    // Phase 1: skip review, auto-activate. Phase 2 will add content moderation.
    const [listing] = await db
      .insert(agentListings)
      .values({
        creatorId: authUser.id,
        ...rest,
        encryptedApiKey: encrypted,
        status: "active",
      })
      .returning(publicColumns);

    return reply.status(201).send(listing);
  });

  // ── Update listing (creator only) ──────────────────────────
  app.put<{ Params: { id: string } }>(
    "/api/marketplace/agents/:id",
    async (request, reply) => {
      const authUser = await requireAuth(request, reply);
      const { id } = request.params;

      const [existing] = await db
        .select()
        .from(agentListings)
        .where(eq(agentListings.id, id));

      if (!existing) {
        return reply.status(404).send({ error: "Listing not found" });
      }
      if (existing.creatorId !== authUser.id) {
        return reply.status(403).send({ error: "Not the creator of this listing" });
      }

      const body = updateListingSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() });
      }

      const { apiKey, ...rest } = body.data;
      const updateData: Record<string, unknown> = {
        ...rest,
        updatedAt: new Date(),
      };
      if (apiKey) {
        updateData.encryptedApiKey = encryptApiKey(apiKey);
      }

      const [updated] = await db
        .update(agentListings)
        .set(updateData)
        .where(eq(agentListings.id, id))
        .returning(publicColumns);

      return reply.send(updated);
    },
  );

  // ── Browse listings (public) ───────────────────────────────
  app.get<{
    Querystring: {
      category?: string;
      search?: string;
      sort?: string;
      limit?: string;
      offset?: string;
    };
  }>("/api/marketplace/agents", async (request, reply) => {
    const {
      category,
      search,
      sort = "popular",
      limit: limitStr = "20",
      offset: offsetStr = "0",
    } = request.query;

    const limit = Math.min(parseInt(limitStr) || 20, 50);
    const offset = parseInt(offsetStr) || 0;

    const conditions = [eq(agentListings.status, "active")];
    if (category) {
      conditions.push(eq(agentListings.category, category));
    }
    if (search) {
      conditions.push(
        or(
          ilike(agentListings.name, `%${search}%`),
          ilike(agentListings.description, `%${search}%`),
        )!,
      );
    }

    let orderBy;
    switch (sort) {
      case "newest":
        orderBy = desc(agentListings.createdAt);
        break;
      case "rating":
        orderBy = desc(agentListings.avgRating);
        break;
      case "price":
        orderBy = asc(agentListings.pricePerMessage);
        break;
      case "popular":
      default:
        orderBy = desc(agentListings.totalConversations);
        break;
    }

    const listings = await db
      .select(publicColumns)
      .from(agentListings)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentListings)
      .where(and(...conditions));

    return reply.send({ listings, total: count });
  });

  // ── Get listing detail (public) ────────────────────────────
  app.get<{ Params: { id: string } }>(
    "/api/marketplace/agents/:id",
    async (request, reply) => {
      const { id } = request.params;

      const [listing] = await db
        .select({
          ...publicColumns,
          creatorName: user.name,
          creatorImage: user.image,
        })
        .from(agentListings)
        .innerJoin(user, eq(agentListings.creatorId, user.id))
        .where(and(eq(agentListings.id, id), eq(agentListings.status, "active")));

      if (!listing) {
        return reply.status(404).send({ error: "Listing not found" });
      }

      return reply.send(listing);
    },
  );

  // ── Creator manage view (auth + creator only) ──────────────
  app.get<{ Params: { id: string } }>(
    "/api/marketplace/agents/:id/manage",
    async (request, reply) => {
      const authUser = await requireAuth(request, reply);
      const { id } = request.params;

      const [listing] = await db
        .select({
          ...publicColumns,
          systemPrompt: agentListings.systemPrompt,
        })
        .from(agentListings)
        .where(eq(agentListings.id, id));

      if (!listing) {
        return reply.status(404).send({ error: "Listing not found" });
      }
      if (listing.creatorId !== authUser.id) {
        return reply.status(403).send({ error: "Not the creator of this listing" });
      }

      return reply.send(listing);
    },
  );

  // ── Archive listing (creator only) ─────────────────────────
  app.delete<{ Params: { id: string } }>(
    "/api/marketplace/agents/:id",
    async (request, reply) => {
      const authUser = await requireAuth(request, reply);
      const { id } = request.params;

      const [existing] = await db
        .select()
        .from(agentListings)
        .where(eq(agentListings.id, id));

      if (!existing) {
        return reply.status(404).send({ error: "Listing not found" });
      }
      if (existing.creatorId !== authUser.id) {
        return reply.status(403).send({ error: "Not the creator of this listing" });
      }

      await db
        .update(agentListings)
        .set({ status: "archived", updatedAt: new Date() })
        .where(eq(agentListings.id, id));

      return reply.send({ success: true });
    },
  );
}
