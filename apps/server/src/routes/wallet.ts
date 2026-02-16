import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import {
  coinBalances,
  coinTransactions,
  appPurchases,
  apps,
  developerAccounts,
} from "../db/schema.js";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { z } from "zod";

const purchaseSchema = z.object({
  productId: z.string().min(1),
  amount: z.number().int().positive(),
});

const topupSchema = z.object({
  amount: z.number().int().positive().max(100000),
});

export async function walletRoutes(app: FastifyInstance) {
  // Task 11.1: Get coin balance
  app.get("/api/wallet/balance", async (request, reply) => {
    const user = await requireAuth(request, reply);

    const [balance] = await db
      .select()
      .from(coinBalances)
      .where(eq(coinBalances.userId, user.id));

    return reply.send({ balance: balance?.balance ?? 0 });
  });

  // Task 11.1: Get transaction history
  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/api/wallet/transactions",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      const limit = Math.min(parseInt(request.query.limit ?? "20"), 50);
      const offset = parseInt(request.query.offset ?? "0");

      const transactions = await db
        .select()
        .from(coinTransactions)
        .where(eq(coinTransactions.userId, user.id))
        .orderBy(desc(coinTransactions.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send({ transactions });
    }
  );

  // Task 11.2: Coin top-up (simplified — no real payment processor in MVP)
  app.post("/api/wallet/topup", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const body = topupSchema.parse(request.body);

    // Upsert balance
    await db
      .insert(coinBalances)
      .values({ userId: user.id, balance: body.amount })
      .onConflictDoUpdate({
        target: coinBalances.userId,
        set: {
          balance: sql`${coinBalances.balance} + ${body.amount}`,
          updatedAt: new Date(),
        },
      });

    // Record transaction
    await db.insert(coinTransactions).values({
      userId: user.id,
      type: "topup",
      amount: body.amount,
      description: `Top-up ${body.amount} coins`,
    });

    const [updated] = await db
      .select()
      .from(coinBalances)
      .where(eq(coinBalances.userId, user.id));

    return reply.send({ balance: updated.balance });
  });

  // Task 11.3: In-app purchase processing
  app.post<{ Params: { id: string } }>(
    "/api/apps/:id/purchase",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      const body = purchaseSchema.parse(request.body);

      // Get app and its current version
      const [appRecord] = await db
        .select()
        .from(apps)
        .where(and(eq(apps.id, request.params.id), eq(apps.status, "published")));

      if (!appRecord || !appRecord.currentVersionId) {
        return reply.status(404).send({ error: "App not found" });
      }

      // Check balance
      const [balance] = await db
        .select()
        .from(coinBalances)
        .where(eq(coinBalances.userId, user.id));

      if (!balance || balance.balance < body.amount) {
        return reply.status(400).send({ error: "Insufficient coin balance" });
      }

      // Deduct balance atomically
      const [updated] = await db
        .update(coinBalances)
        .set({
          balance: sql`${coinBalances.balance} - ${body.amount}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(coinBalances.userId, user.id),
            gte(coinBalances.balance, body.amount)
          )
        )
        .returning();

      if (!updated) {
        return reply.status(400).send({ error: "Insufficient coin balance" });
      }

      // Create purchase record
      const [purchase] = await db
        .insert(appPurchases)
        .values({
          userId: user.id,
          appVersionId: appRecord.currentVersionId,
          productId: body.productId,
          amount: body.amount,
        })
        .returning();

      // Record transaction
      await db.insert(coinTransactions).values({
        userId: user.id,
        type: "purchase",
        amount: -body.amount,
        relatedAppId: appRecord.id,
        relatedProductId: body.productId,
        receiptId: purchase.id,
        description: `Purchase in ${appRecord.name}`,
      });

      // Task 11.4: Developer earning (70/30 split, developer gets 70%)
      const developerEarning = Math.floor(body.amount * 0.7);
      if (developerEarning > 0) {
        const [developer] = await db
          .select()
          .from(developerAccounts)
          .where(eq(developerAccounts.id, appRecord.developerId));

        if (developer) {
          await db
            .insert(coinBalances)
            .values({ userId: developer.userId, balance: developerEarning })
            .onConflictDoUpdate({
              target: coinBalances.userId,
              set: {
                balance: sql`${coinBalances.balance} + ${developerEarning}`,
                updatedAt: new Date(),
              },
            });

          await db.insert(coinTransactions).values({
            userId: developer.userId,
            type: "earning",
            amount: developerEarning,
            relatedAppId: appRecord.id,
            relatedProductId: body.productId,
            receiptId: purchase.id,
            description: `Earning from ${appRecord.name}`,
          });
        }
      }

      return reply.status(201).send({
        receipt: {
          receiptId: purchase.id,
          productId: purchase.productId,
          amount: purchase.amount,
          timestamp: purchase.createdAt.getTime(),
        },
        newBalance: updated.balance,
      });
    }
  );

  // Task 11.7: Refund API (within 24h)
  app.post<{ Params: { purchaseId: string } }>(
    "/api/purchases/:purchaseId/refund",
    async (request, reply) => {
      const user = await requireAuth(request, reply);

      const [purchase] = await db
        .select()
        .from(appPurchases)
        .where(
          and(
            eq(appPurchases.id, request.params.purchaseId),
            eq(appPurchases.userId, user.id),
            eq(appPurchases.status, "completed")
          )
        );

      if (!purchase) {
        return reply.status(404).send({ error: "Purchase not found" });
      }

      // Check 24h window
      const hoursSincePurchase =
        (Date.now() - purchase.createdAt.getTime()) / (1000 * 60 * 60);
      if (hoursSincePurchase > 24) {
        return reply.status(400).send({ error: "Refund window (24 hours) has expired" });
      }

      // Mark as refunded
      await db
        .update(appPurchases)
        .set({ status: "refunded" })
        .where(eq(appPurchases.id, purchase.id));

      // Refund coins to user
      await db
        .update(coinBalances)
        .set({
          balance: sql`${coinBalances.balance} + ${purchase.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(coinBalances.userId, user.id));

      // Record refund transaction
      await db.insert(coinTransactions).values({
        userId: user.id,
        type: "refund",
        amount: purchase.amount,
        relatedProductId: purchase.productId,
        receiptId: purchase.id,
        description: "Refund",
      });

      return reply.send({ success: true });
    }
  );
}
