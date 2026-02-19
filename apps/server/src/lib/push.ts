import webPush from "web-push";
import { env } from "../env.js";
import { db } from "../db/index.js";
import { pushSubscriptions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { NotificationType } from "@arinova/shared/types";

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return; // VAPID not configured — push disabled
  }
  webPush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY,
  );
  initialized = true;
}

export function isPushEnabled(): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

interface PushPayload {
  type: NotificationType;
  title: string;
  body: string;
  url?: string; // deep link path, e.g. /chat/conversation-id
  data?: Record<string, unknown>;
}

/**
 * Send push notification to all subscriptions for a user.
 * Automatically removes expired/invalid subscriptions (410 Gone).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  ensureInitialized();
  if (!isPushEnabled()) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  if (subs.length === 0) return;

  const jsonPayload = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webPush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        jsonPayload,
      ),
    ),
  );

  // Clean up expired subscriptions
  const expiredIds: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      const err = result.reason as { statusCode?: number };
      if (err.statusCode === 404 || err.statusCode === 410) {
        expiredIds.push(subs[i].id);
      }
    }
  }

  if (expiredIds.length > 0) {
    await Promise.all(
      expiredIds.map((id) =>
        db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id)),
      ),
    );
  }
}
