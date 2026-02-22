import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { coinBalances, coinTransactions, apps, appOAuthClients, user } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { economyChargeSchema, economyAwardSchema } from "@arinova/shared/schemas";
import { requireAppAuthFromRequest } from "./oauth.js";

const PLATFORM_FEE_RATE = 0.30; // 30% platform fee

export async function economyApiRoutes(app: FastifyInstance) {
  // POST /api/v1/economy/charge - Server-to-server, requires X-App-Secret
  app.post("/api/v1/economy/charge", async (request, reply) => {
    const appData = await requireAppSecret(request, reply);
    if (!appData) return;

    const body = economyChargeSchema.parse(request.body);

    // Check user exists
    const [targetUser] = await db.select({ id: user.id }).from(user).where(eq(user.id, body.userId));
    if (!targetUser) return reply.status(400).send({ error: "user_not_found" });

    // Check balance
    const [balance] = await db.select().from(coinBalances).where(eq(coinBalances.userId, body.userId));
    const currentBalance = balance?.balance ?? 0;

    if (currentBalance < body.amount) {
      return reply.status(400).send({ error: "insufficient_balance" });
    }

    // Deduct and record
    await db.transaction(async (tx) => {
      await tx.update(coinBalances)
        .set({ balance: sql`${coinBalances.balance} - ${body.amount}`, updatedAt: new Date() })
        .where(eq(coinBalances.userId, body.userId));

      await tx.insert(coinTransactions).values({
        userId: body.userId,
        type: "purchase",
        amount: -body.amount,
        relatedAppId: appData.appId,
        description: body.description || `Charge by ${appData.appName}`,
      });
    });

    const [newBalance] = await db.select({ balance: coinBalances.balance }).from(coinBalances).where(eq(coinBalances.userId, body.userId));

    return { transactionId: crypto.randomUUID(), newBalance: newBalance?.balance ?? 0 };
  });

  // POST /api/v1/economy/award - Server-to-server, requires X-App-Secret
  app.post("/api/v1/economy/award", async (request, reply) => {
    const appData = await requireAppSecret(request, reply);
    if (!appData) return;

    const body = economyAwardSchema.parse(request.body);

    const [targetUser] = await db.select({ id: user.id }).from(user).where(eq(user.id, body.userId));
    if (!targetUser) return reply.status(400).send({ error: "user_not_found" });

    const platformFee = Math.floor(body.amount * PLATFORM_FEE_RATE);
    const userAmount = body.amount - platformFee;

    await db.transaction(async (tx) => {
      // Upsert balance
      const [existing] = await tx.select().from(coinBalances).where(eq(coinBalances.userId, body.userId));
      if (existing) {
        await tx.update(coinBalances)
          .set({ balance: sql`${coinBalances.balance} + ${userAmount}`, updatedAt: new Date() })
          .where(eq(coinBalances.userId, body.userId));
      } else {
        await tx.insert(coinBalances).values({ userId: body.userId, balance: userAmount });
      }

      await tx.insert(coinTransactions).values({
        userId: body.userId,
        type: "earning",
        amount: userAmount,
        relatedAppId: appData.appId,
        description: body.description || `Award from ${appData.appName}`,
      });
    });

    const [newBalance] = await db.select({ balance: coinBalances.balance }).from(coinBalances).where(eq(coinBalances.userId, body.userId));

    return { transactionId: crypto.randomUUID(), newBalance: newBalance?.balance ?? 0, platformFee };
  });

  // GET /api/v1/economy/balance - Uses OAuth bearer token
  app.get("/api/v1/economy/balance", async (request, reply) => {
    const tokenData = await requireAppAuthFromRequest(request, reply);
    if (!tokenData) return;

    const [balance] = await db.select({ balance: coinBalances.balance }).from(coinBalances).where(eq(coinBalances.userId, tokenData.userId));

    return { balance: balance?.balance ?? 0 };
  });
}

// Verify X-App-Secret header for server-to-server calls
async function requireAppSecret(request: any, reply: any): Promise<{ appId: string; appName: string } | null> {
  const clientId = request.headers["x-client-id"] as string;
  const appSecret = request.headers["x-app-secret"] as string;

  if (!clientId || !appSecret) {
    reply.status(401).send({ error: "invalid_app_secret", message: "X-Client-Id and X-App-Secret headers required" });
    return null;
  }

  const [client] = await db.select().from(appOAuthClients).where(eq(appOAuthClients.clientId, clientId));
  if (!client || client.clientSecret !== appSecret) {
    reply.status(401).send({ error: "invalid_app_secret" });
    return null;
  }

  const [appInfo] = await db.select({ name: apps.name }).from(apps).where(eq(apps.id, client.appId));

  return { appId: client.appId, appName: appInfo?.name ?? "Unknown" };
}
