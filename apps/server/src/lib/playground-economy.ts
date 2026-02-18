/**
 * Playground Economy Service
 *
 * Handles all financial operations for playground sessions:
 * - Play Coins daily grant and balance
 * - Entry fee collection and refund
 * - Prize pool settlement and distribution
 * - Per-round betting
 * - Transaction ledger recording
 */

import { db } from "../db/index.js";
import {
  playCoinBalances,
  playgroundTransactions,
  playgroundSessions,
  playgroundParticipants,
  coinBalances,
} from "../db/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";
import type {
  PlaygroundCurrency,
  PlaygroundDefinition,
} from "@arinova/shared/types";

const DAILY_GRANT_AMOUNT = 100;
const DAILY_GRANT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const PLATFORM_COMMISSION_RATE = 0.05; // 5% for arinova coins sessions

// ===== Play Coins =====

export async function claimDailyCoins(userId: string): Promise<{
  granted: boolean;
  balance: number;
  nextClaimAt: Date | null;
}> {
  const now = new Date();

  // Upsert balance row if not exists
  const [existing] = await db
    .select()
    .from(playCoinBalances)
    .where(eq(playCoinBalances.userId, userId));

  if (!existing) {
    // First-time claim — create row with grant
    await db.insert(playCoinBalances).values({
      userId,
      balance: DAILY_GRANT_AMOUNT,
      lastGrantedAt: now,
    });

    return {
      granted: true,
      balance: DAILY_GRANT_AMOUNT,
      nextClaimAt: new Date(now.getTime() + DAILY_GRANT_COOLDOWN_MS),
    };
  }

  // Check cooldown
  if (existing.lastGrantedAt) {
    const elapsed = now.getTime() - existing.lastGrantedAt.getTime();
    if (elapsed < DAILY_GRANT_COOLDOWN_MS) {
      const nextClaimAt = new Date(
        existing.lastGrantedAt.getTime() + DAILY_GRANT_COOLDOWN_MS,
      );
      return {
        granted: false,
        balance: existing.balance,
        nextClaimAt,
      };
    }
  }

  // Grant coins
  const newBalance = existing.balance + DAILY_GRANT_AMOUNT;
  await db
    .update(playCoinBalances)
    .set({ balance: newBalance, lastGrantedAt: now })
    .where(eq(playCoinBalances.userId, userId));

  return {
    granted: true,
    balance: newBalance,
    nextClaimAt: new Date(now.getTime() + DAILY_GRANT_COOLDOWN_MS),
  };
}

export async function getPlayCoinBalance(userId: string): Promise<{
  balance: number;
  lastGrantedAt: Date | null;
}> {
  const [row] = await db
    .select()
    .from(playCoinBalances)
    .where(eq(playCoinBalances.userId, userId));

  return {
    balance: row?.balance ?? 0,
    lastGrantedAt: row?.lastGrantedAt ?? null,
  };
}

// ===== Balance Helpers =====

async function getBalance(
  userId: string,
  currency: PlaygroundCurrency,
): Promise<number> {
  if (currency === "free") return Infinity;

  if (currency === "play") {
    const [row] = await db
      .select({ balance: playCoinBalances.balance })
      .from(playCoinBalances)
      .where(eq(playCoinBalances.userId, userId));
    return row?.balance ?? 0;
  }

  // arinova
  const [row] = await db
    .select({ balance: coinBalances.balance })
    .from(coinBalances)
    .where(eq(coinBalances.userId, userId));
  return row?.balance ?? 0;
}

async function creditBalance(
  userId: string,
  currency: PlaygroundCurrency,
  amount: number,
): Promise<void> {
  if (currency === "free") return;

  if (currency === "play") {
    // Upsert — credit existing or create new
    const [existing] = await db
      .select({ userId: playCoinBalances.userId })
      .from(playCoinBalances)
      .where(eq(playCoinBalances.userId, userId));

    if (existing) {
      await db
        .update(playCoinBalances)
        .set({
          balance: sql`${playCoinBalances.balance} + ${amount}`,
        })
        .where(eq(playCoinBalances.userId, userId));
    } else {
      await db.insert(playCoinBalances).values({
        userId,
        balance: amount,
      });
    }
    return;
  }

  // arinova
  const [existingCoin] = await db
    .select({ userId: coinBalances.userId })
    .from(coinBalances)
    .where(eq(coinBalances.userId, userId));

  if (existingCoin) {
    await db
      .update(coinBalances)
      .set({
        balance: sql`${coinBalances.balance} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(coinBalances.userId, userId));
  } else {
    await db.insert(coinBalances).values({
      userId,
      balance: amount,
    });
  }
}

// ===== Transaction Recording =====

async function recordTransaction(
  userId: string,
  sessionId: string | null,
  type: "entry_fee" | "bet" | "win" | "refund" | "commission",
  currency: PlaygroundCurrency,
  amount: number,
): Promise<void> {
  await db.insert(playgroundTransactions).values({
    userId,
    sessionId,
    type,
    currency,
    amount,
  });
}

// ===== Entry Fee =====

export async function collectEntryFee(
  userId: string,
  sessionId: string,
  amount: number,
  currency: PlaygroundCurrency,
): Promise<{ success: boolean; error?: string }> {
  if (currency === "free" || amount <= 0) {
    return { success: true };
  }

  // Check balance
  const balance = await getBalance(userId, currency);
  if (balance < amount) {
    return {
      success: false,
      error: `Insufficient ${currency} coins. Need ${amount}, have ${balance}.`,
    };
  }

  // Use transaction for atomicity
  await db.transaction(async (tx) => {
    // Deduct balance
    if (currency === "play") {
      await tx
        .update(playCoinBalances)
        .set({ balance: sql`${playCoinBalances.balance} - ${amount}` })
        .where(eq(playCoinBalances.userId, userId));
    } else {
      await tx
        .update(coinBalances)
        .set({
          balance: sql`${coinBalances.balance} - ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(coinBalances.userId, userId));
    }

    // Add to prize pool
    await tx
      .update(playgroundSessions)
      .set({ prizePool: sql`${playgroundSessions.prizePool} + ${amount}` })
      .where(eq(playgroundSessions.id, sessionId));

    // Record transaction
    await tx.insert(playgroundTransactions).values({
      userId,
      sessionId,
      type: "entry_fee",
      currency,
      amount: -amount, // negative = debit
    });
  });

  return { success: true };
}

// ===== Entry Fee Refund =====

export async function refundEntryFees(
  sessionId: string,
): Promise<void> {
  // Find all entry_fee transactions for this session
  const fees = await db
    .select()
    .from(playgroundTransactions)
    .where(
      and(
        eq(playgroundTransactions.sessionId, sessionId),
        eq(playgroundTransactions.type, "entry_fee"),
      ),
    );

  for (const fee of fees) {
    const refundAmount = Math.abs(fee.amount);
    if (refundAmount <= 0) continue;

    await creditBalance(fee.userId, fee.currency, refundAmount);
    await recordTransaction(
      fee.userId,
      sessionId,
      "refund",
      fee.currency,
      refundAmount, // positive = credit
    );
  }

  // Reset prize pool
  await db
    .update(playgroundSessions)
    .set({ prizePool: 0 })
    .where(eq(playgroundSessions.id, sessionId));
}

// ===== Prize Distribution =====

export async function settleSession(
  sessionId: string,
  definition: PlaygroundDefinition,
  winnerRoles: string[] | null,
): Promise<void> {
  const economy = definition.economy;
  if (economy.currency === "free") return;

  // Get session prize pool
  const [session] = await db
    .select({ prizePool: playgroundSessions.prizePool })
    .from(playgroundSessions)
    .where(eq(playgroundSessions.id, sessionId));

  if (!session || session.prizePool <= 0) return;

  let distributablePool = session.prizePool;

  // Deduct platform commission for arinova coins
  if (economy.currency === "arinova") {
    const commission = Math.floor(distributablePool * PLATFORM_COMMISSION_RATE);
    if (commission > 0) {
      distributablePool -= commission;
      // Record commission (no specific user — use a platform placeholder)
      await recordTransaction(
        "platform",
        sessionId,
        "commission",
        economy.currency,
        commission,
      );
    }
  }

  if (!winnerRoles || winnerRoles.length === 0) {
    // No winners — refund everyone
    await refundEntryFees(sessionId);
    return;
  }

  // Get participants with their roles
  const participants = await db
    .select()
    .from(playgroundParticipants)
    .where(eq(playgroundParticipants.sessionId, sessionId));

  const winningParticipants = participants.filter(
    (p) => p.role && winnerRoles.includes(p.role),
  );

  if (winningParticipants.length === 0) {
    // No matching winners — refund
    await refundEntryFees(sessionId);
    return;
  }

  // Distribute prizes
  if (economy.prizeDistribution === "winner-takes-all") {
    // Split evenly among winners
    const perWinner = Math.floor(distributablePool / winningParticipants.length);
    for (const winner of winningParticipants) {
      if (perWinner > 0) {
        await creditBalance(winner.userId, economy.currency, perWinner);
        await recordTransaction(
          winner.userId,
          sessionId,
          "win",
          economy.currency,
          perWinner,
        );
      }
    }
  } else {
    // Ranked percentage split — { first: 60, second: 30, third: 10 }
    const ranks = economy.prizeDistribution as Record<string, number>;
    const rankEntries = Object.entries(ranks).sort(
      ([, a], [, b]) => b - a,
    );

    for (let i = 0; i < winningParticipants.length && i < rankEntries.length; i++) {
      const [, percentage] = rankEntries[i];
      const prize = Math.floor((distributablePool * percentage) / 100);
      if (prize > 0) {
        await creditBalance(winningParticipants[i].userId, economy.currency, prize);
        await recordTransaction(
          winningParticipants[i].userId,
          sessionId,
          "win",
          economy.currency,
          prize,
        );
      }
    }
  }
}

// ===== Betting =====

export async function placeBet(
  userId: string,
  sessionId: string,
  amount: number,
  currency: PlaygroundCurrency,
  bettingConfig: { minBet: number; maxBet: number },
): Promise<{ success: boolean; error?: string }> {
  if (currency === "free") {
    return { success: true };
  }

  // Validate bet amount
  if (amount < bettingConfig.minBet) {
    return { success: false, error: `Minimum bet is ${bettingConfig.minBet}` };
  }
  if (amount > bettingConfig.maxBet) {
    return { success: false, error: `Maximum bet is ${bettingConfig.maxBet}` };
  }

  // Check balance
  const balance = await getBalance(userId, currency);
  if (balance < amount) {
    return {
      success: false,
      error: `Insufficient ${currency} coins. Need ${amount}, have ${balance}.`,
    };
  }

  await db.transaction(async (tx) => {
    // Deduct from balance
    if (currency === "play") {
      await tx
        .update(playCoinBalances)
        .set({ balance: sql`${playCoinBalances.balance} - ${amount}` })
        .where(eq(playCoinBalances.userId, userId));
    } else {
      await tx
        .update(coinBalances)
        .set({
          balance: sql`${coinBalances.balance} - ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(coinBalances.userId, userId));
    }

    // Add to session prize pool (reusing prizePool as combined pool)
    await tx
      .update(playgroundSessions)
      .set({ prizePool: sql`${playgroundSessions.prizePool} + ${amount}` })
      .where(eq(playgroundSessions.id, sessionId));

    // Record transaction
    await tx.insert(playgroundTransactions).values({
      userId,
      sessionId,
      type: "bet",
      currency,
      amount: -amount,
    });
  });

  return { success: true };
}

export async function settleRoundBets(
  sessionId: string,
  winnerUserIds: string[],
  currency: PlaygroundCurrency,
): Promise<void> {
  if (currency === "free" || winnerUserIds.length === 0) return;

  // Sum all bets for this session's current round
  const bets = await db
    .select()
    .from(playgroundTransactions)
    .where(
      and(
        eq(playgroundTransactions.sessionId, sessionId),
        eq(playgroundTransactions.type, "bet"),
      ),
    );

  const totalPot = bets.reduce((sum, b) => sum + Math.abs(b.amount), 0);
  if (totalPot <= 0) return;

  const perWinner = Math.floor(totalPot / winnerUserIds.length);
  for (const winnerId of winnerUserIds) {
    if (perWinner > 0) {
      await creditBalance(winnerId, currency, perWinner);
      await recordTransaction(winnerId, sessionId, "win", currency, perWinner);
    }
  }
}

// ===== Transaction History =====

export async function getTransactionHistory(
  userId: string,
  page: number = 1,
  limit: number = 20,
): Promise<{
  items: typeof playgroundTransactions.$inferSelect[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const offset = (page - 1) * limit;

  const [items, [{ count }]] = await Promise.all([
    db
      .select()
      .from(playgroundTransactions)
      .where(eq(playgroundTransactions.userId, userId))
      .orderBy(desc(playgroundTransactions.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(playgroundTransactions)
      .where(eq(playgroundTransactions.userId, userId)),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
}
