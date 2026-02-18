import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  createMockUser,
  createMockAgent,
  createMockConversation,
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

import { requireAuth } from "../../middleware/auth.js";
import { db } from "../../db/index.js";
import { groupRoutes } from "../../routes/groups.js";

// ---- Test Suite ----

describe("Group Conversation Routes", () => {
  let app: FastifyInstance;
  const mockUser = createMockUser();

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(groupRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(mockUser);
  });

  // ------- POST /api/conversations/group -------

  describe("POST /api/conversations/group", () => {
    it("creates group with valid agents", async () => {
      const agent1 = createMockAgent({ ownerId: mockUser.id });
      const agent2 = createMockAgent({ ownerId: mockUser.id });
      const conv = createMockConversation({
        userId: mockUser.id,
        type: "group",
        agentId: null,
        title: "My Group",
      });

      // Verify agents exist and belong to user
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([agent1, agent2]),
        }),
      } as never);

      // Insert conversation, then insert members
      let insertCallCount = 0;
      vi.mocked(db.insert).mockImplementation(() => {
        insertCallCount++;
        if (insertCallCount === 1) {
          // Insert conversation
          return {
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([conv]),
            }),
          } as never;
        }
        // Insert members
        return {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              { id: randomUUID(), conversationId: conv.id, agentId: agent1.id },
              { id: randomUUID(), conversationId: conv.id, agentId: agent2.id },
            ]),
          }),
        } as never;
      });

      const res = await app.inject({
        method: "POST",
        url: "/api/conversations/group",
        payload: {
          title: "My Group",
          agentIds: [agent1.id, agent2.id],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.type).toBe("group");
      expect(body.members).toHaveLength(2);
    });

    it("rejects group when agent not owned by user", async () => {
      const ownedAgent = createMockAgent({ ownerId: mockUser.id });

      // Only 1 agent found (owned), but 2 were requested
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([ownedAgent]),
        }),
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/api/conversations/group",
        payload: {
          title: "Bad Group",
          agentIds: [ownedAgent.id, randomUUID()],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("not found or not owned");
    });

    it("rejects group with missing title", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/conversations/group",
        payload: {
          agentIds: [randomUUID()],
        },
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("rejects group with empty agentIds", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/conversations/group",
        payload: {
          title: "Empty Group",
          agentIds: [],
        },
      });

      // createGroupConversationSchema requires min(1) agentIds
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  // ------- GET /api/conversations/:id/members -------

  describe("GET /api/conversations/:id/members", () => {
    it("lists group members with agent info", async () => {
      const conv = createMockConversation({
        userId: mockUser.id,
        type: "group",
      });

      // Verify conversation belongs to user
      let selectCallCount = 0;
      vi.mocked(db.select).mockImplementation((...args: unknown[]) => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([conv]),
            }),
          } as never;
        }
        // Get members with agent info
        return {
          from: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                {
                  id: randomUUID(),
                  conversationId: conv.id,
                  agentId: randomUUID(),
                  addedAt: new Date(),
                  agentName: "Agent 1",
                  agentDescription: "Desc",
                  agentAvatarUrl: null,
                },
              ]),
            }),
          }),
        } as never;
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${conv.id}/members`,
      });

      expect(res.statusCode).toBe(200);
      const members = res.json();
      expect(members).toHaveLength(1);
      expect(members[0].agentName).toBe("Agent 1");
    });

    it("returns 404 for non-existent conversation", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${randomUUID()}/members`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ------- POST /api/conversations/:id/members -------

  describe("POST /api/conversations/:id/members", () => {
    it("adds agent to group conversation", async () => {
      const conv = createMockConversation({
        userId: mockUser.id,
        type: "group",
      });
      const agent = createMockAgent({ ownerId: mockUser.id });

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
          // Verify agent
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([agent]),
            }),
          } as never;
        }
        // Check existing membership
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        } as never;
      });

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            { id: randomUUID(), conversationId: conv.id, agentId: agent.id },
          ]),
        }),
      } as never);

      const res = await app.inject({
        method: "POST",
        url: `/api/conversations/${conv.id}/members`,
        payload: { agentId: agent.id },
      });

      expect(res.statusCode).toBe(201);
    });

    it("returns 400 when adding to direct conversation", async () => {
      const conv = createMockConversation({
        userId: mockUser.id,
        type: "direct",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([conv]),
        }),
      } as never);

      const res = await app.inject({
        method: "POST",
        url: `/api/conversations/${conv.id}/members`,
        payload: { agentId: randomUUID() },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toContain("Cannot add members");
    });

    it("returns 409 when agent already in group", async () => {
      const conv = createMockConversation({
        userId: mockUser.id,
        type: "group",
      });
      const agent = createMockAgent({ ownerId: mockUser.id });

      let selectCallCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([conv]),
            }),
          } as never;
        }
        if (selectCallCount === 2) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([agent]),
            }),
          } as never;
        }
        // Existing membership found
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ id: "existing" }]),
          }),
        } as never;
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/conversations/${conv.id}/members`,
        payload: { agentId: agent.id },
      });

      expect(res.statusCode).toBe(409);
    });
  });

  // ------- DELETE /api/conversations/:id/members/:agentId -------

  describe("DELETE /api/conversations/:id/members/:agentId", () => {
    it("removes agent from group", async () => {
      const conv = createMockConversation({
        userId: mockUser.id,
        type: "group",
      });
      const agentId = randomUUID();

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([conv]),
        }),
      } as never);

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: randomUUID() }]),
        }),
      } as never);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${conv.id}/members/${agentId}`,
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 400 when removing from direct conversation", async () => {
      const conv = createMockConversation({
        userId: mockUser.id,
        type: "direct",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([conv]),
        }),
      } as never);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${conv.id}/members/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(400);
    });

    it("returns 404 when member not found", async () => {
      const conv = createMockConversation({
        userId: mockUser.id,
        type: "group",
      });

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
        url: `/api/conversations/${conv.id}/members/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toContain("Member not found");
    });
  });
});
