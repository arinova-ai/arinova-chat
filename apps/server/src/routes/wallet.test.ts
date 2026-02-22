import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

// Mock auth middleware
vi.mock("../middleware/auth.js", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    id: "00000000-0000-0000-0000-000000000001",
    email: "test@example.com",
    name: "Test User",
  }),
}));

// Mock db
vi.mock("../db/index.js", () => {
  const mockDb = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
  };
  return { db: mockDb };
});

import { walletRoutes } from "./wallet.js";
import { db } from "../db/index.js";

const USER_ID = "00000000-0000-0000-0000-000000000001";

function mockBalance(balance: number = 100) {
  return {
    id: "00000000-0000-0000-0000-000000000030",
    userId: USER_ID,
    balance,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
  };
}

describe("Wallet Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(walletRoutes);
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /api/wallet/balance", () => {
    it("returns balance of 0 when no record exists", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: "/api/wallet/balance",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.balance).toBe(0);
    });

    it("returns the stored balance when record exists", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([mockBalance(500)]);

      const res = await app.inject({
        method: "GET",
        url: "/api/wallet/balance",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.balance).toBe(500);
    });
  });

  describe("GET /api/wallet/transactions", () => {
    it("returns transaction list with defaults", async () => {
      const transactions = [
        {
          id: "00000000-0000-0000-0000-000000000040",
          userId: USER_ID,
          type: "topup",
          amount: 100,
          description: "Top-up 100 coins",
          createdAt: new Date("2024-01-01"),
        },
      ];

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.orderBy).mockReturnValue(db as any);
      vi.mocked(db.limit).mockReturnValue(db as any);
      vi.mocked(db.offset).mockResolvedValue(transactions);

      const res = await app.inject({
        method: "GET",
        url: "/api/wallet/transactions",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty("transactions");
      expect(Array.isArray(body.transactions)).toBe(true);
      expect(body.transactions).toHaveLength(1);
      expect(body.transactions[0].type).toBe("topup");
    });

    it("returns empty transactions when none exist", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.orderBy).mockReturnValue(db as any);
      vi.mocked(db.limit).mockReturnValue(db as any);
      vi.mocked(db.offset).mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: "/api/wallet/transactions",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.transactions).toHaveLength(0);
    });
  });

  describe("POST /api/wallet/topup", () => {
    it("increases balance and returns new balance", async () => {
      const updatedBalance = mockBalance(200);

      // The route makes 3 awaited db calls in sequence:
      // 1. insert(coinBalances).values({...}).onConflictDoUpdate({...}) — terminal: onConflictDoUpdate
      // 2. insert(coinTransactions).values({...})                        — terminal: values
      // 3. select().from(coinBalances).where(...)                        — terminal: where

      vi.mocked(db.insert).mockReturnValue(db as any);
      vi.mocked(db.values).mockReturnValue(db as any);

      // onConflictDoUpdate is the terminal for the upsert
      vi.mocked(db.onConflictDoUpdate).mockResolvedValue(undefined);

      // For the second insert, `values` is called but then NOT chained with onConflictDoUpdate.
      // However since we mock `values` to return `db`, and `db` is awaitable only if it has
      // a `.then`. We need `values` on the second call to resolve as a promise.
      // Use a call counter on `values`:
      let valuesCallCount = 0;
      vi.mocked(db.values).mockImplementation((..._args: any[]) => {
        valuesCallCount++;
        if (valuesCallCount === 2) {
          // Second call: coinTransactions insert — terminal, resolve immediately
          return Promise.resolve(undefined) as any;
        }
        // First call: coinBalances upsert — continues to onConflictDoUpdate
        return db as any;
      });

      // Final select to get updated balance — terminal: where
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([updatedBalance]);

      const res = await app.inject({
        method: "POST",
        url: "/api/wallet/topup",
        payload: { amount: 100 },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty("balance");
      expect(body.balance).toBe(200);
    });

    it("returns 400 when amount is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/wallet/topup",
        payload: {},
      });

      // Zod validation fails
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("returns 400 when amount is zero", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/wallet/topup",
        payload: { amount: 0 },
      });

      // topupSchema requires positive
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("returns 400 when amount exceeds 100000", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/wallet/topup",
        payload: { amount: 999999 },
      });

      // topupSchema max is 100000
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("returns 400 when amount is non-integer", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/wallet/topup",
        payload: { amount: 99.5 },
      });

      // topupSchema requires int
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
