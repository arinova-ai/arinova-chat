/**
 * IndexedDB-backed message cache using idb-keyval.
 *
 * Persists the most recent messages per conversation so the PWA can render
 * cached content immediately on reopen. Stale entries (>24 h) are treated as
 * expired and silently pruned.
 */

import { get, set, del, keys, createStore } from "idb-keyval";
import type { Message } from "@arinova/shared/types";

// Dedicated IDB database / object-store so we don't collide with other data.
const store = createStore("arinova-msg-cache", "messages");

const MAX_MESSAGES_PER_CONV = 200;
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedEntry {
  messages: Message[];
  ts: number; // Date.now() when cached
}

// ─── Public API ───

/** Return cached messages for a conversation, or null if missing / expired. */
export async function getCachedMessages(
  conversationId: string,
): Promise<Message[] | null> {
  try {
    const entry = await get<CachedEntry>(`msg:${conversationId}`, store);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_MAX_AGE_MS) {
      // Expired — delete in background, return null
      del(`msg:${conversationId}`, store).catch(() => {});
      return null;
    }
    return entry.messages;
  } catch {
    return null;
  }
}

/** Persist messages for a conversation (trimmed to MAX). */
export async function setCachedMessages(
  conversationId: string,
  messages: Message[],
): Promise<void> {
  try {
    const trimmed = messages.slice(-MAX_MESSAGES_PER_CONV);
    await set(
      `msg:${conversationId}`,
      { messages: trimmed, ts: Date.now() } satisfies CachedEntry,
      store,
    );
  } catch {
    // Best-effort — silently ignore IDB quota / access errors
  }
}

/** Remove cached messages for a conversation. */
export async function deleteCachedMessages(
  conversationId: string,
): Promise<void> {
  try {
    await del(`msg:${conversationId}`, store);
  } catch {}
}

/** Save scroll position (scrollTop) for a conversation. */
export async function setCachedScrollPosition(
  conversationId: string,
  position: number,
): Promise<void> {
  try {
    await set(`scroll:${conversationId}`, position, store);
  } catch {}
}

/** Load saved scroll position, or null if none. */
export async function getCachedScrollPosition(
  conversationId: string,
): Promise<number | null> {
  try {
    return (await get<number>(`scroll:${conversationId}`, store)) ?? null;
  } catch {
    return null;
  }
}

/** Prune all expired message entries. Called once on app start. */
export async function pruneStaleCache(): Promise<void> {
  try {
    const allKeys = await keys(store);
    const now = Date.now();
    for (const key of allKeys) {
      if (typeof key === "string" && key.startsWith("msg:")) {
        const entry = await get<CachedEntry>(key, store);
        if (entry && now - entry.ts > CACHE_MAX_AGE_MS) {
          await del(key, store);
        }
      }
    }
  } catch {}
}

// ─── Debounced writer ───

const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Schedule a debounced cache write for a conversation.
 * During streaming, many rapid updates hit the store — we batch them so IDB
 * writes happen at most once per second per conversation.
 */
export function debouncedSetCachedMessages(
  conversationId: string,
  messages: Message[],
  delayMs = 1000,
): void {
  const existing = pendingWrites.get(conversationId);
  if (existing) clearTimeout(existing);
  pendingWrites.set(
    conversationId,
    setTimeout(() => {
      pendingWrites.delete(conversationId);
      setCachedMessages(conversationId, messages);
    }, delayMs),
  );
}
