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
  notificationTypeSchema,
  pushSubscriptionSchema,
  notificationPreferenceSchema,
  playgroundDefinitionSchema,
  createPlaygroundSchema,
  joinPlaygroundSchema,
  playgroundActionSchema,
  playgroundWSClientEventSchema,
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

// ---------------------------------------------------------------------------
// Push Notification schemas
// ---------------------------------------------------------------------------

describe("notificationTypeSchema", () => {
  it("accepts valid notification types", () => {
    for (const type of ["message", "playground_invite", "playground_turn", "playground_result"]) {
      expect(notificationTypeSchema.safeParse(type).success).toBe(true);
    }
  });

  it("rejects invalid type", () => {
    expect(notificationTypeSchema.safeParse("email").success).toBe(false);
  });
});

describe("pushSubscriptionSchema", () => {
  const validSub = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    keys: {
      p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfA04=",
      auth: "tBHItJI5svbpC7htDNAl_A==",
    },
  };

  it("accepts valid subscription", () => {
    expect(pushSubscriptionSchema.safeParse(validSub).success).toBe(true);
  });

  it("accepts subscription with deviceInfo", () => {
    expect(pushSubscriptionSchema.safeParse({ ...validSub, deviceInfo: "Chrome/120" }).success).toBe(true);
  });

  it("rejects invalid endpoint URL", () => {
    expect(pushSubscriptionSchema.safeParse({ ...validSub, endpoint: "not-a-url" }).success).toBe(false);
  });

  it("rejects empty p256dh", () => {
    expect(pushSubscriptionSchema.safeParse({ ...validSub, keys: { ...validSub.keys, p256dh: "" } }).success).toBe(false);
  });

  it("rejects empty auth", () => {
    expect(pushSubscriptionSchema.safeParse({ ...validSub, keys: { ...validSub.keys, auth: "" } }).success).toBe(false);
  });

  it("rejects deviceInfo over 500 chars", () => {
    expect(pushSubscriptionSchema.safeParse({ ...validSub, deviceInfo: "x".repeat(501) }).success).toBe(false);
  });
});

describe("notificationPreferenceSchema", () => {
  const validPrefs = {
    globalEnabled: true,
    messageEnabled: true,
    playgroundInviteEnabled: true,
    playgroundTurnEnabled: true,
    playgroundResultEnabled: true,
    quietHoursStart: null,
    quietHoursEnd: null,
  };

  it("accepts valid preferences with null quiet hours", () => {
    expect(notificationPreferenceSchema.safeParse(validPrefs).success).toBe(true);
  });

  it("accepts valid quiet hours", () => {
    expect(notificationPreferenceSchema.safeParse({ ...validPrefs, quietHoursStart: "22:00", quietHoursEnd: "07:00" }).success).toBe(true);
  });

  it("rejects invalid quiet hours format", () => {
    expect(notificationPreferenceSchema.safeParse({ ...validPrefs, quietHoursStart: "25:00" }).success).toBe(false);
    expect(notificationPreferenceSchema.safeParse({ ...validPrefs, quietHoursStart: "9:00" }).success).toBe(false);
    expect(notificationPreferenceSchema.safeParse({ ...validPrefs, quietHoursStart: "22:60" }).success).toBe(false);
  });

  it("rejects missing required boolean fields", () => {
    const { globalEnabled, ...rest } = validPrefs;
    expect(notificationPreferenceSchema.safeParse(rest).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Playground schemas
// ---------------------------------------------------------------------------

const validPlaygroundDefinition = {
  metadata: {
    name: "狼人殺",
    description: "經典狼人殺遊戲",
    category: "game" as const,
    minPlayers: 5,
    maxPlayers: 12,
    tags: ["狼人殺", "多人"],
  },
  roles: [
    {
      name: "villager",
      description: "普通村民",
      visibleState: ["alivePlayers", "currentPhase"],
      availableActions: ["vote"],
      systemPrompt: "你是一個村民，找出狼人並投票消滅他們。",
    },
    {
      name: "werewolf",
      description: "狼人",
      visibleState: ["alivePlayers", "currentPhase", "werewolfTeam"],
      availableActions: ["vote", "kill"],
      systemPrompt: "你是狼人，在夜晚選擇一個村民殺害。",
    },
  ],
  phases: [
    {
      name: "night",
      description: "夜晚階段",
      duration: 30,
      allowedActions: ["kill"],
      next: "day-discuss",
    },
    {
      name: "day-discuss",
      description: "白天討論",
      duration: 60,
      allowedActions: [],
      next: "day-vote",
    },
    {
      name: "day-vote",
      description: "白天投票",
      duration: 30,
      allowedActions: ["vote"],
      transitionCondition: "allPlayersVoted",
      next: "night",
    },
  ],
  actions: [
    {
      name: "vote",
      description: "投票消滅一名玩家",
      targetType: "player" as const,
      phases: ["day-vote"],
    },
    {
      name: "kill",
      description: "狼人殺害一名玩家",
      targetType: "player" as const,
      phases: ["night"],
      roles: ["werewolf"],
    },
  ],
  winConditions: [
    {
      role: "villager",
      condition: "allWerewolvesDead",
      description: "所有狼人被消滅",
    },
    {
      role: "werewolf",
      condition: "werewolvesEqualVillagers",
      description: "狼人數量 >= 村民數量",
    },
  ],
  economy: {
    currency: "free" as const,
    entryFee: 0,
    prizeDistribution: "winner-takes-all" as const,
  },
  initialState: {
    alivePlayers: [],
    eliminatedPlayers: [],
    currentRound: 0,
  },
};

describe("playgroundDefinitionSchema", () => {
  it("accepts valid playground definition", () => {
    const result = playgroundDefinitionSchema.safeParse(validPlaygroundDefinition);
    expect(result.success).toBe(true);
  });

  it("accepts definition with maxStateSize", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      maxStateSize: 1048576,
    });
    expect(result.success).toBe(true);
  });

  it("accepts economy with percentage-based prize distribution", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      economy: {
        currency: "play",
        entryFee: 100,
        prizeDistribution: { first: 60, second: 30, third: 10 },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts economy with betting config", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      economy: {
        currency: "arinova",
        entryFee: 50,
        prizeDistribution: "winner-takes-all",
        betting: { enabled: true, minBet: 10, maxBet: 500 },
      },
    });
    expect(result.success).toBe(true);
  });

  // --- Missing required fields ---

  it("rejects missing metadata", () => {
    const { metadata, ...rest } = validPlaygroundDefinition;
    expect(playgroundDefinitionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing roles", () => {
    const { roles, ...rest } = validPlaygroundDefinition;
    expect(playgroundDefinitionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing phases", () => {
    const { phases, ...rest } = validPlaygroundDefinition;
    expect(playgroundDefinitionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing actions", () => {
    const { actions, ...rest } = validPlaygroundDefinition;
    expect(playgroundDefinitionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing winConditions", () => {
    const { winConditions, ...rest } = validPlaygroundDefinition;
    expect(playgroundDefinitionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects missing economy", () => {
    const { economy, ...rest } = validPlaygroundDefinition;
    expect(playgroundDefinitionSchema.safeParse(rest).success).toBe(false);
  });

  // --- Empty arrays ---

  it("rejects empty roles array", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      roles: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty phases array", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      phases: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty actions array", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      actions: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty winConditions array", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      winConditions: [],
    });
    expect(result.success).toBe(false);
  });

  // --- Metadata validation ---

  it("rejects metadata with empty name", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      metadata: { ...validPlaygroundDefinition.metadata, name: "" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects metadata with name over 100 chars", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      metadata: { ...validPlaygroundDefinition.metadata, name: "x".repeat(101) },
    });
    expect(result.success).toBe(false);
  });

  it("rejects metadata with maxPlayers < minPlayers", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      metadata: { ...validPlaygroundDefinition.metadata, minPlayers: 8, maxPlayers: 4 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid category enum", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      metadata: { ...validPlaygroundDefinition.metadata, category: "adventure" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid categories", () => {
    for (const cat of ["game", "strategy", "social", "puzzle", "roleplay", "other"]) {
      const result = playgroundDefinitionSchema.safeParse({
        ...validPlaygroundDefinition,
        metadata: { ...validPlaygroundDefinition.metadata, category: cat },
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects too many tags", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      metadata: { ...validPlaygroundDefinition.metadata, tags: Array(11).fill("tag") },
    });
    expect(result.success).toBe(false);
  });

  // --- Economy validation ---

  it("rejects invalid currency enum", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      economy: { ...validPlaygroundDefinition.economy, currency: "bitcoin" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative entry fee", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      economy: { ...validPlaygroundDefinition.economy, entryFee: -10 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects betting with maxBet < minBet", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      economy: {
        currency: "play",
        entryFee: 0,
        prizeDistribution: "winner-takes-all",
        betting: { enabled: true, minBet: 100, maxBet: 50 },
      },
    });
    expect(result.success).toBe(false);
  });

  // --- Role validation ---

  it("rejects role with empty systemPrompt", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      roles: [{ ...validPlaygroundDefinition.roles[0], systemPrompt: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects role with systemPrompt over 4000 chars", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      roles: [{ ...validPlaygroundDefinition.roles[0], systemPrompt: "x".repeat(4001) }],
    });
    expect(result.success).toBe(false);
  });

  // --- Phase validation ---

  it("accepts phase without duration (condition-based)", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      phases: [
        {
          name: "vote",
          description: "投票階段",
          allowedActions: ["vote"],
          transitionCondition: "allVoted",
          next: null,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts phase with next: null (terminal phase)", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      phases: [
        {
          name: "end",
          description: "結束",
          allowedActions: [],
          next: null,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  // --- Action validation ---

  it("accepts action with all optional fields", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      actions: [
        {
          name: "special",
          description: "Special action",
          params: { target: { type: "string" } },
          targetType: "role",
          phases: ["night"],
          roles: ["seer"],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects action with invalid targetType", () => {
    const result = playgroundDefinitionSchema.safeParse({
      ...validPlaygroundDefinition,
      actions: [
        {
          name: "bad",
          description: "Bad action",
          targetType: "team",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("createPlaygroundSchema", () => {
  it("accepts valid create playground request", () => {
    const result = createPlaygroundSchema.safeParse({
      definition: validPlaygroundDefinition,
    });
    expect(result.success).toBe(true);
  });

  it("accepts with isPublic flag", () => {
    const result = createPlaygroundSchema.safeParse({
      definition: validPlaygroundDefinition,
      isPublic: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing definition", () => {
    const result = createPlaygroundSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid definition", () => {
    const result = createPlaygroundSchema.safeParse({
      definition: { metadata: { name: "bad" } },
    });
    expect(result.success).toBe(false);
  });
});

describe("joinPlaygroundSchema", () => {
  it("accepts empty object (all optional)", () => {
    const result = joinPlaygroundSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts with agentId", () => {
    const result = joinPlaygroundSchema.safeParse({
      agentId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("accepts with controlMode", () => {
    const result = joinPlaygroundSchema.safeParse({
      controlMode: "agent",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid agentId (not UUID)", () => {
    const result = joinPlaygroundSchema.safeParse({ agentId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid controlMode", () => {
    const result = joinPlaygroundSchema.safeParse({ controlMode: "auto" });
    expect(result.success).toBe(false);
  });

  it("accepts all valid control modes", () => {
    for (const mode of ["agent", "human", "copilot"]) {
      expect(joinPlaygroundSchema.safeParse({ controlMode: mode }).success).toBe(true);
    }
  });
});

describe("playgroundActionSchema", () => {
  it("accepts valid action", () => {
    const result = playgroundActionSchema.safeParse({
      actionName: "vote",
      params: { target: "player-1" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts action without params", () => {
    const result = playgroundActionSchema.safeParse({ actionName: "pass" });
    expect(result.success).toBe(true);
  });

  it("rejects empty actionName", () => {
    const result = playgroundActionSchema.safeParse({ actionName: "" });
    expect(result.success).toBe(false);
  });
});

describe("playgroundWSClientEventSchema", () => {
  it("accepts pg_auth event", () => {
    const result = playgroundWSClientEventSchema.safeParse({
      type: "pg_auth",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("accepts pg_action event", () => {
    const result = playgroundWSClientEventSchema.safeParse({
      type: "pg_action",
      actionName: "vote",
      params: { target: "player-1" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts pg_action without params", () => {
    const result = playgroundWSClientEventSchema.safeParse({
      type: "pg_action",
      actionName: "pass",
    });
    expect(result.success).toBe(true);
  });

  it("accepts pg_chat event", () => {
    const result = playgroundWSClientEventSchema.safeParse({
      type: "pg_chat",
      content: "Hello everyone!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects pg_chat with empty content", () => {
    const result = playgroundWSClientEventSchema.safeParse({
      type: "pg_chat",
      content: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects pg_chat with content over 2000 chars", () => {
    const result = playgroundWSClientEventSchema.safeParse({
      type: "pg_chat",
      content: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it("accepts pg_control_mode event", () => {
    const result = playgroundWSClientEventSchema.safeParse({
      type: "pg_control_mode",
      mode: "agent",
    });
    expect(result.success).toBe(true);
  });

  it("rejects pg_control_mode with invalid mode", () => {
    const result = playgroundWSClientEventSchema.safeParse({
      type: "pg_control_mode",
      mode: "auto",
    });
    expect(result.success).toBe(false);
  });

  it("accepts ping event", () => {
    const result = playgroundWSClientEventSchema.safeParse({ type: "ping" });
    expect(result.success).toBe(true);
  });

  it("rejects unknown event type", () => {
    const result = playgroundWSClientEventSchema.safeParse({ type: "pg_unknown" });
    expect(result.success).toBe(false);
  });

  it("rejects pg_auth with invalid sessionId", () => {
    const result = playgroundWSClientEventSchema.safeParse({
      type: "pg_auth",
      sessionId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});
