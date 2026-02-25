import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { agentListings, marketplaceConversations, marketplaceMessages, user } from "../db/schema.js";
import { eq, and, desc, asc, ilike, or, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { encryptApiKey, decryptApiKey } from "../lib/crypto.js";
import { validateApiKey, callLLM } from "../lib/llm-providers.js";
import { checkBilling, deductCoins, recordMessage } from "../lib/billing.js";
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

    // Validate the API key before storing
    const validation = await validateApiKey(rest.modelProvider, apiKey);
    if (!validation.valid) {
      return reply.status(400).send({ error: "API key validation failed. Please check your key." });
    }

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
        const validation = await validateApiKey(
          rest.modelProvider ?? existing.modelProvider,
          apiKey,
        );
        if (!validation.valid) {
          return reply.status(400).send({ error: "API key validation failed. Please check your key." });
        }
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

  // ── Chat with marketplace agent (SSE streaming) ───────────
  const chatSchema = z.object({
    message: z.string().min(1).max(10000),
    conversationId: z.string().uuid().optional(),
  });

  app.post<{ Params: { id: string } }>(
    "/api/marketplace/agents/:id/chat",
    async (request, reply) => {
      const authUser = await requireAuth(request, reply);
      const { id: agentListingId } = request.params;

      const body = chatSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() });
      }

      // 1. Load listing (must be active)
      const [listing] = await db
        .select()
        .from(agentListings)
        .where(and(eq(agentListings.id, agentListingId), eq(agentListings.status, "active")));

      if (!listing) {
        return reply.status(404).send({ error: "Agent listing not found or not active" });
      }

      // 2. Billing check
      const billing = await checkBilling(authUser.id, agentListingId);
      if (!billing.allowed) {
        return reply.status(402).send({ error: billing.reason });
      }

      // 3. Get or create conversation
      let conversationId = body.data.conversationId;
      if (conversationId) {
        // Verify ownership + belongs to this agent listing
        const [conv] = await db
          .select()
          .from(marketplaceConversations)
          .where(
            and(
              eq(marketplaceConversations.id, conversationId),
              eq(marketplaceConversations.userId, authUser.id),
              eq(marketplaceConversations.agentListingId, agentListingId),
            ),
          );
        if (!conv) {
          return reply.status(404).send({ error: "Conversation not found" });
        }
      } else {
        // Create new conversation
        const [conv] = await db
          .insert(marketplaceConversations)
          .values({
            userId: authUser.id,
            agentListingId,
          })
          .returning({ id: marketplaceConversations.id });
        conversationId = conv.id;

        // Increment total conversations on listing
        await db
          .update(agentListings)
          .set({ totalConversations: sql`${agentListings.totalConversations} + 1` })
          .where(eq(agentListings.id, agentListingId));
      }

      // 4. Store user message
      await db.insert(marketplaceMessages).values({
        conversationId,
        role: "user",
        content: body.data.message,
      });

      // 5. Load conversation history (last 50 messages for context)
      const history = await db
        .select({ role: marketplaceMessages.role, content: marketplaceMessages.content })
        .from(marketplaceMessages)
        .where(eq(marketplaceMessages.conversationId, conversationId))
        .orderBy(desc(marketplaceMessages.createdAt))
        .limit(50);
      history.reverse();

      // 6. Determine if this is a free message (deduction happens after LLM success)
      const isFree = (billing.freeTrialRemaining ?? 0) > 0 || listing.pricePerMessage === 0;

      // 7. Decrypt API key and stream LLM response via SSE
      const apiKey = decryptApiKey(listing.encryptedApiKey);

      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // Send conversation ID first (for new conversations)
      reply.raw.write(`data: ${JSON.stringify({ type: "meta", conversationId })}\n\n`);

      await callLLM({
        provider: listing.modelProvider,
        modelId: listing.modelId,
        apiKey,
        systemPrompt: listing.systemPrompt,
        messages: history.map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
        })),
        onChunk: (chunk) => {
          reply.raw.write(`data: ${JSON.stringify({ type: "chunk", content: chunk })}\n\n`);
        },
        onComplete: async (fullContent) => {
          // Store assistant message
          await db.insert(marketplaceMessages).values({
            conversationId: conversationId!,
            role: "assistant",
            content: fullContent,
          });

          // Deduct coins AFTER successful LLM response
          let charged = true;
          if (!isFree) {
            charged = await deductCoins(
              authUser.id,
              agentListingId,
              listing.pricePerMessage,
              listing.creatorId,
            );
          }

          // Record message stats
          await recordMessage(conversationId!, agentListingId, charged ? listing.pricePerMessage : 0);

          reply.raw.write(`data: ${JSON.stringify({ type: "done", charged })}\n\n`);
          reply.raw.end();
        },
        onError: () => {
          reply.raw.write(`data: ${JSON.stringify({ type: "error", error: "Failed to generate response" })}\n\n`);
          reply.raw.end();
        },
      });
    },
  );

  // ── Creator: list own agents ─────────────────────────────
  app.get("/api/creator/agents", async (request, reply) => {
    const authUser = await requireAuth(request, reply);

    const listings = await db
      .select({
        ...publicColumns,
        systemPrompt: agentListings.systemPrompt,
      })
      .from(agentListings)
      .where(eq(agentListings.creatorId, authUser.id))
      .orderBy(desc(agentListings.createdAt));

    return reply.send(listings);
  });

  // ── Creator: dashboard stats ────────────────────────────
  app.get("/api/creator/dashboard", async (request, reply) => {
    const authUser = await requireAuth(request, reply);

    // Aggregate stats across all creator's listings
    const [stats] = await db
      .select({
        totalRevenue: sql<number>`coalesce(sum(${agentListings.totalRevenue}), 0)::int`,
        totalMessages: sql<number>`coalesce(sum(${agentListings.totalMessages}), 0)::int`,
        totalConversations: sql<number>`coalesce(sum(${agentListings.totalConversations}), 0)::int`,
        activeListings: sql<number>`count(*) filter (where ${agentListings.status} = 'active')::int`,
        avgRating: sql<number | null>`avg(${agentListings.avgRating}) filter (where ${agentListings.avgRating} is not null)`,
        totalReviews: sql<number>`coalesce(sum(${agentListings.reviewCount}), 0)::int`,
      })
      .from(agentListings)
      .where(eq(agentListings.creatorId, authUser.id));

    // Recent earning transactions
    const recentEarnings = await db
      .select()
      .from(coinTransactions)
      .where(
        and(
          eq(coinTransactions.userId, authUser.id),
          eq(coinTransactions.type, "earning"),
        ),
      )
      .orderBy(desc(coinTransactions.createdAt))
      .limit(10);

    return reply.send({
      ...stats,
      avgRating: stats.avgRating ? parseFloat(stats.avgRating.toFixed(1)) : null,
      recentEarnings,
    });
  });

  // ── Get user's marketplace conversations ──────────────────
  app.get("/api/marketplace/conversations", async (request, reply) => {
    const authUser = await requireAuth(request, reply);

    const convos = await db
      .select({
        id: marketplaceConversations.id,
        agentListingId: marketplaceConversations.agentListingId,
        agentName: agentListings.name,
        agentAvatar: agentListings.avatarUrl,
        messageCount: marketplaceConversations.messageCount,
        createdAt: marketplaceConversations.createdAt,
        updatedAt: marketplaceConversations.updatedAt,
      })
      .from(marketplaceConversations)
      .innerJoin(agentListings, eq(marketplaceConversations.agentListingId, agentListings.id))
      .where(eq(marketplaceConversations.userId, authUser.id))
      .orderBy(desc(marketplaceConversations.updatedAt));

    return reply.send(convos);
  });

  // ── Get conversation messages ─────────────────────────────
  app.get<{ Params: { conversationId: string } }>(
    "/api/marketplace/conversations/:conversationId/messages",
    async (request, reply) => {
      const authUser = await requireAuth(request, reply);
      const { conversationId } = request.params;

      // Verify ownership
      const [conv] = await db
        .select()
        .from(marketplaceConversations)
        .where(
          and(
            eq(marketplaceConversations.id, conversationId),
            eq(marketplaceConversations.userId, authUser.id),
          ),
        );

      if (!conv) {
        return reply.status(404).send({ error: "Conversation not found" });
      }

      const msgs = await db
        .select({
          id: marketplaceMessages.id,
          role: marketplaceMessages.role,
          content: marketplaceMessages.content,
          createdAt: marketplaceMessages.createdAt,
        })
        .from(marketplaceMessages)
        .where(eq(marketplaceMessages.conversationId, conversationId))
        .orderBy(asc(marketplaceMessages.createdAt));

      return reply.send(msgs);
    },
  );
}
