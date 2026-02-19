import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { pushSubscriptions, notificationPreferences } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { pushSubscriptionSchema } from "@arinova/shared/schemas";
import { env } from "../env.js";

export async function pushRoutes(app: FastifyInstance) {
  // GET /api/push/vapid-key — return public VAPID key
  app.get("/api/push/vapid-key", async (_request, reply) => {
    if (!env.VAPID_PUBLIC_KEY) {
      return reply.status(503).send({ error: "Push notifications not configured" });
    }
    return { vapidPublicKey: env.VAPID_PUBLIC_KEY };
  });

  // POST /api/push/subscribe — store push subscription
  app.post("/api/push/subscribe", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const body = pushSubscriptionSchema.parse(request.body);

    // Upsert: if same endpoint exists for this user, update keys
    const [existing] = await db
      .select()
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, user.id),
          eq(pushSubscriptions.endpoint, body.endpoint),
        ),
      );

    if (existing) {
      await db
        .update(pushSubscriptions)
        .set({
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          deviceInfo: body.deviceInfo ?? null,
        })
        .where(eq(pushSubscriptions.id, existing.id));
    } else {
      await db.insert(pushSubscriptions).values({
        userId: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        deviceInfo: body.deviceInfo ?? null,
      });

      // Auto-init default notification preferences on first subscription
      const [existingPrefs] = await db
        .select({ id: notificationPreferences.id })
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, user.id));

      if (!existingPrefs) {
        await db.insert(notificationPreferences).values({
          userId: user.id,
        });
      }
    }

    return reply.status(201).send({ ok: true });
  });

  // DELETE /api/push/subscribe — remove subscription
  app.delete("/api/push/subscribe", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const { endpoint } = request.body as { endpoint?: string };

    if (!endpoint) {
      return reply.status(400).send({ error: "endpoint is required" });
    }

    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, user.id),
          eq(pushSubscriptions.endpoint, endpoint),
        ),
      );

    return { ok: true };
  });
}
