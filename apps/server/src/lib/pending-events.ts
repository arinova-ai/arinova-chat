import { redis } from "../db/redis.js";
import type { WSServerEvent } from "@arinova/shared/types";

const KEY_PREFIX = "pending_ws_events:";
const MAX_EVENTS_PER_USER = 1000;
const TTL_SECONDS = 86400; // 24 hours

function key(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

/**
 * Push a WS event to a user's pending queue.
 * Uses timestamp as score for ordering.
 */
export async function pushEvent(userId: string, event: WSServerEvent) {
  const k = key(userId);
  const score = Date.now();
  await redis.zadd(k, score, JSON.stringify(event));

  // Cap at MAX_EVENTS_PER_USER (remove oldest)
  const count = await redis.zcard(k);
  if (count > MAX_EVENTS_PER_USER) {
    await redis.zremrangebyrank(k, 0, count - MAX_EVENTS_PER_USER - 1);
  }

  // Reset TTL
  await redis.expire(k, TTL_SECONDS);
}

/**
 * Get all pending events for a user.
 */
export async function getPendingEvents(userId: string): Promise<WSServerEvent[]> {
  const k = key(userId);
  const items = await redis.zrange(k, 0, -1);
  return items.map((item) => JSON.parse(item) as WSServerEvent);
}

/**
 * Clear all pending events for a user (after successful delivery).
 */
export async function clearPendingEvents(userId: string) {
  await redis.del(key(userId));
}
