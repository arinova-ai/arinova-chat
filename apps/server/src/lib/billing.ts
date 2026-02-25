import { db } from "../db/index.js";
import {
  coinBalances,
  coinTransactions,
  marketplaceConversations,
  agentListings,
} from "../db/schema.js";
import { eq, sql } from "drizzle-orm";

const CREATOR_SHARE = 0.7; // 70% to creator, 30% platform fee

export interface BillingResult {
  allowed: boolean;
  reason?: string;
  freeTrialRemaining?: number;
}

/**
 * Check if user can send a message, considering free trial.
 * Returns whether the message is allowed and remaining free trial count.
 */
export async function checkBilling(
  userId: string,
  agentListingId: string,
): Promise<BillingResult> {
  // Get the listing + conversation in parallel
  const [[listing], [conversation]] = await Promise.all([
    db
      .select({
        pricePerMessage: agentListings.pricePerMessage,
        freeTrialMessages: agentListings.freeTrialMessages,
      })
      .from(agentListings)
      .where(eq(agentListings.id, agentListingId)),
    db
      .select({ messageCount: marketplaceConversations.messageCount })
      .from(marketplaceConversations)
      .where(
        sql`${marketplaceConversations.userId} = ${userId} AND ${marketplaceConversations.agentListingId} = ${agentListingId}`,
      ),
  ]);

  if (!listing) {
    return { allowed: false, reason: "Agent listing not found" };
  }

  const messageCount = conversation?.messageCount ?? 0;
  const freeRemaining = Math.max(0, listing.freeTrialMessages - messageCount);

  // Free trial still active — no charge
  if (freeRemaining > 0) {
    return { allowed: true, freeTrialRemaining: freeRemaining - 1 };
  }

  // Free agent (price = 0) — always allowed
  if (listing.pricePerMessage === 0) {
    return { allowed: true, freeTrialRemaining: 0 };
  }

  // Check balance
  const [balance] = await db
    .select({ balance: coinBalances.balance })
    .from(coinBalances)
    .where(eq(coinBalances.userId, userId));

  if (!balance || balance.balance < listing.pricePerMessage) {
    return {
      allowed: false,
      reason: `Insufficient coins. Need ${listing.pricePerMessage}, have ${balance?.balance ?? 0}`,
    };
  }

  return { allowed: true, freeTrialRemaining: 0 };
}

/**
 * Atomically deduct coins from user and credit creator earnings.
 * Uses a single UPDATE with WHERE balance >= price to prevent overdraft.
 */
export async function deductCoins(
  userId: string,
  agentListingId: string,
  price: number,
  creatorId: string,
): Promise<boolean> {
  if (price <= 0) return true;

  const creatorEarning = Math.floor(price * CREATOR_SHARE);

  // Single transaction: deduct user → record purchase → credit creator → record earning
  return await db.transaction(async (tx) => {
    // Atomic deduction — returns nothing if balance insufficient
    const [updated] = await tx
      .update(coinBalances)
      .set({
        balance: sql`${coinBalances.balance} - ${price}`,
        updatedAt: new Date(),
      })
      .where(
        sql`${coinBalances.userId} = ${userId} AND ${coinBalances.balance} >= ${price}`,
      )
      .returning({ balance: coinBalances.balance });

    if (!updated) {
      return false;
    }

    // Record user's purchase transaction
    await tx.insert(coinTransactions).values({
      userId,
      type: "purchase",
      amount: -price,
      description: `Marketplace chat: ${agentListingId}`,
    });

    // Credit creator balance
    await tx
      .update(coinBalances)
      .set({
        balance: sql`${coinBalances.balance} + ${creatorEarning}`,
        updatedAt: new Date(),
      })
      .where(eq(coinBalances.userId, creatorId));

    // Record creator earning transaction
    await tx.insert(coinTransactions).values({
      userId: creatorId,
      type: "earning",
      amount: creatorEarning,
      description: `Marketplace earning: ${agentListingId}`,
    });

    return true;
  });
}

/**
 * Increment message count on the conversation and agent listing stats.
 */
export async function recordMessage(
  conversationId: string,
  agentListingId: string,
  price: number,
): Promise<void> {
  await Promise.all([
    db
      .update(marketplaceConversations)
      .set({
        messageCount: sql`${marketplaceConversations.messageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceConversations.id, conversationId)),
    db
      .update(agentListings)
      .set({
        totalMessages: sql`${agentListings.totalMessages} + 1`,
        totalRevenue: sql`${agentListings.totalRevenue} + ${price}`,
      })
      .where(eq(agentListings.id, agentListingId)),
  ]);
}
