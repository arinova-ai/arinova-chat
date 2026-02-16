// ===== User (aligned with Better Auth) =====
export interface User {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===== Agent =====
export interface Agent {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  a2aEndpoint: string | null;
  pairingCode: string | null;
  ownerId: string;
  isPublic: boolean;
  category: string | null;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ===== Conversation =====
export type ConversationType = "direct" | "group";

export interface Conversation {
  id: string;
  title: string | null;
  type: ConversationType;
  userId: string;
  agentId: string | null;
  pinnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===== Conversation Member =====
export interface ConversationMember {
  id: string;
  conversationId: string;
  agentId: string;
  addedAt: Date;
}

// ===== Message =====
export type MessageRole = "user" | "agent";

export type MessageStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "cancelled"
  | "error";

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  attachments?: Attachment[];
  createdAt: Date;
  updatedAt: Date;
}

// ===== Attachment =====
export interface Attachment {
  id: string;
  messageId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  url: string;
  createdAt: Date;
}

// ===== Community =====
export type CommunityRole = "owner" | "admin" | "member";

export interface Community {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  ownerId: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Channel {
  id: string;
  communityId: string;
  name: string;
  description: string | null;
  agentId: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommunityMember {
  id: string;
  communityId: string;
  userId: string;
  role: CommunityRole;
  joinedAt: Date;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  userId: string | null;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ===== WebSocket Events =====
export type WSClientEvent =
  | { type: "send_message"; conversationId: string; content: string }
  | { type: "cancel_stream"; conversationId: string; messageId: string }
  | { type: "ping" };

export type WSServerEvent =
  | {
      type: "stream_start";
      conversationId: string;
      messageId: string;
    }
  | {
      type: "stream_chunk";
      conversationId: string;
      messageId: string;
      chunk: string;
    }
  | {
      type: "stream_end";
      conversationId: string;
      messageId: string;
    }
  | {
      type: "stream_error";
      conversationId: string;
      messageId: string;
      error: string;
    }
  | { type: "pong" };
