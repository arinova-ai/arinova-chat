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
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    as: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
  };
  return { db: mockDb };
});

import { conversationRoutes } from "./conversations.js";
import { db } from "../db/index.js";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const AGENT_ID = "00000000-0000-0000-0000-000000000002";
const CONV_ID = "00000000-0000-0000-0000-000000000003";

function mockAgent(overrides = {}) {
  return {
    id: AGENT_ID,
    name: "TestBot",
    description: "A test bot",
    a2aEndpoint: null,
    avatarUrl: null,
    secretToken: "tok",
    ownerId: USER_ID,
    isPublic: false,
    category: null,
    usageCount: 0,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

function mockConversation(overrides = {}) {
  return {
    id: CONV_ID,
    title: "My Conversation",
    type: "direct",
    userId: USER_ID,
    agentId: AGENT_ID,
    pinnedAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("Conversation Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(conversationRoutes);
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("POST /api/conversations", () => {
    it("creates a direct conversation and returns 201", async () => {
      const conv = mockConversation();

      // First select: verify agent exists and belongs to user
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValueOnce([mockAgent()]);

      // insert().values().returning() → [conv]
      vi.mocked(db.insert).mockReturnValue(db as any);
      vi.mocked(db.values).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([conv]);

      const res = await app.inject({
        method: "POST",
        url: "/api/conversations",
        payload: { agentId: AGENT_ID },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe(CONV_ID);
      expect(body.type).toBe("direct");
      expect(body.userId).toBe(USER_ID);
      expect(body.agentId).toBe(AGENT_ID);
    });

    it("returns 404 when the specified agent does not exist", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      const res = await app.inject({
        method: "POST",
        url: "/api/conversations",
        payload: { agentId: AGENT_ID },
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe("Agent not found");
    });

    it("returns 400 when agentId is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/conversations",
        payload: {},
      });

      // Zod parse error
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /api/conversations", () => {
    it("returns 200 with array of enriched conversations", async () => {
      // JOIN-based query: select → from → leftJoin (×3) → where → orderBy
      // Returns rows with flattened conversation + agent + last message fields
      const joinedRow = {
        id: CONV_ID,
        title: null,
        type: "direct",
        userId: USER_ID,
        agentId: AGENT_ID,
        pinnedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        agentName: "TestBot",
        agentDescription: "A test bot",
        agentAvatarUrl: null,
        lastMsgId: null,
        lastMsgSeq: null,
        lastMsgRole: null,
        lastMsgContent: null,
        lastMsgStatus: null,
        lastMsgCreatedAt: null,
        lastMsgUpdatedAt: null,
      };

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.leftJoin).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.groupBy).mockReturnValue(db as any);
      vi.mocked(db.as).mockReturnValue(db as any);
      vi.mocked(db.orderBy).mockResolvedValue([joinedRow]);

      const res = await app.inject({
        method: "GET",
        url: "/api/conversations",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(CONV_ID);
      expect(body[0].agentName).toBe("TestBot");
      expect(body[0].lastMessage).toBeNull();
    });

    it("returns 200 with empty array when user has no conversations", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.leftJoin).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.groupBy).mockReturnValue(db as any);
      vi.mocked(db.as).mockReturnValue(db as any);
      vi.mocked(db.orderBy).mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: "/api/conversations",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(0);
    });
  });

  describe("GET /api/conversations/:id", () => {
    it("returns 200 with the conversation when found", async () => {
      const conv = mockConversation();

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([conv]);

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${CONV_ID}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe(CONV_ID);
    });

    it("returns 404 when conversation not found", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${CONV_ID}`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe("Conversation not found");
    });
  });

  describe("PUT /api/conversations/:id", () => {
    it("renames a conversation and returns 200", async () => {
      const updated = mockConversation({ title: "Renamed" });

      vi.mocked(db.update).mockReturnValue(db as any);
      vi.mocked(db.set).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([updated]);

      const res = await app.inject({
        method: "PUT",
        url: `/api/conversations/${CONV_ID}`,
        payload: { title: "Renamed" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.title).toBe("Renamed");
    });

    it("pins a conversation and returns 200", async () => {
      const now = new Date();
      const updated = mockConversation({ pinnedAt: now });

      vi.mocked(db.update).mockReturnValue(db as any);
      vi.mocked(db.set).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([updated]);

      const res = await app.inject({
        method: "PUT",
        url: `/api/conversations/${CONV_ID}`,
        payload: { pinned: true },
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns 404 when conversation not found for update", async () => {
      vi.mocked(db.update).mockReturnValue(db as any);
      vi.mocked(db.set).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([]);

      const res = await app.inject({
        method: "PUT",
        url: `/api/conversations/${CONV_ID}`,
        payload: { title: "Ghost" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/conversations/:id", () => {
    it("deletes a conversation and returns 204", async () => {
      const conv = mockConversation();

      vi.mocked(db.delete).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([conv]);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${CONV_ID}`,
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 404 when conversation not found for delete", async () => {
      vi.mocked(db.delete).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([]);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${CONV_ID}`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe("Conversation not found");
    });
  });
});
