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

// ===== Playground =====
export type PlaygroundCategory = "game" | "strategy" | "social" | "puzzle" | "roleplay" | "other";
export type PlaygroundSessionStatus = "waiting" | "active" | "paused" | "finished";
export type PlaygroundCurrency = "free" | "play" | "arinova";
export type PlaygroundPrizeDistribution = "winner-takes-all" | Record<string, number>; // e.g. { first: 60, second: 30, third: 10 }
export type PlaygroundParticipantControlMode = "agent" | "human" | "copilot";
export type PlaygroundMessageType = "chat" | "action" | "system" | "phase_transition";

export interface PlaygroundActionDefinition {
  name: string;
  description: string;
  params?: Record<string, unknown>; // JSON Schema
  targetType?: "player" | "role" | "global";
  phases?: string[]; // restrict to specific phases
  roles?: string[]; // restrict to specific roles
}

export interface PlaygroundPhaseDefinition {
  name: string;
  description: string;
  duration?: number; // seconds, optional for condition-based
  allowedActions: string[];
  transitionCondition?: string; // expression evaluated against state
  next: string | null; // next phase name, null = end
}

export interface PlaygroundRoleDefinition {
  name: string;
  description: string;
  visibleState: string[]; // state keys visible to this role
  availableActions: string[];
  systemPrompt: string;
  minCount?: number;
  maxCount?: number;
}

export interface PlaygroundWinCondition {
  role: string; // winning role
  condition: string; // expression evaluated against state
  description: string;
}

export interface PlaygroundBettingConfig {
  enabled: boolean;
  minBet: number;
  maxBet: number;
}

export interface PlaygroundEconomy {
  currency: PlaygroundCurrency;
  entryFee: number;
  prizeDistribution: PlaygroundPrizeDistribution;
  betting?: PlaygroundBettingConfig;
}

export interface PlaygroundDefinition {
  metadata: {
    name: string;
    description: string;
    category: PlaygroundCategory;
    minPlayers: number;
    maxPlayers: number;
    tags?: string[];
    thumbnailDescription?: string;
  };
  roles: PlaygroundRoleDefinition[];
  phases: PlaygroundPhaseDefinition[];
  actions: PlaygroundActionDefinition[];
  winConditions: PlaygroundWinCondition[];
  economy: PlaygroundEconomy;
  initialState: Record<string, unknown>;
  maxStateSize?: number; // bytes, default 1MB
}

export interface Playground {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  category: PlaygroundCategory;
  tags: string[];
  definition: PlaygroundDefinition;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaygroundSession {
  id: string;
  playgroundId: string;
  status: PlaygroundSessionStatus;
  state: Record<string, unknown>;
  currentPhase: string | null;
  prizePool: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface PlaygroundParticipant {
  id: string;
  sessionId: string;
  userId: string;
  agentId: string | null;
  role: string | null; // assigned on session start
  controlMode: PlaygroundParticipantControlMode;
  isConnected: boolean;
  joinedAt: Date;
}

export interface PlaygroundMessage {
  id: string;
  sessionId: string;
  participantId: string | null;
  type: PlaygroundMessageType;
  content: string;
  createdAt: Date;
}

export type PlaygroundTransactionType = "entry_fee" | "bet" | "win" | "refund" | "commission";

export interface PlayCoinBalance {
  userId: string;
  balance: number;
  lastGrantedAt: Date | null;
}

export interface PlaygroundTransaction {
  id: string;
  userId: string;
  sessionId: string | null;
  type: PlaygroundTransactionType;
  currency: PlaygroundCurrency;
  amount: number;
  createdAt: Date;
}

// ===== Playground WebSocket Events =====

/** Events sent from Client → Server */
export type PlaygroundWSClientEvent =
  | { type: "pg_auth"; sessionId: string }
  | { type: "pg_action"; actionName: string; params?: Record<string, unknown> }
  | { type: "pg_chat"; content: string }
  | { type: "pg_control_mode"; mode: PlaygroundParticipantControlMode }
  | { type: "ping" };

/** Events sent from Server → Client */
export type PlaygroundWSServerEvent =
  | { type: "pg_auth_ok"; sessionId: string; participantId: string }
  | { type: "pg_auth_error"; error: string }
  | { type: "pg_state_update"; state: Record<string, unknown>; currentPhase: string | null }
  | { type: "pg_action_result"; success: boolean; error?: string }
  | { type: "pg_phase_transition"; from: string; to: string }
  | { type: "pg_participant_joined"; participant: PlaygroundParticipant }
  | { type: "pg_participant_left"; participantId: string }
  | { type: "pg_session_started"; roles: Record<string, string>; phase: string }
  | { type: "pg_session_finished"; winners: string[]; prizeDistribution: Record<string, number> }
  | { type: "pg_chat"; participantId: string; content: string }
  | { type: "pg_error"; error: string }
  | { type: "pong" };

// ===== WebSocket Events (User ↔ Backend) =====
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

// ===== Agent WebSocket Events (Agent ↔ Backend) =====

/** Events sent from Agent → Backend */
export type AgentWSClientEvent =
  | { type: "agent_auth"; agentId: string; secretToken: string }
  | { type: "agent_chunk"; taskId: string; chunk: string }
  | { type: "agent_complete"; taskId: string; content: string }
  | { type: "agent_error"; taskId: string; error: string }
  | { type: "ping" };

/** Events sent from Backend → Agent */
export type AgentWSServerEvent =
  | { type: "auth_ok"; agentName: string }
  | { type: "auth_error"; error: string }
  | { type: "task"; taskId: string; conversationId: string; content: string }
  | { type: "pong" };
