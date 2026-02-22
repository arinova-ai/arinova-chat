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
    innerJoin: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };
  return { db: mockDb };
});

vi.mock("../db/schema.js", () => ({
  conversations: {},
  conversationMembers: {},
  agents: {},
}));

import { groupRoutes } from "./groups.js";
import { db } from "../db/index.js";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const AGENT_ID_1 = "00000000-0000-0000-0000-000000000002";
const AGENT_ID_2 = "00000000-0000-0000-0000-000000000003";
const CONV_ID = "00000000-0000-0000-0000-000000000004";

function mockConversation(overrides = {}) {
  return {
    id: CONV_ID,
    title: "Test Group",
    type: "group",
    userId: USER_ID,
    agentId: null,
    pinnedAt: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("Group Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(groupRoutes);
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("POST /api/conversations/group", () => {
    it("creates a group conversation with members and returns 201", async () => {
      const agents = [
        { id: AGENT_ID_1, ownerId: USER_ID },
        { id: AGENT_ID_2, ownerId: USER_ID },
      ];
      const conv = mockConversation();
      const members = [
        { id: "m1", conversationId: CONV_ID, agentId: AGENT_ID_1 },
        { id: "m2", conversationId: CONV_ID, agentId: AGENT_ID_2 },
      ];

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValueOnce(agents);

      vi.mocked(db.insert).mockReturnValue(db as any);
      vi.mocked(db.values).mockReturnValue(db as any);
      vi.mocked(db.returning)
        .mockResolvedValueOnce([conv])
        .mockResolvedValueOnce(members);

      const res = await app.inject({
        method: "POST",
        url: "/api/conversations/group",
        payload: { title: "Test Group", agentIds: [AGENT_ID_1, AGENT_ID_2] },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe(CONV_ID);
      expect(body.members).toHaveLength(2);
    });

    it("returns 400 when agents not found or not owned", async () => {
      // Return fewer agents than requested (one not found)
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([{ id: AGENT_ID_1, ownerId: USER_ID }]);

      const res = await app.inject({
        method: "POST",
        url: "/api/conversations/group",
        payload: { title: "Test Group", agentIds: [AGENT_ID_1, AGENT_ID_2] },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toContain("not found");
    });
  });

  describe("GET /api/conversations/:id/members", () => {
    it("returns members with agent info", async () => {
      const memberData = [
        {
          id: "m1",
          conversationId: CONV_ID,
          agentId: AGENT_ID_1,
          addedAt: new Date(),
          agentName: "Bot1",
          agentDescription: "desc",
          agentAvatarUrl: null,
        },
      ];

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValueOnce([mockConversation()]);

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.innerJoin).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue(memberData);

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${CONV_ID}/members`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body).toHaveLength(1);
      expect(body[0].agentName).toBe("Bot1");
    });

    it("returns 404 when conversation not found", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: `/api/conversations/${CONV_ID}/members`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /api/conversations/:id/members", () => {
    it("adds an agent to a group and returns 201", async () => {
      const conv = mockConversation({ type: "group" });
      const agent = { id: AGENT_ID_2, ownerId: USER_ID };
      const member = { id: "m3", conversationId: CONV_ID, agentId: AGENT_ID_2 };

      let whereCallCount = 0;
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockImplementation((..._args: any[]) => {
        whereCallCount++;
        if (whereCallCount === 1) return Promise.resolve([conv]) as any; // conv check
        if (whereCallCount === 2) return Promise.resolve([agent]) as any; // agent check
        if (whereCallCount === 3) return Promise.resolve([]) as any; // duplicate check
        return db as any;
      });

      vi.mocked(db.insert).mockReturnValue(db as any);
      vi.mocked(db.values).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([member]);

      const res = await app.inject({
        method: "POST",
        url: `/api/conversations/${CONV_ID}/members`,
        payload: { agentId: AGENT_ID_2 },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.agentId).toBe(AGENT_ID_2);
    });

    it("returns 400 when adding member to a direct conversation", async () => {
      const conv = mockConversation({ type: "direct" });

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([conv]);

      const res = await app.inject({
        method: "POST",
        url: `/api/conversations/${CONV_ID}/members`,
        payload: { agentId: AGENT_ID_2 },
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toContain("direct conversation");
    });

    it("returns 409 when agent is already a member", async () => {
      const conv = mockConversation({ type: "group" });
      const agent = { id: AGENT_ID_2, ownerId: USER_ID };
      const existingMember = { id: "m-existing" };

      let whereCallCount = 0;
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockImplementation((..._args: any[]) => {
        whereCallCount++;
        if (whereCallCount === 1) return Promise.resolve([conv]) as any;
        if (whereCallCount === 2) return Promise.resolve([agent]) as any;
        if (whereCallCount === 3) return Promise.resolve([existingMember]) as any;
        return db as any;
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/conversations/${CONV_ID}/members`,
        payload: { agentId: AGENT_ID_2 },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.payload);
      expect(body.error).toContain("already a member");
    });
  });

  describe("DELETE /api/conversations/:id/members/:agentId", () => {
    it("removes a member and returns 204", async () => {
      const conv = mockConversation({ type: "group" });
      const removed = { id: "m1" };

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValueOnce([conv]);

      vi.mocked(db.delete).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([removed]);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${CONV_ID}/members/${AGENT_ID_1}`,
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 404 when member not found in group", async () => {
      const conv = mockConversation({ type: "group" });

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValueOnce([conv]);

      vi.mocked(db.delete).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([]);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${CONV_ID}/members/${AGENT_ID_1}`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toContain("Member not found");
    });

    it("returns 400 when removing member from direct conversation", async () => {
      const conv = mockConversation({ type: "direct" });

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([conv]);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/conversations/${CONV_ID}/members/${AGENT_ID_1}`,
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
