import type { FastifyInstance } from "fastify";
import { requireAuth } from "../middleware/auth.js";
import {
  claimDailyCoins,
  getPlayCoinBalance,
  placeBet,
  getTransactionHistory,
} from "../lib/playground-economy.js";
import { db } from "../db/index.js";
import {
  playgroundSessions,
  playgroundParticipants,
  playgrounds,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import type { PlaygroundDefinition } from "@arinova/shared/types";

export async function playgroundEconomyRoutes(app: FastifyInstance) {
  // ===== Play Coins =====

  // Claim daily play coins
  app.post("/api/playground/coins/claim", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const result = await claimDailyCoins(user.id);

    if (!result.granted) {
      return reply.status(429).send({
        error: "Daily coins already claimed",
        balance: result.balance,
        nextClaimAt: result.nextClaimAt,
      });
    }

    return reply.send({
      granted: true,
      amount: 100,
      balance: result.balance,
      nextClaimAt: result.nextClaimAt,
    });
  });

  // Get play coin balance
  app.get("/api/playground/coins/balance", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const result = await getPlayCoinBalance(user.id);

    return reply.send({
      balance: result.balance,
      lastGrantedAt: result.lastGrantedAt,
    });
  });

  // ===== Betting =====

  // Place a bet during an active session
  app.post<{
    Params: { sessionId: string };
    Body: { amount: number };
  }>("/api/playground/sessions/:sessionId/bet", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const { sessionId } = request.params;
    const { amount } = request.body as { amount: number };

    if (!amount || amount <= 0) {
      return reply.status(400).send({ error: "Invalid bet amount" });
    }

    // Load session and playground definition
    const [session] = await db
      .select()
      .from(playgroundSessions)
      .where(eq(playgroundSessions.id, sessionId));

    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }

    if (session.status !== "active") {
      return reply.status(400).send({ error: "Session is not active" });
    }

    // Verify participant
    const [participant] = await db
      .select({ id: playgroundParticipants.id })
      .from(playgroundParticipants)
      .where(
        and(
          eq(playgroundParticipants.sessionId, sessionId),
          eq(playgroundParticipants.userId, user.id),
        ),
      );

    if (!participant) {
      return reply.status(403).send({ error: "Not a participant in this session" });
    }

    // Get playground definition for betting config
    const [pg] = await db
      .select({ definition: playgrounds.definition })
      .from(playgrounds)
      .where(eq(playgrounds.id, session.playgroundId));

    const def = pg!.definition as PlaygroundDefinition;

    if (!def.economy.betting?.enabled) {
      return reply.status(400).send({ error: "Betting is not enabled for this playground" });
    }

    const result = await placeBet(
      user.id,
      sessionId,
      amount,
      def.economy.currency,
      def.economy.betting,
    );

    if (!result.success) {
      return reply.status(400).send({ error: result.error });
    }

    return reply.send({ success: true });
  });

  // ===== Transaction History =====

  app.get<{
    Querystring: { page?: string; limit?: string };
  }>("/api/playground/transactions", async (request, reply) => {
    const user = await requireAuth(request, reply);
    const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(request.query.limit ?? "20", 10)));

    const result = await getTransactionHistory(user.id, page, limit);
    return reply.send(result);
  });
}
