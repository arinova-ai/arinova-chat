import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { developerAccounts, apps, appVersions, coinTransactions } from "../db/schema.js";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { z } from "zod";

const registerDeveloperSchema = z.object({
  displayName: z.string().min(1).max(100),
  contactEmail: z.string().email(),
  payoutInfo: z.string().optional(),
});

export async function developerRoutes(app: FastifyInstance) {
  // Task 12.1: Developer registration
  app.post("/api/developer/register", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const body = registerDeveloperSchema.parse(request.body);

    // Check if already registered
    const [existing] = await db
      .select()
      .from(developerAccounts)
      .where(eq(developerAccounts.userId, user.id));

    if (existing) {
      return reply.status(409).send({ error: "Already registered as a developer" });
    }

    const [developer] = await db
      .insert(developerAccounts)
      .values({
        userId: user.id,
        displayName: body.displayName,
        contactEmail: body.contactEmail,
        payoutInfo: body.payoutInfo ?? null,
        termsAcceptedAt: new Date(),
      })
      .returning();

    return reply.status(201).send({ developer });
  });

  // Get developer profile
  app.get("/api/developer/profile", async (request, reply) => {
    const user = await requireAuth(request, reply);

    const [developer] = await db
      .select()
      .from(developerAccounts)
      .where(eq(developerAccounts.userId, user.id));

    if (!developer) {
      return reply.status(404).send({ error: "Not registered as a developer" });
    }

    return reply.send({ developer });
  });

  // Task 12.3: List developer's apps
  app.get("/api/developer/apps", async (request, reply) => {
    const user = await requireAuth(request, reply);

    const [developer] = await db
      .select()
      .from(developerAccounts)
      .where(eq(developerAccounts.userId, user.id));

    if (!developer) {
      return reply.status(403).send({ error: "Developer account required" });
    }

    const myApps = await db
      .select()
      .from(apps)
      .where(eq(apps.developerId, developer.id))
      .orderBy(desc(apps.createdAt));

    return reply.send({ apps: myApps });
  });

  // Get app versions
  app.get<{ Params: { id: string } }>(
    "/api/developer/apps/:id/versions",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [developer] = await db
        .select()
        .from(developerAccounts)
        .where(eq(developerAccounts.userId, user.id));

      if (!developer) {
        return reply.status(403).send({ error: "Developer account required" });
      }

      // Verify app ownership
      const [appRecord] = await db
        .select()
        .from(apps)
        .where(and(eq(apps.id, request.params.id), eq(apps.developerId, developer.id)));

      if (!appRecord) {
        return reply.status(404).send({ error: "App not found" });
      }

      const versions = await db
        .select()
        .from(appVersions)
        .where(eq(appVersions.appId, appRecord.id))
        .orderBy(desc(appVersions.createdAt));

      return reply.send({ versions });
    }
  );

  // Task 12.4: Developer earnings
  app.get("/api/developer/earnings", async (request, reply) => {
    const user = await requireAuth(request, reply);

    const [developer] = await db
      .select()
      .from(developerAccounts)
      .where(eq(developerAccounts.userId, user.id));

    if (!developer) {
      return reply.status(403).send({ error: "Developer account required" });
    }

    // Get all earning transactions
    const earnings = await db
      .select()
      .from(coinTransactions)
      .where(
        and(
          eq(coinTransactions.userId, user.id),
          eq(coinTransactions.type, "earning")
        )
      )
      .orderBy(desc(coinTransactions.createdAt));

    const totalEarnings = earnings.reduce((sum, t) => sum + t.amount, 0);

    return reply.send({
      totalEarnings,
      transactions: earnings,
    });
  });
}
