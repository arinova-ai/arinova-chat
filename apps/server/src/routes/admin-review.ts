import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { apps, appVersions, developerAccounts } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../env.js";

function isAdmin(email: string): boolean {
  const adminEmails = env.ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase());
}

export async function adminReviewRoutes(app: FastifyInstance) {
  // List apps pending review (in_review status)
  app.get("/api/admin/review/apps", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!isAdmin(user.email)) {
      return reply.status(403).send({ error: "Admin access required" });
    }

    const results = await db
      .select({
        app: apps,
        version: appVersions,
        developer: developerAccounts,
      })
      .from(apps)
      .innerJoin(appVersions, eq(appVersions.appId, apps.id))
      .innerJoin(developerAccounts, eq(developerAccounts.id, apps.developerId))
      .where(
        and(eq(apps.status, "in_review"), eq(appVersions.status, "in_review"))
      )
      .orderBy(appVersions.createdAt);

    return reply.send({
      apps: results.map((r) => ({
        id: r.app.id,
        name: r.app.name,
        description: r.app.description,
        category: r.app.category,
        iconUrl: r.app.iconUrl,
        status: r.app.status,
        createdAt: r.app.createdAt,
        version: {
          id: r.version.id,
          version: r.version.version,
          manifestJson: r.version.manifestJson,
          reviewNotes: r.version.reviewNotes,
          createdAt: r.version.createdAt,
        },
        developer: {
          id: r.developer.id,
          displayName: r.developer.displayName,
          contactEmail: r.developer.contactEmail,
        },
      })),
    });
  });

  // Approve an app (publish)
  app.post<{ Params: { id: string }; Body: { notes?: string } }>(
    "/api/admin/review/apps/:id/approve",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      if (!isAdmin(user.email)) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const [appRecord] = await db
        .select()
        .from(apps)
        .where(and(eq(apps.id, request.params.id), eq(apps.status, "in_review")));

      if (!appRecord) {
        return reply.status(404).send({ error: "App not found or not in review" });
      }

      // Find the in_review version
      const [version] = await db
        .select()
        .from(appVersions)
        .where(
          and(
            eq(appVersions.appId, appRecord.id),
            eq(appVersions.status, "in_review")
          )
        );

      if (!version) {
        return reply.status(404).send({ error: "No version pending review" });
      }

      const notes = (request.body as { notes?: string })?.notes;

      // Update version status to published
      await db
        .update(appVersions)
        .set({
          status: "published",
          reviewNotes: notes || null,
        })
        .where(eq(appVersions.id, version.id));

      // Update app status and current version
      await db
        .update(apps)
        .set({
          status: "published",
          updatedAt: new Date(),
        })
        .where(eq(apps.id, appRecord.id));

      return reply.send({ success: true });
    }
  );

  // Reject an app
  app.post<{ Params: { id: string }; Body: { notes: string } }>(
    "/api/admin/review/apps/:id/reject",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      if (!isAdmin(user.email)) {
        return reply.status(403).send({ error: "Admin access required" });
      }

      const [appRecord] = await db
        .select()
        .from(apps)
        .where(and(eq(apps.id, request.params.id), eq(apps.status, "in_review")));

      if (!appRecord) {
        return reply.status(404).send({ error: "App not found or not in review" });
      }

      const notes = (request.body as { notes?: string })?.notes;
      if (!notes) {
        return reply.status(400).send({ error: "Rejection reason is required" });
      }

      // Find the in_review version
      const [version] = await db
        .select()
        .from(appVersions)
        .where(
          and(
            eq(appVersions.appId, appRecord.id),
            eq(appVersions.status, "in_review")
          )
        );

      if (!version) {
        return reply.status(404).send({ error: "No version pending review" });
      }

      // Update version status to rejected
      await db
        .update(appVersions)
        .set({
          status: "rejected",
          reviewNotes: notes,
        })
        .where(eq(appVersions.id, version.id));

      // Update app status
      await db
        .update(apps)
        .set({
          status: "rejected",
          updatedAt: new Date(),
        })
        .where(eq(apps.id, appRecord.id));

      return reply.send({ success: true });
    }
  );
}
