import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { apps, appOAuthClients, agentApiCalls, coinTransactions, oauthAccessTokens } from "../db/schema.js";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { createPlatformAppSchema, updatePlatformAppSchema } from "@arinova/shared/schemas";
import crypto from "crypto";

export async function appRoutes(app: FastifyInstance) {
  // GET /api/apps - List published apps (public directory)
  app.get("/api/apps", async (request, reply) => {
    const { category, search, page = "1", limit = "20" } = request.query as any;
    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 50);
    const offset = (pageNum - 1) * limitNum;

    const conditions = [eq(apps.status, "published")];
    if (category) conditions.push(eq(apps.category, category));
    if (search) conditions.push(or(ilike(apps.name, `%${search}%`), ilike(apps.description, `%${search}%`))!);

    const [items, [{ count }]] = await Promise.all([
      db.select().from(apps).where(and(...conditions)).orderBy(desc(apps.createdAt)).limit(limitNum).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(apps).where(and(...conditions)),
    ]);

    return { apps: items, pagination: { page: pageNum, limit: limitNum, total: count, totalPages: Math.ceil(count / limitNum) } };
  });

  // GET /api/apps/:id - Get app details
  app.get("/api/apps/:id", async (request, reply) => {
    const { id } = request.params as any;
    const [appInfo] = await db.select().from(apps).where(eq(apps.id, id));
    if (!appInfo) return reply.status(404).send({ error: "App not found" });
    return appInfo;
  });

  // --- Developer Console routes ---

  // GET /api/developer/apps - List my apps
  app.get("/api/developer/apps", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const myApps = await db.select().from(apps).where(eq(apps.developerId, authUser.id)).orderBy(desc(apps.createdAt));
    return { apps: myApps };
  });

  // POST /api/developer/apps - Create app
  app.post("/api/developer/apps", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const body = createPlatformAppSchema.parse(request.body);

    // Create app
    const [newApp] = await db.insert(apps).values({
      developerId: authUser.id,
      name: body.name,
      description: body.description,
      category: body.category,
      externalUrl: body.externalUrl,
      iconUrl: body.iconUrl ?? null,
      status: "draft",
    }).returning();

    // Auto-generate OAuth client
    const clientId = `app_${crypto.randomBytes(16).toString("hex")}`;
    const clientSecret = crypto.randomBytes(32).toString("hex");

    const [oauthClient] = await db.insert(appOAuthClients).values({
      appId: newApp.id,
      clientId,
      clientSecret,
      redirectUris: [body.externalUrl],
    }).returning();

    return { app: newApp, credentials: { clientId, clientSecret } };
  });

  // PUT /api/developer/apps/:id - Update app
  app.put("/api/developer/apps/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const { id } = request.params as any;
    const body = updatePlatformAppSchema.parse(request.body);

    const [existing] = await db.select().from(apps).where(and(eq(apps.id, id), eq(apps.developerId, authUser.id)));
    if (!existing) return reply.status(404).send({ error: "App not found" });

    const [updated] = await db.update(apps).set({ ...body, updatedAt: new Date() }).where(eq(apps.id, id)).returning();
    return updated;
  });

  // DELETE /api/developer/apps/:id
  app.delete("/api/developer/apps/:id", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const { id } = request.params as any;

    const [existing] = await db.select().from(apps).where(and(eq(apps.id, id), eq(apps.developerId, authUser.id)));
    if (!existing) return reply.status(404).send({ error: "App not found" });

    await db.delete(apps).where(eq(apps.id, id));
    return { success: true };
  });

  // POST /api/developer/apps/:id/publish
  app.post("/api/developer/apps/:id/publish", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const { id } = request.params as any;

    const [existing] = await db.select().from(apps).where(and(eq(apps.id, id), eq(apps.developerId, authUser.id)));
    if (!existing) return reply.status(404).send({ error: "App not found" });

    const [updated] = await db.update(apps).set({ status: "published", updatedAt: new Date() }).where(eq(apps.id, id)).returning();
    return updated;
  });

  // POST /api/developer/apps/:id/unpublish
  app.post("/api/developer/apps/:id/unpublish", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const { id } = request.params as any;

    const [existing] = await db.select().from(apps).where(and(eq(apps.id, id), eq(apps.developerId, authUser.id)));
    if (!existing) return reply.status(404).send({ error: "App not found" });

    const [updated] = await db.update(apps).set({ status: "draft", updatedAt: new Date() }).where(eq(apps.id, id)).returning();
    return updated;
  });

  // GET /api/developer/apps/:id/credentials
  app.get("/api/developer/apps/:id/credentials", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const { id } = request.params as any;

    const [existing] = await db.select().from(apps).where(and(eq(apps.id, id), eq(apps.developerId, authUser.id)));
    if (!existing) return reply.status(404).send({ error: "App not found" });

    const [client] = await db.select({ clientId: appOAuthClients.clientId, redirectUris: appOAuthClients.redirectUris, createdAt: appOAuthClients.createdAt })
      .from(appOAuthClients).where(eq(appOAuthClients.appId, id));

    return { clientId: client?.clientId, redirectUris: client?.redirectUris };
  });

  // POST /api/developer/apps/:id/regenerate-secret
  app.post("/api/developer/apps/:id/regenerate-secret", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const { id } = request.params as any;

    const [existing] = await db.select().from(apps).where(and(eq(apps.id, id), eq(apps.developerId, authUser.id)));
    if (!existing) return reply.status(404).send({ error: "App not found" });

    const newSecret = crypto.randomBytes(32).toString("hex");
    await db.update(appOAuthClients).set({ clientSecret: newSecret }).where(eq(appOAuthClients.appId, id));

    // Invalidate all existing tokens for this app
    await db.delete(oauthAccessTokens).where(eq(oauthAccessTokens.appId, id));

    return { clientSecret: newSecret };
  });

  // GET /api/developer/apps/:id/stats - Usage dashboard
  app.get("/api/developer/apps/:id/stats", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const { id } = request.params as any;

    const [existing] = await db.select().from(apps).where(and(eq(apps.id, id), eq(apps.developerId, authUser.id)));
    if (!existing) return reply.status(404).send({ error: "App not found" });

    const [apiCallStats] = await db.select({ count: sql<number>`count(*)::int` }).from(agentApiCalls).where(eq(agentApiCalls.appId, id));
    const [uniqueUsers] = await db.select({ count: sql<number>`count(distinct user_id)::int` }).from(oauthAccessTokens).where(eq(oauthAccessTokens.appId, id));
    const [txStats] = await db.select({
      count: sql<number>`count(*)::int`,
      totalAmount: sql<number>`coalesce(sum(abs(amount)), 0)::int`
    }).from(coinTransactions).where(eq(coinTransactions.relatedAppId, id));

    return {
      apiCalls: apiCallStats?.count ?? 0,
      uniqueUsers: uniqueUsers?.count ?? 0,
      transactions: txStats?.count ?? 0,
      totalTransactionAmount: txStats?.totalAmount ?? 0,
    };
  });

  // POST /api/developer/apps/:id/redirect-uris - Update redirect URIs
  app.post("/api/developer/apps/:id/redirect-uris", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const { id } = request.params as any;
    const { redirectUris } = request.body as { redirectUris: string[] };

    const [existing] = await db.select().from(apps).where(and(eq(apps.id, id), eq(apps.developerId, authUser.id)));
    if (!existing) return reply.status(404).send({ error: "App not found" });

    await db.update(appOAuthClients).set({ redirectUris }).where(eq(appOAuthClients.appId, id));
    return { success: true, redirectUris };
  });
}
