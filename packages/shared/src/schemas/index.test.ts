import { describe, it, expect } from "vitest";
import {
  registerSchema,
  loginSchema,
  createAgentSchema,
  updateAgentSchema,
  createConversationSchema,
  createGroupConversationSchema,
  addGroupMemberSchema,
  sendMessageSchema,
  pairingExchangeSchema,
  appManifestSchema,
  wsClientEventSchema,
  agentWSClientEventSchema,
  createCommunitySchema,
  updateCommunitySchema,
  createChannelSchema,
  updateChannelSchema,
} from "./index.js";

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

describe("registerSchema", () => {
  it("accepts valid registration data", () => {
    const result = registerSchema.safeParse({
      email: "test@example.com",
      password: "12345678",
      name: "Alice",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "12345678",
      name: "Alice",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password (< 8 chars)", () => {
    const result = registerSchema.safeParse({
      email: "test@example.com",
      password: "1234567",
      name: "Alice",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = registerSchema.safeParse({
      email: "test@example.com",
      password: "12345678",
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 chars", () => {
    const result = registerSchema.safeParse({
      email: "test@example.com",
      password: "12345678",
      name: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    const result = loginSchema.safeParse({
      email: "test@example.com",
      password: "anything",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing password", () => {
    const result = loginSchema.safeParse({ email: "test@example.com" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Agent schemas
// ---------------------------------------------------------------------------

describe("createAgentSchema", () => {
  it("accepts minimal data (name only)", () => {
    const result = createAgentSchema.safeParse({ name: "Bot" });
    expect(result.success).toBe(true);
  });

  it("accepts full data with a2aEndpoint", () => {
    const result = createAgentSchema.safeParse({
      name: "Bot",
      description: "A helpful bot",
      a2aEndpoint: "https://example.com/.well-known/agent.json",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createAgentSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name over 100 chars", () => {
    const result = createAgentSchema.safeParse({ name: "x".repeat(101) });
    expect(result.success).toBe(false);
  });

  it("rejects invalid a2aEndpoint URL", () => {
    const result = createAgentSchema.safeParse({
      name: "Bot",
      a2aEndpoint: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateAgentSchema", () => {
  it("accepts empty object (all optional)", () => {
    const result = updateAgentSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts nullable fields", () => {
    const result = updateAgentSchema.safeParse({
      description: null,
      a2aEndpoint: null,
      systemPrompt: null,
      welcomeMessage: null,
      quickReplies: null,
    });
    expect(result.success).toBe(true);
  });

  it("validates quickReplies structure", () => {
    const result = updateAgentSchema.safeParse({
      quickReplies: [
        { label: "Hi", message: "Hello there" },
        { label: "Bye", message: "Goodbye" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects quickReplies with empty label", () => {
    const result = updateAgentSchema.safeParse({
      quickReplies: [{ label: "", message: "Hello" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 10 quickReplies", () => {
    const replies = Array.from({ length: 11 }, (_, i) => ({
      label: `Q${i}`,
      message: `Answer ${i}`,
    }));
    const result = updateAgentSchema.safeParse({ quickReplies: replies });
    expect(result.success).toBe(false);
  });

  it("rejects description over 500 chars", () => {
    const result = updateAgentSchema.safeParse({
      description: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("rejects systemPrompt over 4000 chars", () => {
    const result = updateAgentSchema.safeParse({
      systemPrompt: "x".repeat(4001),
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Conversation schemas
// ---------------------------------------------------------------------------

describe("createConversationSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid agentId", () => {
    const result = createConversationSchema.safeParse({ agentId: validUUID });
    expect(result.success).toBe(true);
  });

  it("accepts optional title", () => {
    const result = createConversationSchema.safeParse({
      agentId: validUUID,
      title: "My Chat",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID agentId", () => {
    const result = createConversationSchema.safeParse({ agentId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects title over 200 chars", () => {
    const result = createConversationSchema.safeParse({
      agentId: validUUID,
      title: "t".repeat(201),
    });
    expect(result.success).toBe(false);
  });
});

describe("createGroupConversationSchema", () => {
  const uuid1 = "550e8400-e29b-41d4-a716-446655440001";
  const uuid2 = "550e8400-e29b-41d4-a716-446655440002";

  it("accepts valid group data", () => {
    const result = createGroupConversationSchema.safeParse({
      title: "Group Chat",
      agentIds: [uuid1, uuid2],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty agentIds", () => {
    const result = createGroupConversationSchema.safeParse({
      title: "Group Chat",
      agentIds: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty title", () => {
    const result = createGroupConversationSchema.safeParse({
      title: "",
      agentIds: [uuid1],
    });
    expect(result.success).toBe(false);
  });
});

describe("addGroupMemberSchema", () => {
  it("accepts valid UUID", () => {
    const result = addGroupMemberSchema.safeParse({
      agentId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID", () => {
    const result = addGroupMemberSchema.safeParse({ agentId: "abc" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Message schema
// ---------------------------------------------------------------------------

describe("sendMessageSchema", () => {
  const validUUID = "550e8400-e29b-41d4-a716-446655440000";

  it("accepts valid message", () => {
    const result = sendMessageSchema.safeParse({
      conversationId: validUUID,
      content: "Hello!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty content", () => {
    const result = sendMessageSchema.safeParse({
      conversationId: validUUID,
      content: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects content over 32000 chars", () => {
    const result = sendMessageSchema.safeParse({
      conversationId: validUUID,
      content: "x".repeat(32001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts content at exactly 32000 chars", () => {
    const result = sendMessageSchema.safeParse({
      conversationId: validUUID,
      content: "x".repeat(32000),
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Pairing schema
// ---------------------------------------------------------------------------

describe("pairingExchangeSchema", () => {
  it("accepts botToken only", () => {
    const result = pairingExchangeSchema.safeParse({
      botToken: "ari_abc123",
    });
    expect(result.success).toBe(true);
  });

  it("accepts botToken with a2aEndpoint", () => {
    const result = pairingExchangeSchema.safeParse({
      botToken: "ari_abc123",
      a2aEndpoint: "https://agent.example.com/.well-known/agent.json",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty botToken", () => {
    const result = pairingExchangeSchema.safeParse({ botToken: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid a2aEndpoint URL", () => {
    const result = pairingExchangeSchema.safeParse({
      botToken: "ari_abc123",
      a2aEndpoint: "not-a-url",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Community schemas
// ---------------------------------------------------------------------------

describe("createCommunitySchema", () => {
  it("accepts valid community", () => {
    const result = createCommunitySchema.safeParse({ name: "My Community" });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createCommunitySchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("updateCommunitySchema", () => {
  it("accepts empty object (all partial)", () => {
    const result = updateCommunitySchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("createChannelSchema", () => {
  it("accepts valid channel", () => {
    const result = createChannelSchema.safeParse({ name: "general" });
    expect(result.success).toBe(true);
  });

  it("accepts channel with agentId", () => {
    const result = createChannelSchema.safeParse({
      name: "general",
      agentId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateChannelSchema", () => {
  it("accepts empty object (all partial)", () => {
    const result = updateChannelSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WebSocket event schemas
// ---------------------------------------------------------------------------

describe("wsClientEventSchema", () => {
  it("accepts send_message event", () => {
    const result = wsClientEventSchema.safeParse({
      type: "send_message",
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
      content: "Hello",
    });
    expect(result.success).toBe(true);
  });

  it("accepts cancel_stream event", () => {
    const result = wsClientEventSchema.safeParse({
      type: "cancel_stream",
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
      messageId: "550e8400-e29b-41d4-a716-446655440001",
    });
    expect(result.success).toBe(true);
  });

  it("accepts ping event", () => {
    const result = wsClientEventSchema.safeParse({ type: "ping" });
    expect(result.success).toBe(true);
  });

  it("rejects unknown event type", () => {
    const result = wsClientEventSchema.safeParse({ type: "unknown" });
    expect(result.success).toBe(false);
  });

  it("rejects send_message with empty content", () => {
    const result = wsClientEventSchema.safeParse({
      type: "send_message",
      conversationId: "550e8400-e29b-41d4-a716-446655440000",
      content: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("agentWSClientEventSchema", () => {
  it("accepts agent_auth event", () => {
    const result = agentWSClientEventSchema.safeParse({
      type: "agent_auth",
      agentId: "550e8400-e29b-41d4-a716-446655440000",
      secretToken: "ari_abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects agent_auth without secretToken", () => {
    const result = agentWSClientEventSchema.safeParse({
      type: "agent_auth",
      agentId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });

  it("accepts agent_chunk event", () => {
    const result = agentWSClientEventSchema.safeParse({
      type: "agent_chunk",
      taskId: "task-1",
      chunk: "Hello",
    });
    expect(result.success).toBe(true);
  });

  it("accepts agent_complete event", () => {
    const result = agentWSClientEventSchema.safeParse({
      type: "agent_complete",
      taskId: "task-1",
      content: "Full response",
    });
    expect(result.success).toBe(true);
  });

  it("accepts agent_error event", () => {
    const result = agentWSClientEventSchema.safeParse({
      type: "agent_error",
      taskId: "task-1",
      error: "Something failed",
    });
    expect(result.success).toBe(true);
  });

  it("accepts ping event", () => {
    const result = agentWSClientEventSchema.safeParse({ type: "ping" });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// App manifest schema
// ---------------------------------------------------------------------------

describe("appManifestSchema", () => {
  const validManifest = {
    manifest_version: 1,
    id: "my-cool-app",
    name: "My Cool App",
    version: "1.0.0",
    description: "A cool app for testing",
    author: { name: "Test Author" },
    category: "game" as const,
    tags: ["fun", "multiplayer"],
    icon: "icon.png",
    ui: {
      entry: "index.html",
      viewport: {
        minWidth: 320,
        maxWidth: 1024,
        aspectRatio: "16:9",
        orientation: "any" as const,
      },
    },
    platforms: { web: true, ios: false, android: false },
    players: { min: 1, max: 4 },
    roles: {
      player: {
        prompt: "You are a player",
        state: {},
        actions: [{ name: "move", description: "Move the piece" }],
      },
    },
    agentInterface: {
      mode: "static" as const,
      description: "Static interface",
    },
    interaction: {
      controlModes: ["human" as const],
      defaultMode: "human" as const,
      humanInput: "direct" as const,
    },
    monetization: {
      model: "free" as const,
      virtualGoods: false,
      externalPayments: false,
    },
    rating: { age: "4+" as const, descriptors: [] },
    permissions: [] as string[],
  };

  it("accepts valid manifest", () => {
    const result = appManifestSchema.safeParse(validManifest);
    expect(result.success).toBe(true);
  });

  it("rejects invalid semver version", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      version: "1.0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-kebab-case id", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      id: "My Cool App",
    });
    expect(result.success).toBe(false);
  });

  it("rejects id starting with hyphen", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      id: "-my-app",
    });
    expect(result.success).toBe(false);
  });

  it("rejects no platforms enabled", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      platforms: { web: false, ios: false, android: false },
    });
    expect(result.success).toBe(false);
  });

  it("rejects players max < min", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      players: { min: 4, max: 2 },
    });
    expect(result.success).toBe(false);
  });

  it("requires network.allowed when network permission declared", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      permissions: ["network"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts network permission with allowed list", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      permissions: ["network"],
      network: { allowed: ["api.example.com"] },
    });
    expect(result.success).toBe(true);
  });

  it("requires maxStateSize/maxActions for dynamic mode", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      agentInterface: { mode: "dynamic", description: "Dynamic" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts dynamic mode with maxStateSize and maxActions", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      agentInterface: {
        mode: "dynamic",
        description: "Dynamic",
        maxStateSize: 1024,
        maxActions: 10,
      },
    });
    expect(result.success).toBe(true);
  });

  // --- Missing required fields ---

  it("rejects missing name", () => {
    const { name, ...rest } = validManifest;
    const result = appManifestSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing description", () => {
    const { description, ...rest } = validManifest;
    const result = appManifestSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing author", () => {
    const { author, ...rest } = validManifest;
    const result = appManifestSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing ui entry", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      ui: { viewport: validManifest.ui.viewport },
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing roles", () => {
    const { roles, ...rest } = validManifest;
    const result = appManifestSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects missing interaction", () => {
    const { interaction, ...rest } = validManifest;
    const result = appManifestSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  // --- Invalid enums ---

  it("rejects invalid category enum", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      category: "invalid-category",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid agentInterface mode enum", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      agentInterface: { mode: "hybrid", description: "Bad mode" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid controlMode enum", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      interaction: {
        controlModes: ["telekinesis"],
        defaultMode: "telekinesis",
        humanInput: "direct",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid humanInput enum", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      interaction: {
        ...validManifest.interaction,
        humanInput: "telepathy",
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid monetization model enum", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      monetization: { model: "crypto", virtualGoods: false, externalPayments: false },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid age rating enum", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      rating: { age: "18+", descriptors: [] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid permission enum", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      permissions: ["filesystem"],
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid orientation enum", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      ui: {
        ...validManifest.ui,
        viewport: { ...validManifest.ui.viewport, orientation: "diagonal" },
      },
    });
    expect(result.success).toBe(false);
  });

  // --- Edge cases ---

  it("rejects empty controlModes array", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      interaction: { ...validManifest.interaction, controlModes: [] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects too many tags", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      tags: Array(11).fill("tag"),
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid categories", () => {
    for (const cat of ["game", "shopping", "tool", "social", "other"]) {
      const result = appManifestSchema.safeParse({ ...validManifest, category: cat });
      expect(result.success).toBe(true);
    }
  });

  it("accepts all valid age ratings", () => {
    for (const age of ["4+", "9+", "12+", "17+"]) {
      const result = appManifestSchema.safeParse({
        ...validManifest,
        rating: { age, descriptors: [] },
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts storage permission without network config", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      permissions: ["storage"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts multiple permissions", () => {
    const result = appManifestSchema.safeParse({
      ...validManifest,
      permissions: ["storage", "audio"],
    });
    expect(result.success).toBe(true);
  });
});
