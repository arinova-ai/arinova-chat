import type { FastifyRequest, FastifyReply } from "fastify";
import { auth } from "../auth.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<AuthUser> {
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

  const session = await auth.api.getSession({ headers });
  if (!session) {
    reply.status(401).send({ error: "Unauthorized" });
    throw new Error("Unauthorized");
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}
