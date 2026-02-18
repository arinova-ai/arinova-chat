import { db } from "../db/index.js";
import { notificationPreferences } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { redis } from "../db/redis.js";
import type { NotificationType } from "@arinova/shared/types";

const DEDUP_WINDOW_SECONDS = 30;

/**
 * Check whether a push notification should be sent to a user
 * based on their notification preferences, quiet hours, and deduplication.
 */
export async function shouldSendPush(
  userId: string,
  type: NotificationType,
  entityId?: string,
): Promise<boolean> {
  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));

  // No preferences saved yet — default is all enabled
  if (!prefs) {
    return checkDedup(userId, type, entityId);
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

  return checkDedup(userId, type, entityId);
}

/**
 * Redis-based deduplication: suppress same-type pushes within DEDUP_WINDOW_SECONDS.
 * Uses SET with NX and EX for atomic check-and-set with TTL.
 * Key format: push:dedup:{userId}:{type}:{entityId}
 */
async function checkDedup(
  userId: string,
  type: NotificationType,
  entityId?: string,
): Promise<boolean> {
  const key = `push:dedup:${userId}:${type}:${entityId ?? "global"}`;

  // SET NX with TTL — returns "OK" if key was set (no duplicate), null if exists
  const result = await redis.set(key, "1", "EX", DEDUP_WINDOW_SECONDS, "NX");
  return result === "OK";
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
