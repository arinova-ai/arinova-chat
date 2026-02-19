import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { notificationPreferences } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { notificationPreferenceSchema } from "@arinova/shared/schemas";

export async function notificationRoutes(app: FastifyInstance) {
  // GET /api/notifications/preferences
  app.get("/api/notifications/preferences", async (request, reply) => {
    const user = await requireAuth(request, reply);

    const [prefs] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, user.id));

    if (!prefs) {
      // Return defaults (all enabled, no quiet hours)
      return {
        globalEnabled: true,
        messageEnabled: true,
        playgroundInviteEnabled: true,
        playgroundTurnEnabled: true,
        playgroundResultEnabled: true,
        quietHoursStart: null,
        quietHoursEnd: null,
      };
    }

    return {
      globalEnabled: prefs.globalEnabled,
      messageEnabled: prefs.messageEnabled,
      playgroundInviteEnabled: prefs.playgroundInviteEnabled,
      playgroundTurnEnabled: prefs.playgroundTurnEnabled,
      playgroundResultEnabled: prefs.playgroundResultEnabled,
      quietHoursStart: prefs.quietHoursStart ?? null,
      quietHoursEnd: prefs.quietHoursEnd ?? null,
    };
  });

  // PUT /api/notifications/preferences
  app.put("/api/notifications/preferences", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const body = notificationPreferenceSchema.parse(request.body);

    const [existing] = await db
      .select({ id: notificationPreferences.id })
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, user.id));

    if (existing) {
      await db
        .update(notificationPreferences)
        .set({
          globalEnabled: body.globalEnabled,
          messageEnabled: body.messageEnabled,
          playgroundInviteEnabled: body.playgroundInviteEnabled,
          playgroundTurnEnabled: body.playgroundTurnEnabled,
          playgroundResultEnabled: body.playgroundResultEnabled,
          quietHoursStart: body.quietHoursStart,
          quietHoursEnd: body.quietHoursEnd,
        })
        .where(eq(notificationPreferences.id, existing.id));
    } else {
      await db.insert(notificationPreferences).values({
        userId: user.id,
        globalEnabled: body.globalEnabled,
        messageEnabled: body.messageEnabled,
        playgroundInviteEnabled: body.playgroundInviteEnabled,
        playgroundTurnEnabled: body.playgroundTurnEnabled,
        playgroundResultEnabled: body.playgroundResultEnabled,
        quietHoursStart: body.quietHoursStart,
        quietHoursEnd: body.quietHoursEnd,
      });
    }

    return { ok: true };
  });
}
