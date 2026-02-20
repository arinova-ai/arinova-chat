import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { healthRoutes } from "./health.js";

describe("Health Routes", () => {
  it("GET /health returns status ok", async () => {
    const app = Fastify();
    await app.register(healthRoutes);
    await app.ready();

    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();

    await app.close();
  });
});
