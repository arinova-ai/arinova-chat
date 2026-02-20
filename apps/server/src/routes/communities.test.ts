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
  communities: {},
  channels: {},
  communityMembers: {},
  channelMessages: {},
  agents: {},
  user: {},
}));

import { communityRoutes } from "./communities.js";
import { db } from "../db/index.js";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const OTHER_USER_ID = "00000000-0000-0000-0000-000000000099";
const COMMUNITY_ID = "00000000-0000-0000-0000-000000000010";
const CHANNEL_ID = "00000000-0000-0000-0000-000000000020";

function mockCommunity(overrides = {}) {
  return {
    id: COMMUNITY_ID,
    name: "Test Community",
    description: "A test community",
    avatarUrl: null,
    ownerId: USER_ID,
    isPublic: true,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("Community Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(communityRoutes);
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("POST /api/communities", () => {
    it("creates a community and returns 201", async () => {
      const community = mockCommunity();

      vi.mocked(db.insert).mockReturnValue(db as any);
      vi.mocked(db.values).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([community]);

      const res = await app.inject({
        method: "POST",
        url: "/api/communities",
        payload: { name: "Test Community", description: "A test community" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe(COMMUNITY_ID);
      expect(body.name).toBe("Test Community");
      expect(body.ownerId).toBe(USER_ID);
    });

    it("returns error when name is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/communities",
        payload: {},
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /api/communities", () => {
    it("returns user's communities", async () => {
      const community = { ...mockCommunity(), role: "owner" };

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.innerJoin).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.orderBy).mockResolvedValue([community]);

      const res = await app.inject({
        method: "GET",
        url: "/api/communities",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe("Test Community");
    });
  });

  describe("GET /api/communities/:id", () => {
    it("returns community details with channels and member count", async () => {
      const community = mockCommunity();
      const membership = { id: "mem-1", role: "owner" };
      const channelList = [
        { id: CHANNEL_ID, name: "general", communityId: COMMUNITY_ID },
      ];

      let selectCallCount = 0;
      vi.mocked(db.select).mockImplementation((..._args: any[]) => {
        selectCallCount++;
        return db as any;
      });
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.innerJoin).mockReturnValue(db as any);

      let whereCallCount = 0;
      vi.mocked(db.where).mockImplementation((..._args: any[]) => {
        whereCallCount++;
        if (whereCallCount === 1) return Promise.resolve([community]) as any; // community lookup
        if (whereCallCount === 2) return Promise.resolve([membership]) as any; // membership check
        if (whereCallCount === 3) return db as any; // channels query
        if (whereCallCount === 4) return Promise.resolve([{ count: 5 }]) as any; // member count
        return db as any;
      });

      vi.mocked(db.orderBy).mockResolvedValue(channelList);

      const res = await app.inject({
        method: "GET",
        url: `/api/communities/${COMMUNITY_ID}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.name).toBe("Test Community");
      expect(body.channels).toHaveLength(1);
      expect(body.memberCount).toBe(5);
    });

    it("returns 404 when community not found", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: `/api/communities/${COMMUNITY_ID}`,
      });

      expect(res.statusCode).toBe(404);
    });

    it("returns 403 for non-member accessing private community", async () => {
      const community = mockCommunity({ isPublic: false });

      let whereCallCount = 0;
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockImplementation((..._args: any[]) => {
        whereCallCount++;
        if (whereCallCount === 1) return Promise.resolve([community]) as any;
        if (whereCallCount === 2) return Promise.resolve([]) as any; // no membership
        return db as any;
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/communities/${COMMUNITY_ID}`,
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("DELETE /api/communities/:id", () => {
    it("deletes community and returns 204", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValueOnce([mockCommunity()]);
      vi.mocked(db.delete).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue(undefined);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/communities/${COMMUNITY_ID}`,
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 404 when community not found or not owned", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/communities/${COMMUNITY_ID}`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /api/communities/:id/join", () => {
    it("joins a public community and returns 201", async () => {
      const community = mockCommunity({ isPublic: true });
      const member = { id: "mem-new", communityId: COMMUNITY_ID, userId: USER_ID, role: "member" };

      let whereCallCount = 0;
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockImplementation((..._args: any[]) => {
        whereCallCount++;
        if (whereCallCount === 1) return Promise.resolve([community]) as any;
        if (whereCallCount === 2) return Promise.resolve([]) as any; // not already member
        return db as any;
      });

      vi.mocked(db.insert).mockReturnValue(db as any);
      vi.mocked(db.values).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([member]);

      const res = await app.inject({
        method: "POST",
        url: `/api/communities/${COMMUNITY_ID}/join`,
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.role).toBe("member");
    });

    it("returns 403 when trying to join a private community", async () => {
      const community = mockCommunity({ isPublic: false });

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([community]);

      const res = await app.inject({
        method: "POST",
        url: `/api/communities/${COMMUNITY_ID}/join`,
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 409 when already a member", async () => {
      const community = mockCommunity({ isPublic: true });
      const existingMember = { id: "mem-existing" };

      let whereCallCount = 0;
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockImplementation((..._args: any[]) => {
        whereCallCount++;
        if (whereCallCount === 1) return Promise.resolve([community]) as any;
        if (whereCallCount === 2) return Promise.resolve([existingMember]) as any;
        return db as any;
      });

      const res = await app.inject({
        method: "POST",
        url: `/api/communities/${COMMUNITY_ID}/join`,
      });

      expect(res.statusCode).toBe(409);
    });
  });

  describe("POST /api/communities/:id/leave", () => {
    it("allows non-owner to leave", async () => {
      const community = mockCommunity({ ownerId: OTHER_USER_ID });

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValueOnce([community]);
      vi.mocked(db.delete).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue(undefined);

      const res = await app.inject({
        method: "POST",
        url: `/api/communities/${COMMUNITY_ID}/leave`,
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 400 when owner tries to leave", async () => {
      const community = mockCommunity({ ownerId: USER_ID });

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([community]);

      const res = await app.inject({
        method: "POST",
        url: `/api/communities/${COMMUNITY_ID}/leave`,
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error).toContain("Owner cannot leave");
    });
  });

  describe("POST /api/communities/:id/transfer-ownership", () => {
    it("transfers ownership successfully", async () => {
      const community = mockCommunity({ ownerId: USER_ID });
      const targetMembership = { id: "mem-target", userId: OTHER_USER_ID };

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where)
        .mockResolvedValueOnce([community]) // verify owner
        .mockResolvedValueOnce([targetMembership]); // verify target is member

      vi.mocked(db.update).mockReturnValue(db as any);
      vi.mocked(db.set).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue(undefined);

      const res = await app.inject({
        method: "POST",
        url: `/api/communities/${COMMUNITY_ID}/transfer-ownership`,
        payload: { userId: OTHER_USER_ID },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.message).toBe("Ownership transferred");
    });

    it("returns 403 when non-owner tries to transfer", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]); // no community where ownerId matches

      const res = await app.inject({
        method: "POST",
        url: `/api/communities/${COMMUNITY_ID}/transfer-ownership`,
        payload: { userId: OTHER_USER_ID },
      });

      expect(res.statusCode).toBe(403);
    });

    it("returns 400 when userId is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/api/communities/${COMMUNITY_ID}/transfer-ownership`,
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/communities/:id/channels", () => {
    it("creates a channel and returns 201", async () => {
      const membership = { id: "mem-1", role: "owner" };
      const channel = {
        id: CHANNEL_ID,
        communityId: COMMUNITY_ID,
        name: "new-channel",
        description: null,
        position: 1,
      };

      let whereCallCount = 0;
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockImplementation((..._args: any[]) => {
        whereCallCount++;
        if (whereCallCount === 1) return Promise.resolve([membership]) as any;
        if (whereCallCount === 2) return Promise.resolve([{ max: 0 }]) as any;
        return db as any;
      });

      vi.mocked(db.insert).mockReturnValue(db as any);
      vi.mocked(db.values).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([channel]);

      const res = await app.inject({
        method: "POST",
        url: `/api/communities/${COMMUNITY_ID}/channels`,
        payload: { name: "new-channel" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.name).toBe("new-channel");
    });

    it("returns 403 for non-admin/non-owner", async () => {
      const membership = { id: "mem-1", role: "member" };

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([membership]);

      const res = await app.inject({
        method: "POST",
        url: `/api/communities/${COMMUNITY_ID}/channels`,
        payload: { name: "new-channel" },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("DELETE /api/communities/:id/channels/:channelId", () => {
    it("deletes channel and returns 204 for owner", async () => {
      const membership = { id: "mem-1", role: "owner" };

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValueOnce([membership]);
      vi.mocked(db.delete).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue(undefined);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/communities/${COMMUNITY_ID}/channels/${CHANNEL_ID}`,
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 403 for non-owner", async () => {
      const membership = { id: "mem-1", role: "admin" };

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([membership]);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/communities/${COMMUNITY_ID}/channels/${CHANNEL_ID}`,
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
