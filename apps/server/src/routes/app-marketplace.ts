import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  apps,
  appVersions,
  developerAccounts,
} from "../db/schema.js";
import { eq, and, ilike, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

export async function appMarketplaceRoutes(app: FastifyInstance) {
  // Task 6.1: List published apps with filtering
  app.get<{
    Querystring: {
      category?: string;
      search?: string;
      platform?: "web" | "ios" | "android";
      limit?: string;
      offset?: string;
    };
  }>("/api/marketplace/apps", async (request, reply) => {
    await requireAuth(request, reply);

    const limit = Math.min(parseInt(request.query.limit ?? "20"), 50);
    const offset = parseInt(request.query.offset ?? "0");

    const conditions = [eq(apps.status, "published")];

    if (request.query.category) {
      conditions.push(eq(apps.category, request.query.category));
    }

    if (request.query.search) {
      conditions.push(ilike(apps.name, `%${request.query.search}%`));
    }

    const results = await db
      .select({
        id: apps.id,
        name: apps.name,
        description: apps.description,
        category: apps.category,
        iconUrl: apps.iconUrl,
        externalUrl: apps.externalUrl,
        createdAt: apps.createdAt,
      })
      .from(apps)
      .where(and(...conditions))
      .orderBy(desc(apps.createdAt))
      .limit(limit)
      .offset(offset);

    return reply.send({ apps: results, total: results.length });
  });

  // Task 6.2: App detail page data
  app.get<{ Params: { id: string } }>(
    "/api/marketplace/apps/:id",
    async (request, reply) => {
      await requireAuth(request, reply);

      const [appRecord] = await db
        .select()
        .from(apps)
        .where(and(eq(apps.id, request.params.id), eq(apps.status, "published")));

      if (!appRecord) {
        return reply.status(404).send({ error: "App not found" });
      }

      // Get developer info
      const [developer] = await db
        .select({ displayName: developerAccounts.displayName })
        .from(developerAccounts)
        .where(eq(developerAccounts.id, appRecord.developerId));

      // Get latest published version manifest
      let manifest = null;
      const [latestVersion] = await db
        .select()
        .from(appVersions)
        .where(and(eq(appVersions.appId, appRecord.id), eq(appVersions.status, "published")))
        .orderBy(desc(appVersions.createdAt))
        .limit(1);
      if (latestVersion) {
        manifest = latestVersion.manifestJson;
      }

      return reply.send({
        app: {
          id: appRecord.id,
          name: appRecord.name,
          description: appRecord.description,
          category: appRecord.category,
          iconUrl: appRecord.iconUrl,
          externalUrl: appRecord.externalUrl,
          developer: developer?.displayName ?? "Unknown",
          manifest,
          createdAt: appRecord.createdAt,
        },
      });
    }
  );
}
