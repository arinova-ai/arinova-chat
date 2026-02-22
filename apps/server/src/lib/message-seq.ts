import { db } from "../db/index.js";
import { messages } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

/**
 * Get the next sequence number for a conversation.
 * Uses MAX(seq) + 1 to ensure monotonically increasing per-conversation.
 */
export async function getNextSeq(conversationId: string): Promise<number> {
  const [result] = await db
    .select({ maxSeq: sql<number>`COALESCE(MAX(${messages.seq}), 0)` })
    .from(messages)
    .where(eq(messages.conversationId, conversationId));
  return (result?.maxSeq ?? 0) + 1;
}
