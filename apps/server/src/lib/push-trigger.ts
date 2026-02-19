import { db } from "../db/index.js";
import { notificationPreferences } from "../db/schema.js";
import { eq } from "drizzle-orm";
import type { NotificationType } from "@arinova/shared/types";

// Deduplication: suppress same-type notifications within a time window
// Key: "userId:type" → timestamp of last sent push
const lastPushSent = new Map<string, number>();
const DEDUP_WINDOW_MS = 30_000; // 30 seconds

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const cutoff = Date.now() - DEDUP_WINDOW_MS * 2;
  for (const [key, ts] of lastPushSent) {
    if (ts < cutoff) lastPushSent.delete(key);
  }
}, 60_000);

/**
 * Check whether a push notification should be sent to a user
 * based on their notification preferences, quiet hours, and deduplication.
 */
export async function shouldSendPush(
  userId: string,
  type: NotificationType,
): Promise<boolean> {
  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));

  // No preferences saved yet — default is all enabled
  if (!prefs) {
    return checkDedup(userId, type);
  }

  // Global toggle
  if (!prefs.globalEnabled) return false;

  // Per-type toggle
  const typeMap: Record<NotificationType, boolean> = {
    message: prefs.messageEnabled,
    playground_invite: prefs.playgroundInviteEnabled,
    playground_turn: prefs.playgroundTurnEnabled,
    playground_result: prefs.playgroundResultEnabled,
  };
  if (!typeMap[type]) return false;

  // Quiet hours check
  if (prefs.quietHoursStart && prefs.quietHoursEnd) {
    if (isInQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd)) {
      return false;
    }
  }

  return checkDedup(userId, type);
}

/**
 * Deduplication check: suppress same-type pushes within DEDUP_WINDOW_MS.
 * Records the timestamp when allowed.
 */
function checkDedup(userId: string, type: NotificationType): boolean {
  const key = `${userId}:${type}`;
  const now = Date.now();
  const last = lastPushSent.get(key);

  if (last && now - last < DEDUP_WINDOW_MS) {
    return false;
  }

  lastPushSent.set(key, now);
  return true;
}

function isInQuietHours(start: string, end: string): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  if (startMin <= endMin) {
    // Same-day range: e.g. 09:00 - 17:00
    return currentMinutes >= startMin && currentMinutes < endMin;
  } else {
    // Overnight range: e.g. 23:00 - 07:00
    return currentMinutes >= startMin || currentMinutes < endMin;
  }
}
