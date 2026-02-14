import type { FastifyInstance } from "fastify";
import { auth } from "../auth.js";

export async function authRoutes(app: FastifyInstance) {
  app.all("/api/auth/*", async (request, reply) => {
    const url = new URL(
      request.url,
      `http://${request.headers.host ?? "localhost"}`
    );
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value) {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.append(key, value);
        }
      }
    }

    const body =
      request.method !== "GET" && request.method !== "HEAD" && request.body
        ? JSON.stringify(request.body)
        : undefined;

    const req = new Request(url.toString(), {
      method: request.method,
      headers,
      body,
    });

    const response = await auth.handler(req);

    // Forward status
    reply.status(response.status);

    // Forward headers
    for (const [key, value] of response.headers.entries()) {
      reply.header(key, value);
    }

    // Forward body
    const text = await response.text();
    return reply.send(text);
  });
}
