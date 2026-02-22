import type {
  ArinovaConfig,
  LoginOptions,
  LoginResult,
  ArinovaUser,
  AgentInfo,
  AgentChatOptions,
  AgentChatResponse,
  AgentChatStreamOptions,
  AgentChatStreamResponse,
  ChargeOptions,
  ChargeResponse,
  AwardOptions,
  AwardResponse,
  BalanceResponse,
  SSEEvent,
} from "./types.js";

export type * from "./types.js";

let _config: ArinovaConfig | null = null;
let _oauthClientInfo: { clientId: string; clientSecret: string } | null = null;

function getBaseUrl(): string {
  if (!_config) throw new Error("Arinova SDK not initialized. Call Arinova.init() first.");
  return _config.baseUrl || "https://api.arinova.ai";
}

function getConfig(): ArinovaConfig {
  if (!_config) throw new Error("Arinova SDK not initialized. Call Arinova.init() first.");
  return _config;
}

export const Arinova = {
  /**
   * Initialize the SDK with your app configuration.
   */
  init(config: ArinovaConfig & { clientId?: string; clientSecret?: string }) {
    _config = config;
    if (config.clientId && config.clientSecret) {
      _oauthClientInfo = { clientId: config.clientId, clientSecret: config.clientSecret };
    }
  },

  /**
   * Redirect to Arinova OAuth login page.
   * Call this from your game's frontend.
   */
  login(options?: LoginOptions): void {
    const config = getConfig();
    const baseUrl = getBaseUrl();
    const scope = options?.scope?.join(" ") || "profile";

    // Store current URL for callback
    const currentUrl = typeof window !== "undefined" ? window.location.href : "";

    const params = new URLSearchParams({
      client_id: config.appId,
      redirect_uri: currentUrl,
      scope,
      state: crypto.randomUUID(),
    });

    window.location.href = `${baseUrl}/oauth/authorize?${params}`;
  },

  /**
   * Handle the OAuth callback. Call this on your redirect page.
   * Exchanges the authorization code for an access token.
   */
  async handleCallback(params: {
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  }): Promise<LoginResult> {
    const baseUrl = getBaseUrl();

    const res = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: params.code,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        redirect_uri: params.redirectUri,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: "token_exchange_failed" }));
      throw new Error(error.error || "Token exchange failed");
    }

    const data = await res.json();
    return {
      user: data.user,
      accessToken: data.access_token,
    };
  },

  user: {
    /**
     * Get the authenticated user's profile.
     */
    async profile(accessToken: string): Promise<ArinovaUser> {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}/api/v1/user/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Failed to get user profile");
      return res.json();
    },

    /**
     * Get the authenticated user's agents.
     * Requires "agents" scope.
     */
    async agents(accessToken: string): Promise<AgentInfo[]> {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}/api/v1/user/agents`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error("Failed to get user agents");
      const data = await res.json();
      return data.agents;
    },
  },

  agent: {
    /**
     * Send a prompt to a user's agent and get a complete response.
     */
    async chat(options: AgentChatOptions): Promise<AgentChatResponse> {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}/api/v1/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.accessToken}`,
        },
        body: JSON.stringify({
          agentId: options.agentId,
          prompt: options.prompt,
          systemPrompt: options.systemPrompt,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "agent_chat_failed" }));
        throw new Error(error.error || "Agent chat failed");
      }

      return res.json();
    },

    /**
     * Send a prompt to a user's agent and receive a streaming response via SSE.
     */
    async chatStream(options: AgentChatStreamOptions): Promise<AgentChatStreamResponse> {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}/api/v1/agent/chat/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.accessToken}`,
        },
        body: JSON.stringify({
          agentId: options.agentId,
          prompt: options.prompt,
          systemPrompt: options.systemPrompt,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "agent_stream_failed" }));
        throw new Error(error.error || "Agent stream failed");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event: SSEEvent = JSON.parse(line.slice(6));
            if (event.type === "chunk") {
              options.onChunk(event.content);
              fullContent = event.content;
            } else if (event.type === "done") {
              fullContent = event.content;
            } else if (event.type === "error") {
              throw new Error(event.error);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
          }
        }
      }

      return { content: fullContent, agentId: options.agentId };
    },
  },

  economy: {
    /**
     * Charge coins from a user's balance (server-to-server).
     * Requires clientId and clientSecret.
     */
    async charge(options: ChargeOptions & { clientId: string; clientSecret: string }): Promise<ChargeResponse> {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}/api/v1/economy/charge`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Id": options.clientId,
          "X-App-Secret": options.clientSecret,
        },
        body: JSON.stringify({
          userId: options.userId,
          amount: options.amount,
          description: options.description,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "charge_failed" }));
        throw new Error(error.error || "Charge failed");
      }

      return res.json();
    },

    /**
     * Award coins to a user (server-to-server).
     * Requires clientId and clientSecret.
     */
    async award(options: AwardOptions & { clientId: string; clientSecret: string }): Promise<AwardResponse> {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}/api/v1/economy/award`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Id": options.clientId,
          "X-App-Secret": options.clientSecret,
        },
        body: JSON.stringify({
          userId: options.userId,
          amount: options.amount,
          description: options.description,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "award_failed" }));
        throw new Error(error.error || "Award failed");
      }

      return res.json();
    },

    /**
     * Get a user's coin balance (uses OAuth access token).
     */
    async balance(accessToken: string): Promise<BalanceResponse> {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}/api/v1/economy/balance`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) throw new Error("Failed to get balance");
      return res.json();
    },
  },
};
