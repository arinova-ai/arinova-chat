import type { DmPolicy } from "openclaw/plugin-sdk";

export type { DmPolicy };

export type ArinovaChatAccountConfig = {
  name?: string;
  enabled?: boolean;
  /** Arinova backend URL (e.g., "http://localhost:3501"). */
  apiUrl?: string;
  /** Permanent bot token from Arinova UI (never expires, survives reinstalls). */
  botToken?: string;
  /** Bot account email for Better Auth sign-in. */
  email?: string;
  /** Bot account password for Better Auth sign-in. */
  password?: string;
  /** Pre-existing session token (skip sign-in). */
  sessionToken?: string;
  /** Arinova agent UUID that this plugin acts as. */
  agentId?: string;
  /** Direct message policy. Default: "open". */
  dmPolicy?: DmPolicy;
  /** Optional allowlist of user IDs. */
  allowFrom?: string[];
  /** Outbound text chunk limit. Default: 32000. */
  textChunkLimit?: number;
};

export type ArinovaChatConfig = {
  accounts?: Record<string, ArinovaChatAccountConfig>;
} & ArinovaChatAccountConfig;

export type CoreConfig = {
  channels?: {
    "openclaw-arinova-ai"?: ArinovaChatConfig;
  };
  [key: string]: unknown;
};

/** Parsed inbound message from A2A request. */
export type ArinovaChatInboundMessage = {
  /** JSON-RPC request id (also used as A2A task id). */
  taskId: string;
  /** User text content. */
  text: string;
  /** Timestamp of receipt. */
  timestamp: number;
  /** Conversation ID this message belongs to. */
  conversationId?: string;
  /** Conversation type: "direct" or "group". */
  conversationType?: string;
  /** Other agents in the conversation (for group chats). */
  members?: { agentId: string; agentName: string }[];
  /** The message being replied to, if this is a reply. */
  replyTo?: { role: string; content: string; senderAgentName?: string };
  /** Recent conversation history (up to 5 messages before the current one). */
  history?: { role: string; content: string; senderAgentName?: string; createdAt: string }[];
  /** Attachments from the user's message. */
  attachments?: { id: string; fileName: string; fileType: string; fileSize: number; url: string }[];
};

/** Result from sending a message via Arinova REST API. */
export type ArinovaChatSendResult = {
  messageId?: string;
};
