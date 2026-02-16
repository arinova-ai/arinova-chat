import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  apps,
  appVersions,
  developerAccounts,
} from "../db/schema.js";
import { eq, and, ilike, sql, desc } from "drizzle-orm";
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
        appId: apps.appId,
        name: apps.name,
        description: apps.description,
        category: apps.category,
        icon: apps.icon,
        currentVersionId: apps.currentVersionId,
        createdAt: apps.createdAt,
      })
      .from(apps)
      .where(and(...conditions))
      .orderBy(desc(apps.createdAt))
      .limit(limit)
      .offset(offset);

    // Task 6.5: Platform-aware filtering (post-query filter on manifest)
    let filtered = results;
    if (request.query.platform) {
      const platform = request.query.platform;
      const versionIds = results
        .map((r) => r.currentVersionId)
        .filter((id): id is string => id !== null);

      if (versionIds.length > 0) {
        const versions = await db
          .select({ id: appVersions.id, manifestJson: appVersions.manifestJson })
          .from(appVersions)
          .where(sql`${appVersions.id} = ANY(${versionIds})`);

        const platformApps = new Set(
          versions
            .filter((v) => {
              const m = v.manifestJson as Record<string, unknown>;
              const platforms = m.platforms as Record<string, boolean> | undefined;
              return platforms?.[platform] === true;
            })
            .map((v) => v.id)
        );

        filtered = results.filter(
          (r) => r.currentVersionId && platformApps.has(r.currentVersionId)
        );
      }
    }

    return reply.send({ apps: filtered, total: filtered.length });
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

      // Get current version manifest
      let manifest = null;
      if (appRecord.currentVersionId) {
        const [version] = await db
          .select()
          .from(appVersions)
          .where(eq(appVersions.id, appRecord.currentVersionId));
        if (version) {
          manifest = version.manifestJson;
        }
      }

      return reply.send({
        app: {
          id: appRecord.id,
          appId: appRecord.appId,
          name: appRecord.name,
          description: appRecord.description,
          category: appRecord.category,
          icon: appRecord.icon,
          developer: developer?.displayName ?? "Unknown",
          manifest,
          createdAt: appRecord.createdAt,
        },
      });
    }
  );
}
