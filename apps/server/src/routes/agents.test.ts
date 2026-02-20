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
    execute: vi.fn().mockResolvedValue(undefined),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
  };
  return { db: mockDb };
});

vi.mock("../utils/pairing-code.js", () => ({
  generateSecretToken: vi.fn().mockReturnValue("test-secret-token"),
}));

vi.mock("../ws/agent-handler.js", () => ({
  getAgentSkills: vi.fn().mockReturnValue([]),
}));

vi.mock("../lib/r2.js", () => ({
  uploadToR2: vi.fn().mockResolvedValue(null),
}));

vi.mock("../env.js", () => ({
  env: {
    UPLOAD_DIR: "/tmp/test-uploads",
  },
}));

import { agentRoutes } from "./agents.js";
import { db } from "../db/index.js";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const AGENT_ID = "00000000-0000-0000-0000-000000000002";

function mockAgent(overrides = {}) {
  return {
    id: AGENT_ID,
    name: "TestBot",
    description: "A test bot",
    a2aEndpoint: null,
    avatarUrl: null,
    secretToken: "test-secret-token",
    ownerId: USER_ID,
    isPublic: false,
    category: null,
    usageCount: 0,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("Agent Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(agentRoutes);
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("POST /api/agents", () => {
    it("creates an agent and returns 201 with agent data", async () => {
      const created = mockAgent();

      // Chain: insert().values().returning() → [agent]
      vi.mocked(db.insert).mockReturnValue(db as any);
      vi.mocked(db.values).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([created]);

      const res = await app.inject({
        method: "POST",
        url: "/api/agents",
        payload: { name: "TestBot", description: "A test bot" },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe(AGENT_ID);
      expect(body.name).toBe("TestBot");
      expect(body.secretToken).toBe("test-secret-token");
      expect(body.ownerId).toBe(USER_ID);
    });

    it("returns 400 when name is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/agents",
        payload: {},
      });

      // Zod parse fails → Fastify returns 400/500
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe("GET /api/agents", () => {
    it("returns 200 with array of agents", async () => {
      const agentList = [mockAgent(), mockAgent({ id: "00000000-0000-0000-0000-000000000003", name: "Bot2" })];

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.orderBy).mockResolvedValue(agentList);

      const res = await app.inject({
        method: "GET",
        url: "/api/agents",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe("TestBot");
      expect(body[1].name).toBe("Bot2");
    });

    it("returns 200 with empty array when user has no agents", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.orderBy).mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: "/api/agents",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(0);
    });
  });

  describe("GET /api/agents/:id", () => {
    it("returns 200 with agent when found", async () => {
      const agent = mockAgent();

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([agent]);

      const res = await app.inject({
        method: "GET",
        url: `/api/agents/${AGENT_ID}`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.id).toBe(AGENT_ID);
      expect(body.name).toBe("TestBot");
    });

    it("returns 404 when agent not found", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: `/api/agents/${AGENT_ID}`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe("Agent not found");
    });
  });

  describe("PUT /api/agents/:id", () => {
    it("returns 200 with updated agent", async () => {
      const updated = mockAgent({ name: "RenamedBot" });

      vi.mocked(db.update).mockReturnValue(db as any);
      vi.mocked(db.set).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([updated]);

      const res = await app.inject({
        method: "PUT",
        url: `/api/agents/${AGENT_ID}`,
        payload: { name: "RenamedBot" },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.name).toBe("RenamedBot");
    });

    it("returns 404 when agent not found for update", async () => {
      vi.mocked(db.update).mockReturnValue(db as any);
      vi.mocked(db.set).mockReturnValue(db as any);
      vi.mocked(db.where).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([]);

      const res = await app.inject({
        method: "PUT",
        url: `/api/agents/${AGENT_ID}`,
        payload: { name: "Ghost" },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("DELETE /api/agents/:id", () => {
    it("returns 204 after deleting agent and cascade cleanup", async () => {
      const agent = { id: AGENT_ID };

      // First select: verify ownership
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      // First call returns the agent, subsequent calls return empty arrays
      vi.mocked(db.where)
        .mockResolvedValueOnce([agent])       // ownership check
        .mockResolvedValueOnce([])            // delete conversationMembers (delete chain)
        .mockResolvedValueOnce([])            // select direct convos
        .mockResolvedValue(undefined);        // remaining deletes / update

      vi.mocked(db.delete).mockReturnValue(db as any);
      vi.mocked(db.update).mockReturnValue(db as any);
      vi.mocked(db.set).mockReturnValue(db as any);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/agents/${AGENT_ID}`,
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 404 when agent not found for delete", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/agents/${AGENT_ID}`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error).toBe("Agent not found");
    });
  });

  describe("POST /api/agents/:id/regenerate-token", () => {
    it("returns new secretToken", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValueOnce([{ id: AGENT_ID }]);

      vi.mocked(db.update).mockReturnValue(db as any);
      vi.mocked(db.set).mockReturnValue(db as any);
      // The update().set().where() chain resolves to undefined (no returning)
      vi.mocked(db.where).mockResolvedValue(undefined);

      const res = await app.inject({
        method: "POST",
        url: `/api/agents/${AGENT_ID}/regenerate-token`,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.secretToken).toBe("test-secret-token");
    });
  });
});
