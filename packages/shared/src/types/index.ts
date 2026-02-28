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
  secretToken: string | null;
  ownerId: string;
  isPublic: boolean;
  category: string | null;
  usageCount: number;
  systemPrompt: string | null;
  welcomeMessage: string | null;
  quickReplies: { label: string; message: string }[] | null;
  voiceCapable?: boolean;
  notificationsEnabled: boolean;
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
  mentionOnly: boolean;
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
export type MessageRole = "user" | "agent" | "system";

export type MessageStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "cancelled"
  | "error";

export interface ThreadSummary {
  replyCount: number;
  lastReplyAt: string;
  participants: string[];
  lastReplyPreview: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  seq: number;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  senderAgentId?: string;
  senderAgentName?: string;
  senderUserId?: string;
  senderUsername?: string;
  senderUserName?: string;
  senderUserImage?: string;
  replyToId?: string;
  replyTo?: {
    role: MessageRole;
    content: string;
    senderAgentName?: string;
  };
  threadId?: string;
  threadSummary?: ThreadSummary;
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
  duration?: number;
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

// ===== Spaces =====
export type SpaceCategory = "game" | "strategy" | "social" | "puzzle" | "roleplay" | "other";
export type SpaceSessionStatus = "waiting" | "active" | "paused" | "finished";
export type SpaceControlMode = "agent" | "human" | "copilot";

export interface Space {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  category: SpaceCategory;
  tags: string[];
  definition: Record<string, unknown>;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpaceSession {
  id: string;
  playgroundId: string;
  status: SpaceSessionStatus;
  state: Record<string, unknown>;
  currentPhase: string | null;
  prizePool: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  participantCount?: number;
}

export interface SpaceParticipant {
  id: string;
  sessionId: string;
  userId: string;
  agentId: string | null;
  role: string | null;
  controlMode: SpaceControlMode;
  isConnected: boolean;
  joinedAt: Date;
  userName?: string;
  agentName?: string;
}

// ===== App Manifest =====
export type AppCategory = "game" | "shopping" | "tool" | "social" | "other";
export type AgentInterfaceMode = "static" | "dynamic";
export type ControlMode = "agent" | "human" | "copilot";
export type HumanInputType = "direct" | "chat" | "both";
export type MonetizationModel = "free" | "paid" | "freemium" | "subscription";
export type AgeRating = "4+" | "9+" | "12+" | "17+";

export interface AppManifestViewport {
  minWidth: number;
  maxWidth: number;
  aspectRatio: string; // e.g. "1:1", "16:9", "flexible"
  orientation: "portrait" | "landscape" | "any";
}

export interface AppManifestUI {
  entry: string;
  viewport: AppManifestViewport;
}

export interface AppManifestPlatforms {
  web: boolean;
  ios: boolean;
  android: boolean;
}

export interface AppManifestPlayers {
  min: number;
  max: number;
}

export interface AppActionDefinition {
  name: string;
  description: string;
  params?: Record<string, unknown>; // JSON Schema object
  humanOnly?: boolean;
  agentOnly?: boolean;
}

export interface AppEventDefinition {
  name: string;
  description: string;
  payload?: Record<string, unknown>; // JSON Schema object
}

export interface AppRoleDefinition {
  prompt: string;
  state: Record<string, unknown>; // JSON Schema object
  actions: AppActionDefinition[];
  events?: AppEventDefinition[];
}

export interface AppSharedDefinition {
  events?: AppEventDefinition[];
  actions?: AppActionDefinition[];
}

export interface AppAgentInterface {
  mode: AgentInterfaceMode;
  description: string;
  maxStateSize?: number; // bytes, for dynamic mode
  maxActions?: number;   // for dynamic mode
}

export interface AppInteraction {
  controlModes: ControlMode[];
  defaultMode: ControlMode;
  humanInput: HumanInputType;
}

export interface AppMonetization {
  model: MonetizationModel;
  virtualGoods: boolean;
  externalPayments: boolean;
}

export interface AppRating {
  age: AgeRating;
  descriptors: string[];
}

export interface AppManifest {
  manifest_version: number;
  id: string;
  name: string;
  version: string;
  description: string;
  author: {
    name: string;
    url?: string;
  };
  category: AppCategory;
  tags: string[];
  icon: string;
  screenshots?: string[];
  sdkVersion?: string;

  ui: AppManifestUI;
  platforms: AppManifestPlatforms;
  players: AppManifestPlayers;

  roles: Record<string, AppRoleDefinition | AppSharedDefinition>;
  agentInterface: AppAgentInterface;
  interaction: AppInteraction;
  monetization: AppMonetization;
  rating: AppRating;

  permissions: string[];
  network?: {
    allowed: string[];
  };
}

// ===== App Entity =====
export type AppStatus = "draft" | "submitted" | "scanning" | "in_review" | "published" | "rejected" | "suspended";
export type AppVersionStatus = "submitted" | "scanning" | "in_review" | "published" | "rejected";

export interface MarketplaceApp {
  id: string;
  developerId: string;
  appId: string; // manifest id
  name: string;
  description: string;
  category: AppCategory;
  icon: string;
  status: AppStatus;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppVersion {
  id: string;
  appId: string;
  version: string;
  manifestJson: AppManifest;
  packagePath: string;
  status: AppVersionStatus;
  reviewNotes: string | null;
  createdAt: Date;
}

// ===== Developer Account =====
export interface DeveloperAccount {
  id: string;
  userId: string;
  displayName: string;
  contactEmail: string;
  payoutInfo: string | null;
  termsAcceptedAt: Date;
  createdAt: Date;
}

// ===== Arinova Coins =====
export type CoinTransactionType = "topup" | "purchase" | "refund" | "payout" | "earning";

export interface CoinBalance {
  userId: string;
  balance: number;
  updatedAt: Date;
}

export interface CoinTransaction {
  id: string;
  userId: string;
  type: CoinTransactionType;
  amount: number; // positive for credits, negative for debits
  relatedAppId: string | null;
  relatedProductId: string | null;
  receiptId: string | null;
  description: string | null;
  createdAt: Date;
}

export interface AppPurchase {
  id: string;
  userId: string;
  appVersionId: string;
  productId: string;
  amount: number;
  status: "completed" | "refunded";
  createdAt: Date;
}

// ===== WebSocket Events (User ↔ Backend) =====
export type WSClientEvent =
  | { type: "send_message"; conversationId: string; content: string; replyToId?: string; threadId?: string; mentions?: string[] }
  | { type: "cancel_stream"; conversationId: string; messageId: string }
  | { type: "cancel_queued"; conversationId: string; messageId: string }
  | { type: "sync"; conversations: Record<string, number> } // convId → lastSeq
  | { type: "mark_read"; conversationId: string; seq: number }
  | { type: "focus"; visible: boolean }
  | { type: "ping" };

export interface SyncConversationSummary {
  conversationId: string;
  unreadCount: number;
  maxSeq: number;
  muted: boolean;
  lastMessage: {
    content: string;
    role: MessageRole;
    status: MessageStatus;
    createdAt: string;
  } | null;
}

export interface SyncMissedMessage {
  id: string;
  conversationId: string;
  seq: number;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  createdAt: string;
}

export type WSServerEvent =
  | {
      type: "stream_start";
      conversationId: string;
      messageId: string;
      seq: number;
      senderAgentId?: string;
      senderAgentName?: string;
      threadId?: string;
    }
  | {
      type: "stream_chunk";
      conversationId: string;
      messageId: string;
      seq: number;
      chunk: string;
      threadId?: string;
    }
  | {
      type: "stream_end";
      conversationId: string;
      messageId: string;
      seq: number;
      content?: string;
      threadId?: string;
      reason?: string;
    }
  | {
      type: "stream_error";
      conversationId: string;
      messageId: string;
      seq: number;
      error: string;
      threadId?: string;
    }
  | {
      type: "sync_response";
      conversations: SyncConversationSummary[];
      missedMessages: SyncMissedMessage[];
    }
  | {
      type: "reaction_added";
      messageId: string;
      conversationId: string;
      emoji: string;
      userId: string;
    }
  | {
      type: "reaction_removed";
      messageId: string;
      conversationId: string;
      emoji: string;
      userId: string;
    }
  | {
      type: "new_message";
      conversationId: string;
      threadId?: string;
      message: {
        id: string;
        conversationId: string;
        seq: number;
        role: MessageRole;
        content: string;
        status: MessageStatus;
        senderUserId?: string;
        senderUserName?: string;
        senderUsername?: string;
        replyToId?: string | null;
        threadId?: string;
        createdAt: string;
        updatedAt: string;
      };
    }
  | {
      type: "stream_queued";
      conversationId: string;
      agentId: string;
      agentName: string;
      messageId?: string;
    }
  | {
      type: "queued_cancelled";
      conversationId: string;
      messageId: string;
    }
  | { type: "kicked_from_group"; conversationId: string }
  | { type: "pong" };

// ===== Agent Skill =====
export interface AgentSkill {
  id: string;
  name: string;
  description: string;
}

// ===== Agent WebSocket Events (Agent ↔ Backend) =====

/** Events sent from Agent → Backend */
export type AgentWSClientEvent =
  | { type: "agent_auth"; botToken: string; skills?: AgentSkill[] }
  | { type: "agent_chunk"; taskId: string; chunk: string }
  | { type: "agent_complete"; taskId: string; content: string }
  | { type: "agent_error"; taskId: string; error: string }
  | { type: "ping" };

/** Events sent from Backend → Agent */
export type AgentWSServerEvent =
  | { type: "auth_ok"; agentName: string }
  | { type: "auth_error"; error: string }
  | {
      type: "task";
      taskId: string;
      conversationId: string;
      content: string;
      conversationType?: ConversationType;
      members?: { agentId: string; agentName: string }[];
      replyTo?: { role: MessageRole; content: string; senderAgentName?: string };
      history?: { role: MessageRole; content: string; senderAgentName?: string; createdAt: string }[];
      attachments?: { id: string; fileName: string; fileType: string; fileSize: number; url: string }[];
    }
  | { type: "cancel_task"; taskId: string }
  | { type: "pong" };

// ===== Push Notifications =====

export type NotificationType =
  | "message"
  | "playground_invite"
  | "playground_turn"
  | "playground_result";

export interface PushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceInfo: string | null;
  createdAt: Date;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  globalEnabled: boolean;
  messageEnabled: boolean;
  playgroundInviteEnabled: boolean;
  playgroundTurnEnabled: boolean;
  playgroundResultEnabled: boolean;
  quietHoursStart: string | null; // HH:mm format
  quietHoursEnd: string | null;   // HH:mm format
}
