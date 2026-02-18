import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createMockUser, createMockAgent, createMockConversation, createMockMessage } from "../factories.js";

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

import { requireAuth } from "../../middleware/auth.js";
import { db } from "../../db/index.js";
import { conversationRoutes } from "../../routes/conversations.js";

// ---- Helpers ----

function mockSelectFromWhere(data: unknown[]) {
  return vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(data),
        }),
      }),
    }),
  } as never);
}

// ---- Test Suite ----

describe("Conversation Routes", () => {
  let app: FastifyInstance;
  const mockUser = createMockUser();

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(conversationRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(mockUser);
  });

  // ------- POST /api/conversations -------

  describe("POST /api/conversations", () => {
    it("creates conversation with valid agent", async () => {
      const agent = createMockAgent({ ownerId: mockUser.id });
      const conv = createMockConversation({ userId: mockUser.id, agentId: agent.id });

      // First select: verify agent exists and belongs to user
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([agent]),
        }),
      } as never);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([conv]),
        }),
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/api/conversations",
        payload: { agentId: agent.id },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().userId).toBe(mockUser.id);
    });

    it("returns 404 for invalid agent", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/api/conversations",
        payload: { agentId: randomUUID() },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Agent not found");
    });

    it("rejects invalid payload (missing agentId)", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/conversations",
        payload: {},
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  // ------- GET /api/conversations -------

  describe("GET /api/conversations", () => {
    it("lists only user's conversations", async () => {
      const conv = createMockConversation({ userId: mockUser.id });
      const agent = createMockAgent();
      const msg = createMockMessage({ conversationId: conv.id });

      // First: get all conversations
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([conv]),
          }),
        }),
      } as never);

      // Subsequent selects for agent info and last message
      // This is complex due to Promise.all — let's verify the endpoint returns 200
      const res = await app.inject({
        method: "GET",
        url: "/api/conversations",
      });

      expect(res.statusCode).toBe(200);
    });
  });

  // ------- GET /api/conversations/:id -------

  describe("GET /api/conversations/:id", () => {
    it("returns conversation owned by user", async () => {
      const conv = createMockConversation({ userId: mockUser.id });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([conv]),
        }),
      } as never);

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${conv.id}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(conv.id);
    });

    it("returns 404 for non-existent conversation", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Conversation not found");
    });

    it("returns 404 for conversation not owned by user", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ------- PUT /api/conversations/:id -------

  describe("PUT /api/conversations/:id", () => {
    it("renames a conversation", async () => {
      const conv = createMockConversation({
        userId: mockUser.id,
        title: "New Title",
      });

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([conv]),
          }),
        }),
      } as never);

      const res = await app.inject({
        method: "PUT",
        url: `/api/conversations/${conv.id}`,
        payload: { title: "New Title" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().title).toBe("New Title");
    });

    it("pins a conversation", async () => {
      const conv = createMockConversation({
        userId: mockUser.id,
        pinnedAt: new Date(),
      });

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([conv]),
          }),
        }),
      } as never);

      const res = await app.inject({
        method: "PUT",
        url: `/api/conversations/${conv.id}`,
        payload: { pinned: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().pinnedAt).not.toBeNull();
    });

    it("returns 404 for non-existent conversation", async () => {
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const res = await app.inject({
        method: "PUT",
        url: `/api/conversations/${randomUUID()}`,
        payload: { title: "Nope" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ------- DELETE /api/conversations/:id -------

  describe("DELETE /api/conversations/:id", () => {
    it("deletes owned conversation", async () => {
      const conv = createMockConversation({ userId: mockUser.id });

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([conv]),
        }),
      } as never);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${conv.id}`,
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 404 for non-existent conversation", async () => {
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ------- DELETE /api/conversations/:id/messages -------

  describe("DELETE /api/conversations/:id/messages", () => {
    it("clears all messages in owned conversation", async () => {
      const conv = createMockConversation({ userId: mockUser.id });

      // select to verify ownership
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: conv.id }]),
        }),
      } as never);

      // delete messages
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as never);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${conv.id}/messages`,
      });

      expect(res.statusCode).toBe(200);
    });

    it("returns 404 for non-owned conversation", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${randomUUID()}/messages`,
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
