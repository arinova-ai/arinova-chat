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
    groupBy: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
  };
  return { db: mockDb };
});

import { marketplaceRoutes } from "./marketplace.js";
import { db } from "../db/index.js";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const PUBLIC_AGENT_ID = "00000000-0000-0000-0000-000000000020";
const CLONED_AGENT_ID = "00000000-0000-0000-0000-000000000021";

function mockPublicAgent(overrides = {}) {
  return {
    id: PUBLIC_AGENT_ID,
    name: "Public Assistant",
    description: "A publicly available agent",
    avatarUrl: null,
    category: "productivity",
    usageCount: 42,
    ownerId: "00000000-0000-0000-0000-000000000099",
    a2aEndpoint: "https://example.com/a2a",
    isPublic: true,
    secretToken: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function mockClonedAgent(overrides = {}) {
  return {
    id: CLONED_AGENT_ID,
    name: "Public Assistant",
    description: "A publicly available agent",
    avatarUrl: null,
    category: "productivity",
    usageCount: 0,
    ownerId: USER_ID,
    a2aEndpoint: "https://example.com/a2a",
    isPublic: false,
    secretToken: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("Marketplace Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(marketplaceRoutes);
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /api/marketplace", () => {
    // Helper: wire up the db chain so that Promise.all([items, count]) resolves
    // correctly. The route calls:
    //   db.select().from().where().orderBy().limit().offset()  → items
    //   db.select().from().where()                             → count  (terminal: where)
    // Both run in parallel via Promise.all. We use a call counter on `where`
    // so the second call (count query) terminates at `where`, and the first
    // call resolves all the way at `offset`.
    function setupMarketplaceMocks(items: unknown[], count: number) {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.orderBy).mockReturnValue(db as any);
      vi.mocked(db.limit).mockReturnValue(db as any);
      vi.mocked(db.offset).mockResolvedValue(items);

      // The count query ends at where(); items query chains past where to offset.
      // We use a per-invocation counter.
      let whereCount = 0;
      vi.mocked(db.where).mockImplementation((..._args: any[]) => {
        whereCount++;
        if (whereCount === 2) {
          // Second call = count query (terminal)
          return Promise.resolve([{ count }]) as any;
        }
        // First call = items query (continues to orderBy → limit → offset)
        return db as any;
      });
    }

    it("returns paginated public agents with default pagination", async () => {
      const agentList = [mockPublicAgent()];
      setupMarketplaceMocks(agentList, 1);

      const res = await app.inject({
        method: "GET",
        url: "/api/marketplace",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty("agents");
      expect(body).toHaveProperty("pagination");
      expect(Array.isArray(body.agents)).toBe(true);
      expect(body.pagination.page).toBe(1);
      expect(body.pagination.limit).toBe(20);
    });

    it("supports search query filtering", async () => {
      const agentList = [mockPublicAgent()];
      setupMarketplaceMocks(agentList, 1);

      const res = await app.inject({
        method: "GET",
        url: "/api/marketplace?q=assistant&page=1&limit=10",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveProperty("agents");
      expect(body.pagination.limit).toBe(10);
    });

    it("returns empty results when no public agents match", async () => {
      setupMarketplaceMocks([], 0);

      const res = await app.inject({
        method: "GET",
        url: "/api/marketplace?q=nonexistent",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.agents).toHaveLength(0);
      expect(body.pagination.total).toBe(0);
      expect(body.pagination.totalPages).toBe(0);
    });

    it("caps limit at 50", async () => {
      setupMarketplaceMocks([], 0);

      const res = await app.inject({
        method: "GET",
        url: "/api/marketplace?limit=999",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      // limit is capped at 50 internally by the route
      expect(body.pagination.limit).toBe(50);
    });
  });

  describe("POST /api/marketplace/:id/add", () => {
    it("clones a public agent to the user's collection and returns 201", async () => {
      const publicAgent = mockPublicAgent();
      const cloned = mockClonedAgent();

      // First select: find public agent by id + isPublic=true
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where)
        .mockResolvedValueOnce([publicAgent])  // find public agent
        .mockResolvedValueOnce([])             // check for duplicate (no existing)
        .mockResolvedValue(undefined);          // increment usageCount where

      // insert().values().returning() → [clonedAgent]
      vi.mocked(db.insert).mockReturnValue(db as any);
      vi.mocked(db.values).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([cloned]);

      // update().set().where() → no returning
      vi.mocked(db.update).mockReturnValue(db as any);
      vi.mocked(db.set).mockReturnValue(db as any);

      const res = await app.inject({
        method: "POST",
        url: `/api/marketplace/${PUBLIC_AGENT_ID}/add`,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe(CLONED_AGENT_ID);
      expect(body.ownerId).toBe(USER_ID);
      expect(body.isPublic).toBe(false);
    });

    it("returns 404 when public agent does not exist", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      const res = await app.inject({
        method: "POST",
        url: `/api/marketplace/${PUBLIC_AGENT_ID}/add`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe("Agent not found in marketplace");
    });

    it("returns 409 when user already has an agent with the same endpoint", async () => {
      const publicAgent = mockPublicAgent();
      const existingClone = mockClonedAgent();

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where)
        .mockResolvedValueOnce([publicAgent])    // find public agent
        .mockResolvedValueOnce([existingClone]); // duplicate check → found

      const res = await app.inject({
        method: "POST",
        url: `/api/marketplace/${PUBLIC_AGENT_ID}/add`,
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe("You already have this agent");
      expect(body.agent).toBeDefined();
    });
  });

  describe("GET /api/marketplace/categories", () => {
    it("returns category counts for public agents", async () => {
      const categories = [
        { category: "productivity", count: 5 },
        { category: "entertainment", count: 3 },
      ];

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.groupBy).mockResolvedValue(categories);

      const res = await app.inject({
        method: "GET",
        url: "/api/marketplace/categories",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0].category).toBe("productivity");
    });
  });
});
