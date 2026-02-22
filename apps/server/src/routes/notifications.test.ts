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
    execute: vi.fn().mockResolvedValue(undefined),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
  };
  return { db: mockDb };
});

import { notificationRoutes } from "./notifications.js";
import { db } from "../db/index.js";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const PREF_ID = "00000000-0000-0000-0000-000000000010";

function mockPrefs(overrides = {}) {
  return {
    id: PREF_ID,
    userId: USER_ID,
    globalEnabled: true,
    messageEnabled: true,
    playgroundInviteEnabled: true,
    playgroundTurnEnabled: true,
    playgroundResultEnabled: true,
    quietHoursStart: null,
    quietHoursEnd: null,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  };
}

describe("Notification Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();
    await app.register(notificationRoutes);
    await app.ready();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe("GET /api/notifications/preferences", () => {
    it("returns defaults when no preference record exists", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/preferences",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.globalEnabled).toBe(true);
      expect(body.messageEnabled).toBe(true);
      expect(body.playgroundInviteEnabled).toBe(true);
      expect(body.playgroundTurnEnabled).toBe(true);
      expect(body.playgroundResultEnabled).toBe(true);
      expect(body.quietHoursStart).toBeNull();
      expect(body.quietHoursEnd).toBeNull();
    });

    it("returns stored preferences when record exists", async () => {
      const prefs = mockPrefs({ globalEnabled: false, quietHoursStart: "22:00" });

      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([prefs]);

      const res = await app.inject({
        method: "GET",
        url: "/api/notifications/preferences",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.globalEnabled).toBe(false);
      expect(body.quietHoursStart).toBe("22:00");
      expect(body.quietHoursEnd).toBeNull();
    });
  });

  describe("PUT /api/notifications/preferences", () => {
    it("creates preferences when no existing record and returns ok", async () => {
      // First select to check for existing record → empty
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      // insert().values() → no returning needed
      vi.mocked(db.insert).mockReturnValue(db as any);
      vi.mocked(db.values).mockResolvedValue(undefined);

      const res = await app.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: {
          globalEnabled: true,
          messageEnabled: false,
          playgroundInviteEnabled: true,
          playgroundTurnEnabled: true,
          playgroundResultEnabled: true,
          quietHoursStart: null,
          quietHoursEnd: null,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(true);
    });

    it("updates preferences when existing record exists and returns ok", async () => {
      const existing = { id: PREF_ID };

      // select → [existing]
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where)
        .mockResolvedValueOnce([existing])  // check for existing record
        .mockResolvedValue(undefined);       // update chain where

      vi.mocked(db.update).mockReturnValue(db as any);
      vi.mocked(db.set).mockReturnValue(db as any);

      const res = await app.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: {
          globalEnabled: false,
          messageEnabled: true,
          playgroundInviteEnabled: false,
          playgroundTurnEnabled: false,
          playgroundResultEnabled: false,
          quietHoursStart: "23:00",
          quietHoursEnd: "07:00",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.ok).toBe(true);

      // Verify update was called (not insert)
      expect(vi.mocked(db.update)).toHaveBeenCalled();
      expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
    });

    it("returns 400 when payload fails validation", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/notifications/preferences",
        payload: {
          globalEnabled: "not-a-boolean",
        },
      });

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
