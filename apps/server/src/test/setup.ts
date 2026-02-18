/**
 * Test setup helpers for unit-style route tests.
 *
 * Provides a pre-configured Fastify app with mocked DB and auth,
 * ready for .inject() testing. Also re-exports the integration-test
 * DB helpers for scenarios that need a real database.
 */

import { beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";

// Re-export integration-test DB helpers
export { testDb, truncateAll, closeTestDb } from "./setup-db.js";

/**
 * Build a lightweight Fastify instance with WebSocket support
 * for testing routes via .inject().
 *
 * Does NOT register any routes — callers should register the
 * specific route plugin they want to test.
 */
export async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(websocket);
  return app;
}

/**
 * Standard lifecycle hooks for route-level unit tests.
 *
 * Call inside a top-level describe():
 *   const ctx = setupRouteTest(agentRoutes);
 *
 * ctx.app is ready after beforeAll.
 */
export function setupRouteTest(
  routePlugin: (app: FastifyInstance) => Promise<void>
) {
  const ctx: { app: FastifyInstance } = {} as { app: FastifyInstance };

  beforeAll(async () => {
    ctx.app = await buildTestApp();
    await ctx.app.register(routePlugin);
    await ctx.app.ready();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  return ctx;
}
