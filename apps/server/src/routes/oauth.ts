import type { FastifyInstance } from "fastify";
import { db } from "../db/index.js";
import { appOAuthClients, oauthAuthorizationCodes, oauthAccessTokens, apps, user, agents } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import crypto from "crypto";

export async function oauthRoutes(app: FastifyInstance) {
  // GET /oauth/authorize?client_id=...&redirect_uri=...&scope=...&state=...
  // Returns JSON with app info for frontend to render consent screen
  // Scopes: "profile", "agents", "economy"
  app.get("/oauth/authorize", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const { client_id, redirect_uri, scope, state } = request.query as any;

    if (!client_id || !redirect_uri) {
      return reply.status(400).send({ error: "missing_params", message: "client_id and redirect_uri are required" });
    }

    // Find OAuth client
    const [client] = await db.select().from(appOAuthClients).where(eq(appOAuthClients.clientId, client_id));
    if (!client) {
      return reply.status(400).send({ error: "invalid_client", message: "Unknown client_id" });
    }

    // Validate redirect_uri
    const validUris = client.redirectUris as string[];
    if (!validUris.includes(redirect_uri)) {
      return reply.status(400).send({ error: "invalid_redirect_uri" });
    }

    // Get app info
    const [appInfo] = await db.select().from(apps).where(eq(apps.id, client.appId));

    return { appName: appInfo?.name, appDescription: appInfo?.description, scopes: (scope || "profile").split(" "), state, client_id, redirect_uri };
  });

  // POST /oauth/authorize - User consents
  app.post("/oauth/authorize", async (request, reply) => {
    const authUser = await requireAuth(request, reply);
    const { client_id, redirect_uri, scope, state } = request.body as any;

    // Verify client
    const [client] = await db.select().from(appOAuthClients).where(eq(appOAuthClients.clientId, client_id));
    if (!client) return reply.status(400).send({ error: "invalid_client" });

    const validUris = client.redirectUris as string[];
    if (!validUris.includes(redirect_uri)) return reply.status(400).send({ error: "invalid_redirect_uri" });

    // Generate authorization code
    const code = crypto.randomBytes(32).toString("hex");
    await db.insert(oauthAuthorizationCodes).values({
      code,
      clientId: client_id,
      userId: authUser.id,
      redirectUri: redirect_uri,
      scope: scope || "profile",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);

    return { redirect_url: redirectUrl.toString() };
  });

  // POST /oauth/token - Exchange code for access token
  app.post("/oauth/token", async (request, reply) => {
    const { grant_type, code, client_id, client_secret, redirect_uri } = request.body as any;

    if (grant_type !== "authorization_code") {
      return reply.status(400).send({ error: "unsupported_grant_type" });
    }

    // Verify client credentials
    const [client] = await db.select().from(appOAuthClients).where(eq(appOAuthClients.clientId, client_id));
    if (!client || client.clientSecret !== client_secret) {
      return reply.status(401).send({ error: "invalid_client" });
    }

    // Find and validate code
    const [authCode] = await db.select().from(oauthAuthorizationCodes)
      .where(and(eq(oauthAuthorizationCodes.code, code), eq(oauthAuthorizationCodes.clientId, client_id)));

    if (!authCode || authCode.expiresAt < new Date() || authCode.redirectUri !== redirect_uri) {
      return reply.status(400).send({ error: "invalid_grant" });
    }

    // Delete used code
    await db.delete(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.id, authCode.id));

    // Generate access token (valid 30 days)
    const token = crypto.randomBytes(48).toString("hex");
    await db.insert(oauthAccessTokens).values({
      token,
      clientId: client_id,
      userId: authCode.userId,
      appId: client.appId,
      scope: authCode.scope,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // Get user info
    const [userInfo] = await db.select({ id: user.id, name: user.name, email: user.email, image: user.image })
      .from(user).where(eq(user.id, authCode.userId));

    return { access_token: token, token_type: "Bearer", expires_in: 30 * 24 * 60 * 60, scope: authCode.scope, user: userInfo };
  });

  // GET /api/v1/user/profile
  app.get("/api/v1/user/profile", async (request, reply) => {
    const tokenData = await requireAppAuthFromRequest(request, reply);
    if (!tokenData) return;

    const [userInfo] = await db.select({
      id: user.id, name: user.name, email: user.email, image: user.image, createdAt: user.createdAt
    }).from(user).where(eq(user.id, tokenData.userId));

    if (!userInfo) return reply.status(404).send({ error: "user_not_found" });
    return userInfo;
  });

  // GET /api/v1/user/agents
  app.get("/api/v1/user/agents", async (request, reply) => {
    const tokenData = await requireAppAuthFromRequest(request, reply);
    if (!tokenData) return;

    if (!tokenData.scope.includes("agents")) {
      return reply.status(403).send({ error: "insufficient_scope", message: "Requires 'agents' scope" });
    }

    const userAgents = await db.select({
      id: agents.id, name: agents.name, description: agents.description, avatarUrl: agents.avatarUrl
    }).from(agents).where(eq(agents.ownerId, tokenData.userId));

    return { agents: userAgents };
  });
}

// Helper to validate Bearer token from external apps
export async function requireAppAuthFromRequest(request: any, reply: any): Promise<{ userId: string; appId: string; scope: string; clientId: string } | null> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    reply.status(401).send({ error: "missing_token", message: "Authorization: Bearer <token> required" });
    return null;
  }

  const token = authHeader.slice(7);
  const [tokenData] = await db.select().from(oauthAccessTokens).where(eq(oauthAccessTokens.token, token));

  if (!tokenData || tokenData.expiresAt < new Date()) {
    reply.status(401).send({ error: "invalid_token", message: "Token expired or invalid" });
    return null;
  }

  return { userId: tokenData.userId, appId: tokenData.appId, scope: tokenData.scope, clientId: tokenData.clientId };
}
