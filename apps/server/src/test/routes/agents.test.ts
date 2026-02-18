import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createMockUser, createMockAgent } from "../factories.js";

// ---- Mocks (must be before imports of routes) ----

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

vi.mock("../../utils/pairing-code.js", () => ({
  generateSecretToken: vi.fn(() => "ari_" + "a".repeat(48)),
}));

vi.mock("../../env.js", () => ({
  env: {
    UPLOAD_DIR: "/tmp/test-uploads",
    R2_ENDPOINT: "",
    R2_ACCESS_KEY_ID: "",
    R2_SECRET_ACCESS_KEY: "",
    R2_BUCKET: "test",
    R2_PUBLIC_URL: "",
  },
}));

vi.mock("../../lib/r2.js", () => ({
  uploadToR2: vi.fn(() => null),
}));

import { requireAuth } from "../../middleware/auth.js";
import { db } from "../../db/index.js";
import { agentRoutes } from "../../routes/agents.js";

// ---- Helpers ----

function chainReturning(data: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(data),
      }),
    }),
  };
}

function mockSelectChain(data: unknown[]) {
  return vi.mocked(db.select).mockReturnValue(chainReturning(data) as never);
}

function mockInsertReturning(data: unknown[]) {
  return vi.mocked(db.insert).mockReturnValue({
    values: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(data),
    }),
  } as never);
}

function mockUpdateReturning(data: unknown[]) {
  return vi.mocked(db.update).mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(data),
      }),
    }),
  } as never);
}

function mockDeleteReturning(data: unknown[]) {
  return vi.mocked(db.delete).mockReturnValue({
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(data),
    }),
  } as never);
}

// ---- Test suite ----

describe("Agent Routes", () => {
  let app: FastifyInstance;
  const mockUser = createMockUser();

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await app.register(agentRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(requireAuth).mockResolvedValue(mockUser);
  });

  // ------- POST /api/agents/pair -------

  describe("POST /api/agents/pair", () => {
    it("exchanges valid bot token for agent info", async () => {
      const agent = createMockAgent({ name: "MyBot" });
      // select().from().where() chain
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: agent.id, name: agent.name }]),
        }),
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/api/agents/pair",
        payload: { botToken: agent.secretToken },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.agentId).toBe(agent.id);
      expect(body.name).toBe("MyBot");
      expect(body.wsUrl).toContain("/ws/agent");
    });

    it("returns 404 for invalid bot token", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/api/agents/pair",
        payload: { botToken: "invalid-token" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Invalid bot token");
    });

    it("updates a2aEndpoint when provided", async () => {
      const agent = createMockAgent();
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: agent.id, name: agent.name }]),
        }),
      } as never);
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/api/agents/pair",
        payload: {
          botToken: agent.secretToken,
          a2aEndpoint: "https://my-agent.example.com/.well-known/agent",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(vi.mocked(db.update)).toHaveBeenCalled();
    });
  });

  // ------- POST /api/agents -------

  describe("POST /api/agents", () => {
    it("creates agent with valid data", async () => {
      const created = createMockAgent({ ownerId: mockUser.id, name: "NewAgent" });
      mockInsertReturning([created]);

      const res = await app.inject({
        method: "POST",
        url: "/api/agents",
        payload: { name: "NewAgent" },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe("NewAgent");
    });

    it("creates agent with optional fields", async () => {
      const created = createMockAgent({
        ownerId: mockUser.id,
        name: "Full Agent",
        description: "A test agent",
      });
      mockInsertReturning([created]);

      const res = await app.inject({
        method: "POST",
        url: "/api/agents",
        payload: {
          name: "Full Agent",
          description: "A test agent",
          a2aEndpoint: "https://example.com/agent",
        },
      });

      expect(res.statusCode).toBe(201);
    });

    it("rejects missing name field", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/agents",
        payload: {},
      });

      // Zod validation throws -> 500 or caught by error handler
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("rejects unauthenticated request", async () => {
      vi.mocked(requireAuth).mockRejectedValue(new Error("Unauthorized"));

      const res = await app.inject({
        method: "POST",
        url: "/api/agents",
        payload: { name: "Unauthed" },
      });

      expect(res.statusCode).toBe(500); // unhandled rejection
    });
  });

  // ------- GET /api/agents -------

  describe("GET /api/agents", () => {
    it("lists user's own agents", async () => {
      const agents = [
        createMockAgent({ ownerId: mockUser.id, name: "A1" }),
        createMockAgent({ ownerId: mockUser.id, name: "A2" }),
      ];
      mockSelectChain(agents);

      const res = await app.inject({
        method: "GET",
        url: "/api/agents",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe("A1");
    });

    it("returns empty list when user has no agents", async () => {
      mockSelectChain([]);

      const res = await app.inject({
        method: "GET",
        url: "/api/agents",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });
  });

  // ------- GET /api/agents/:id -------

  describe("GET /api/agents/:id", () => {
    it("returns agent when found and owned by user", async () => {
      const agent = createMockAgent({ ownerId: mockUser.id });
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([agent]),
        }),
      } as never);

      const res = await app.inject({
        method: "GET",
        url: `/api/agents/${agent.id}`,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(agent.id);
    });

    it("returns 404 when agent not found", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "GET",
        url: `/api/agents/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Agent not found");
    });

    it("returns 404 when agent exists but not owned by user", async () => {
      // The WHERE clause filters by ownerId, so an agent owned by someone
      // else won't be returned
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "GET",
        url: `/api/agents/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ------- PUT /api/agents/:id -------

  describe("PUT /api/agents/:id", () => {
    it("updates agent with valid data", async () => {
      const agent = createMockAgent({ ownerId: mockUser.id, name: "Updated" });
      mockUpdateReturning([{ ...agent, name: "Updated" }]);

      const res = await app.inject({
        method: "PUT",
        url: `/api/agents/${agent.id}`,
        payload: { name: "Updated" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("Updated");
    });

    it("returns 404 when updating non-existent agent", async () => {
      mockUpdateReturning([]);

      const res = await app.inject({
        method: "PUT",
        url: `/api/agents/${randomUUID()}`,
        payload: { name: "Won't Work" },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Agent not found");
    });

    it("returns 404 when updating agent not owned by user", async () => {
      mockUpdateReturning([]);

      const res = await app.inject({
        method: "PUT",
        url: `/api/agents/${randomUUID()}`,
        payload: { name: "NotMine" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("rejects invalid update payload", async () => {
      const res = await app.inject({
        method: "PUT",
        url: `/api/agents/${randomUUID()}`,
        payload: { name: "" }, // min 1 char required
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  // ------- DELETE /api/agents/:id -------

  describe("DELETE /api/agents/:id", () => {
    it("deletes owned agent", async () => {
      const agent = createMockAgent({ ownerId: mockUser.id });
      // First select for ownership check
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: agent.id }]),
        }),
      } as never);
      // delete calls for cleanup
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as never);
      // update for channel cleanup
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/agents/${agent.id}`,
      });

      expect(res.statusCode).toBe(204);
    });

    it("returns 404 when deleting non-owned agent", async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "DELETE",
        url: `/api/agents/${randomUUID()}`,
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("Agent not found");
    });
  });

  // ------- POST /api/agents/pair — bot token pairing -------

  describe("POST /api/agents/pair — pairing flow", () => {
    it("rejects empty botToken", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/agents/pair",
        payload: { botToken: "" },
      });

      // Zod validation: min(1) on botToken
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("does not require authentication", async () => {
      // The pair endpoint is public — it should NOT call requireAuth
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const res = await app.inject({
        method: "POST",
        url: "/api/agents/pair",
        payload: { botToken: "ari_test" },
      });

      // Even if token is invalid, it should reach the handler (not 401)
      expect(res.statusCode).toBe(404); // "Invalid bot token"
      expect(requireAuth).not.toHaveBeenCalled();
    });
  });
});
