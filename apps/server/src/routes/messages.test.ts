import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.mock("../middleware/auth.js", () => ({
  requireAuth: vi.fn().mockResolvedValue({
    id: "00000000-0000-0000-0000-000000000001",
    email: "test@example.com",
    name: "Test User",
  }),
}));

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
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };
  return { db: mockDb };
});

vi.mock("../db/schema.js", () => ({
  messages: {},
  conversations: {},
  attachments: {},
  agents: {},
}));

vi.mock("../lib/r2.js", () => ({
  isR2Configured: false,
}));

vi.mock("../env.js", () => ({
  env: { R2_PUBLIC_URL: "", UPLOAD_DIR: "/tmp/test-uploads" },
}));

vi.mock("../db/redis.js", () => ({
  redis: { get: vi.fn().mockResolvedValue(null) },
}));

vi.mock("../ws/handler.js", () => ({
  hasActiveStream: vi.fn().mockReturnValue(false),
}));

import { messageRoutes } from "./messages.js";
import { db } from "../db/index.js";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const CONV_ID = "00000000-0000-0000-0000-000000000003";
const MSG_ID = "00000000-0000-0000-0000-000000000010";

function mockMessage(overrides = {}) {
  return {
    id: MSG_ID,
    conversationId: CONV_ID,
    seq: 1,
    role: "user",
    content: "Hello world",
    status: "completed",
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("Message Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(messageRoutes);
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /api/messages/search", () => {
    it("returns empty results when query is empty", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/messages/search?q=",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.results).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("returns empty results when user has no conversations", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: "/api/messages/search?q=hello",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.results).toEqual([]);
      expect(body.total).toBe(0);
    });

    it("returns matching messages with total count", async () => {
      const searchResult = {
        messageId: MSG_ID,
        conversationId: CONV_ID,
        content: "Hello world",
        role: "user",
        createdAt: new Date("2024-01-01"),
        conversationTitle: "Test Conv",
        agentId: "agent-1",
        agentName: "TestBot",
        agentAvatarUrl: null,
      };

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.innerJoin).mockReturnValue(db as any);
      vi.mocked(db.leftJoin).mockReturnValue(db as any);

      let whereCallCount = 0;
      vi.mocked(db.where).mockImplementation((..._args: any[]) => {
        whereCallCount++;
        if (whereCallCount === 1) {
          // Get user conversations
          return Promise.resolve([{ id: CONV_ID }]) as any;
        }
        if (whereCallCount === 2) {
          // Count query
          return Promise.resolve([{ count: 1 }]) as any;
        }
        // Search results query
        return db as any;
      });

      vi.mocked(db.orderBy).mockReturnValue(db as any);
      vi.mocked(db.limit).mockReturnValue(db as any);
      vi.mocked(db.offset).mockResolvedValue([searchResult]);

      const res = await app.inject({
        method: "GET",
        url: "/api/messages/search?q=hello",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.total).toBe(1);
      expect(body.results).toHaveLength(1);
      expect(body.results[0].content).toBe("Hello world");
    });
  });

  describe("GET /api/conversations/:id/messages", () => {
    it("returns 404 when conversation not found", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${CONV_ID}/messages`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe("Conversation not found");
    });

    it("returns messages with hasMore=false for small result set", async () => {
      const msg = mockMessage();

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);

      let whereCallCount = 0;
      vi.mocked(db.where).mockImplementation((..._args: any[]) => {
        whereCallCount++;
        if (whereCallCount === 1) {
          // conv ownership check — terminal
          return Promise.resolve([{ id: CONV_ID, userId: USER_ID }]) as any;
        }
        if (whereCallCount === 3) {
          // withAttachments: select from attachments — terminal
          return Promise.resolve([]) as any;
        }
        // messages query conditions — chain continues
        return db as any;
      });

      vi.mocked(db.orderBy).mockReturnValue(db as any);
      vi.mocked(db.limit).mockResolvedValue([msg]);

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${CONV_ID}/messages`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.hasMore).toBe(false);
      expect(body.messages).toHaveLength(1);
    });
  });

  describe("DELETE /api/conversations/:conversationId/messages/:messageId", () => {
    it("returns 204 after deleting a message", async () => {
      const msg = mockMessage();

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValueOnce([{ id: CONV_ID, userId: USER_ID }]);

      vi.mocked(db.delete).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([msg]);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${CONV_ID}/messages/${MSG_ID}`,
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 404 when conversation not found", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${CONV_ID}/messages/${MSG_ID}`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe("Conversation not found");
    });

    it("returns 404 when message not found", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValueOnce([{ id: CONV_ID, userId: USER_ID }]);

      vi.mocked(db.delete).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([]);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${CONV_ID}/messages/${MSG_ID}`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe("Message not found");
    });
  });
});
