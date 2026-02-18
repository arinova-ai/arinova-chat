import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  createMockUser,
  createMockConversation,
  createMockMessage,
} from "../factories.js";

// ---- Mocks ----

vi.mock("../../middleware/auth.js", () => ({
  requireAuth: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("../../lib/r2.js", () => ({
  isR2Configured: false,
}));

vi.mock("../../env.js", () => ({
  env: {
    R2_PUBLIC_URL: "",
  },
}));

import { requireAuth } from "../../middleware/auth.js";
import { db } from "../../db/index.js";
import { messageRoutes } from "../../routes/messages.js";

// ---- Test Suite ----

describe("Message Routes", () => {
  let app: FastifyInstance;
  const mockUser = createMockUser();

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(messageRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(mockUser);
  });

  // ------- GET /api/messages/search -------

  describe("GET /api/messages/search", () => {
    it("returns matching messages", async () => {
      const convId = randomUUID();

      let selectCallCount = 0;
      vi.mocked(db.select).mockImplementation((...args: unknown[]) => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // Get user's conversation IDs
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: convId }]),
            }),
          } as never;
        }
        if (selectCallCount === 2) {
          // Count total matches
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 1 }]),
            }),
          } as never;
        }
        // Fetch results
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockResolvedValue([
                        {
                          messageId: randomUUID(),
                          conversationId: convId,
                          content: "Hello world",
                          role: "user",
                          createdAt: new Date(),
                          conversationTitle: null,
                          agentId: randomUUID(),
                          agentName: "TestBot",
                          agentAvatarUrl: null,
                        },
                      ]),
                    }),
                  }),
                }),
              }),
            }),
          }),
        } as never;
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/messages/search?q=Hello",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results).toHaveLength(1);
      expect(body.total).toBe(1);
    });

    it("returns empty results for no matches", async () => {
      const convId = randomUUID();

      let selectCallCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: convId }]),
            }),
          } as never;
        }
        if (selectCallCount === 2) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ count: 0 }]),
            }),
          } as never;
        }
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockReturnValue({
                    limit: vi.fn().mockReturnValue({
                      offset: vi.fn().mockResolvedValue([]),
                    }),
                  }),
                }),
              }),
            }),
          }),
        } as never;
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/messages/search?q=nonexistent",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().results).toHaveLength(0);
    });

    it("returns empty for empty query", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/messages/search?q=",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ results: [], total: 0 });
    });

    it("returns empty when user has no conversations", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "GET",
        url: "/api/messages/search?q=test",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ results: [], total: 0 });
    });
  });

  // ------- GET /api/conversations/:id/messages (pagination) -------

  describe("GET /api/conversations/:id/messages", () => {
    it("returns messages with default pagination", async () => {
      const conv = createMockConversation({ userId: mockUser.id });
      const msg = createMockMessage({ conversationId: conv.id });

      let selectCallCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // Verify conversation
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([conv]),
            }),
          } as never;
        }
        if (selectCallCount === 2) {
          // Fetch messages
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue([msg]),
                }),
              }),
            }),
          } as never;
        }
        // withAttachments: fetch attachments for messages
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        } as never;
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${conv.id}/messages`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.messages).toBeDefined();
      expect(body.hasMore).toBeDefined();
    });

    it("returns 404 for non-owned conversation", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${randomUUID()}/messages`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Conversation not found");
    });
  });

  // ------- DELETE /api/conversations/:conversationId/messages/:messageId -------

  describe("DELETE /api/conversations/:conversationId/messages/:messageId", () => {
    it("deletes a message in owned conversation", async () => {
      const conv = createMockConversation({ userId: mockUser.id });
      const msg = createMockMessage({ conversationId: conv.id });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([conv]),
        }),
      } as never);

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([msg]),
        }),
      } as never);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${conv.id}/messages/${msg.id}`,
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 404 for non-existent message", async () => {
      const conv = createMockConversation({ userId: mockUser.id });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([conv]),
        }),
      } as never);

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${conv.id}/messages/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Message not found");
    });

    it("returns 404 for non-owned conversation", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${randomUUID()}/messages/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Conversation not found");
    });
  });
});
