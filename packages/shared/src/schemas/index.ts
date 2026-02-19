import { z } from "zod";

// ===== Auth =====
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ===== Agent =====
export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  a2aEndpoint: z.string().url().optional(),
});

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  a2aEndpoint: z.string().url().optional().nullable(),
  avatarUrl: z.string().optional().nullable(),
  systemPrompt: z.string().max(4000).optional().nullable(),
  welcomeMessage: z.string().max(1000).optional().nullable(),
  quickReplies: z.array(z.object({
    label: z.string().min(1).max(50),
    message: z.string().min(1).max(500),
  })).max(10).optional().nullable(),
  voiceCapable: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  category: z.string().max(50).optional().nullable(),
});

// ===== Conversation =====
export const createConversationSchema = z.object({
  agentId: z.string().uuid(),
  title: z.string().max(200).optional(),
});

// ===== Group Conversation =====
export const createGroupConversationSchema = z.object({
  title: z.string().min(1).max(200),
  agentIds: z.array(z.string().uuid()).min(1),
});

export const addGroupMemberSchema = z.object({
  agentId: z.string().uuid(),
});

// ===== Community =====
export const createCommunitySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
});

export const updateCommunitySchema = createCommunitySchema.partial();

export const createChannelSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  agentId: z.string().uuid().optional(),
});

export const updateChannelSchema = createChannelSchema.partial();

// ===== Message =====
export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(32000),
});

// ===== Pairing (bot token only) =====
export const pairingExchangeSchema = z.object({
  botToken: z.string().min(1),
  a2aEndpoint: z.string().url().optional(),
});

// ===== App Manifest =====
const appCategorySchema = z.enum(["game", "shopping", "tool", "social", "other"]);
const agentInterfaceModeSchema = z.enum(["static", "dynamic"]);
const controlModeSchema = z.enum(["agent", "human", "copilot"]);
const humanInputTypeSchema = z.enum(["direct", "chat", "both"]);
const monetizationModelSchema = z.enum(["free", "paid", "freemium", "subscription"]);
const ageRatingSchema = z.enum(["4+", "9+", "12+", "17+"]);

const actionDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  params: z.record(z.unknown()).optional(),
  humanOnly: z.boolean().optional(),
  agentOnly: z.boolean().optional(),
});

const eventDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
});

const roleDefinitionSchema = z.object({
  prompt: z.string().min(1),
  state: z.record(z.unknown()),
  actions: z.array(actionDefinitionSchema),
  events: z.array(eventDefinitionSchema).optional(),
});

const sharedDefinitionSchema = z.object({
  events: z.array(eventDefinitionSchema).optional(),
  actions: z.array(actionDefinitionSchema).optional(),
});

export const appManifestSchema = z.object({
  manifest_version: z.number().int().positive(),
  id: z.string().min(1).max(100).regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Must be kebab-case"),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Must be semver (e.g. 1.0.0)"),
  description: z.string().min(1).max(1000),
  author: z.object({
    name: z.string().min(1),
    url: z.string().url().optional(),
  }),
  category: appCategorySchema,
  tags: z.array(z.string().min(1).max(50)).max(10),
  icon: z.string().min(1),
  screenshots: z.array(z.string()).max(5).optional(),
  sdkVersion: z.string().optional(),

  ui: z.object({
    entry: z.string().min(1),
    viewport: z.object({
      minWidth: z.number().int().positive(),
      maxWidth: z.number().int().positive(),
      aspectRatio: z.string().min(1),
      orientation: z.enum(["portrait", "landscape", "any"]),
    }),
  }),

  platforms: z.object({
    web: z.boolean(),
    ios: z.boolean(),
    android: z.boolean(),
  }).refine((p) => p.web || p.ios || p.android, "At least one platform must be true"),

  players: z.object({
    min: z.number().int().min(1),
    max: z.number().int().min(1),
  }).refine((p) => p.max >= p.min, "max must be >= min"),

  roles: z.record(z.union([roleDefinitionSchema, sharedDefinitionSchema])),

  agentInterface: z.object({
    mode: agentInterfaceModeSchema,
    description: z.string().min(1),
    maxStateSize: z.number().int().positive().optional(),
    maxActions: z.number().int().positive().optional(),
  }),

  interaction: z.object({
    controlModes: z.array(controlModeSchema).min(1),
    defaultMode: controlModeSchema,
    humanInput: humanInputTypeSchema,
  }),

  monetization: z.object({
    model: monetizationModelSchema,
    virtualGoods: z.boolean(),
    externalPayments: z.boolean(),
  }),

  rating: z.object({
    age: ageRatingSchema,
    descriptors: z.array(z.string()),
  }),

  permissions: z.array(z.enum(["storage", "network", "audio"])),

  network: z.object({
    allowed: z.array(z.string().min(1)),
  }).optional(),
}).refine(
  (m) => !m.permissions.includes("network") || (m.network && m.network.allowed.length > 0),
  "network.allowed is required when 'network' permission is declared"
).refine(
  (m) => m.agentInterface.mode !== "dynamic" || (m.agentInterface.maxStateSize !== undefined && m.agentInterface.maxActions !== undefined),
  "maxStateSize and maxActions are required for dynamic mode"
);

// ===== Platform App =====
export const createPlatformAppSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  category: z.enum(["game", "strategy", "social", "puzzle", "tool", "other"]),
  externalUrl: z.string().url(),
  iconUrl: z.string().url().optional(),
});

export const updatePlatformAppSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(1000).optional(),
  category: z.enum(["game", "strategy", "social", "puzzle", "tool", "other"]).optional(),
  externalUrl: z.string().url().optional(),
  iconUrl: z.string().url().optional().nullable(),
});

export const agentChatRequestSchema = z.object({
  agentId: z.string().uuid(),
  prompt: z.string().min(1).max(32000),
  systemPrompt: z.string().max(4000).optional(),
});

export const economyChargeSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().positive(),
  description: z.string().max(500).optional(),
});

export const economyAwardSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().positive(),
  description: z.string().max(500).optional(),
});

// ===== Spaces =====
export const createSpaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  category: z.enum(["game", "strategy", "social", "puzzle", "roleplay", "other"]),
  tags: z.array(z.string().max(50)).max(10).optional(),
  definition: z.record(z.unknown()).optional(),
  isPublic: z.boolean().optional(),
});

export const joinSpaceSessionSchema = z.object({
  agentId: z.string().uuid().optional(),
  role: z.string().max(100).optional(),
  controlMode: z.enum(["agent", "human", "copilot"]).optional(),
});

// ===== WebSocket (User ↔ Backend) =====
export const wsClientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("send_message"),
    conversationId: z.string().uuid(),
    content: z.string().min(1).max(32000),
  }),
  z.object({
    type: z.literal("cancel_stream"),
    conversationId: z.string().uuid(),
    messageId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("ping"),
  }),
]);

// ===== Agent WebSocket (Agent → Backend) =====
export const agentWSClientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("agent_auth"),
    agentId: z.string().uuid(),
    secretToken: z.string().min(1),
  }),
  z.object({
    type: z.literal("agent_chunk"),
    taskId: z.string(),
    chunk: z.string(),
  }),
  z.object({
    type: z.literal("agent_complete"),
    taskId: z.string(),
    content: z.string(),
  }),
  z.object({
    type: z.literal("agent_error"),
    taskId: z.string(),
    error: z.string(),
  }),
  z.object({
    type: z.literal("voice_call_end"),
    sessionId: z.string().uuid(),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("ping"),
  }),
]);

// ===== Voice Call =====
const voiceAudioFormatSchema = z.enum(["opus", "pcm-16-16k-mono"]);

export const voiceWSClientEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("voice_auth"),
    conversationId: z.string().uuid(),
    agentId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("voice_offer"),
    sessionId: z.string().uuid(),
    sdp: z.string().min(1),
  }),
  z.object({
    type: z.literal("voice_answer"),
    sessionId: z.string().uuid(),
    sdp: z.string().min(1),
  }),
  z.object({
    type: z.literal("voice_ice_candidate"),
    sessionId: z.string().uuid(),
    candidate: z.string(),
    sdpMid: z.string().nullable(),
    sdpMLineIndex: z.number().int().nullable(),
  }),
  z.object({
    type: z.literal("voice_hangup"),
    sessionId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("ping"),
  }),
]);

export const voiceCallStartSchema = z.object({
  sessionId: z.string().uuid(),
  conversationId: z.string().uuid(),
  audioFormat: voiceAudioFormatSchema,
});

export const voiceCallEndSchema = z.object({
  sessionId: z.string().uuid(),
  reason: z.string(),
});

// ===== Push Notifications =====

export const notificationTypeSchema = z.enum([
  "message",
  "playground_invite",
  "playground_turn",
  "playground_result",
]);

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  deviceInfo: z.string().max(500).optional(),
});

export const notificationPreferenceSchema = z.object({
  globalEnabled: z.boolean(),
  messageEnabled: z.boolean(),
  playgroundInviteEnabled: z.boolean(),
  playgroundTurnEnabled: z.boolean(),
  playgroundResultEnabled: z.boolean(),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:mm format")
    .nullable(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Must be HH:mm format")
    .nullable(),
});
