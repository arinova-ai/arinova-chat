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
  a2aEndpoint: z.string().url(),
});

export const updateAgentSchema = createAgentSchema.partial();

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

// ===== WebSocket =====
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
