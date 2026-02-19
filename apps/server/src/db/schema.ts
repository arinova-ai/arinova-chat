import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";

// ===== Better Auth tables =====

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ===== Business tables =====

export const conversationTypeEnum = pgEnum("conversation_type", [
  "direct",
  "group",
]);

export const messageRoleEnum = pgEnum("message_role", ["user", "agent"]);

export const messageStatusEnum = pgEnum("message_status", [
  "pending",
  "streaming",
  "completed",
  "cancelled",
  "error",
]);

export const agents = pgTable("agents", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 100 }).notNull(),
  description: text(),
  avatarUrl: text("avatar_url"),
  a2aEndpoint: text("a2a_endpoint"),
  secretToken: varchar("secret_token", { length: 64 }).unique(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id),
  isPublic: boolean("is_public").notNull().default(false),
  category: varchar("category", { length: 50 }),
  usageCount: integer("usage_count").notNull().default(0),
  systemPrompt: text("system_prompt"),
  welcomeMessage: text("welcome_message"),
  quickReplies: jsonb("quick_replies").$type<{ label: string; message: string }[]>(),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: uuid().primaryKey().defaultRandom(),
  title: varchar({ length: 200 }),
  type: conversationTypeEnum().notNull().default("direct"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  agentId: uuid("agent_id").references(() => agents.id),
  pinnedAt: timestamp("pinned_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversationMembers = pgTable("conversation_members", {
  id: uuid().primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid().primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  role: messageRoleEnum().notNull(),
  content: text().notNull().default(""),
  status: messageStatusEnum().notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conversationReads = pgTable("conversation_reads", {
  id: uuid().primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  lastReadSeq: integer("last_read_seq").notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ===== Community tables =====

export const communityRoleEnum = pgEnum("community_role", [
  "owner",
  "admin",
  "member",
]);

export const communities = pgTable("communities", {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 100 }).notNull(),
  description: text(),
  avatarUrl: text("avatar_url"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const channels = pgTable("channels", {
  id: uuid().primaryKey().defaultRandom(),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  name: varchar({ length: 100 }).notNull(),
  description: text(),
  agentId: uuid("agent_id").references(() => agents.id),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const communityMembers = pgTable("community_members", {
  id: uuid().primaryKey().defaultRandom(),
  communityId: uuid("community_id")
    .notNull()
    .references(() => communities.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  role: communityRoleEnum().notNull().default("member"),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const channelMessages = pgTable("channel_messages", {
  id: uuid().primaryKey().defaultRandom(),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id),
  role: messageRoleEnum().notNull(),
  content: text().notNull().default(""),
  status: messageStatusEnum().notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const attachments = pgTable("attachments", {
  id: uuid().primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileType: varchar("file_type", { length: 100 }).notNull(),
  fileSize: integer("file_size").notNull(),
  storagePath: text("storage_path").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ===== Marketplace tables =====

export const appStatusEnum = pgEnum("app_status", [
  "draft",
  "submitted",
  "scanning",
  "in_review",
  "published",
  "rejected",
  "suspended",
]);

export const appVersionStatusEnum = pgEnum("app_version_status", [
  "submitted",
  "scanning",
  "in_review",
  "published",
  "rejected",
]);

export const coinTransactionTypeEnum = pgEnum("coin_transaction_type", [
  "topup",
  "purchase",
  "refund",
  "payout",
  "earning",
]);

export const purchaseStatusEnum = pgEnum("purchase_status", [
  "completed",
  "refunded",
]);

export const developerAccounts = pgTable("developer_accounts", {
  id: uuid().primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  contactEmail: varchar("contact_email", { length: 255 }).notNull(),
  payoutInfo: text("payout_info"),
  termsAcceptedAt: timestamp("terms_accepted_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const apps = pgTable("apps", {
  id: uuid().primaryKey().defaultRandom(),
  developerId: uuid("developer_id")
    .notNull()
    .references(() => developerAccounts.id),
  appId: varchar("app_id", { length: 100 }).notNull().unique(),
  name: varchar({ length: 100 }).notNull(),
  description: text().notNull(),
  category: varchar({ length: 50 }).notNull(),
  icon: text().notNull(),
  status: appStatusEnum().notNull().default("draft"),
  currentVersionId: uuid("current_version_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const appVersions = pgTable("app_versions", {
  id: uuid().primaryKey().defaultRandom(),
  appId: uuid("app_id")
    .notNull()
    .references(() => apps.id, { onDelete: "cascade" }),
  version: varchar({ length: 50 }).notNull(),
  manifestJson: jsonb("manifest_json").notNull(),
  packagePath: text("package_path").notNull(),
  status: appVersionStatusEnum().notNull().default("submitted"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const coinBalances = pgTable("coin_balances", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id),
  balance: integer().notNull().default(0),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const coinTransactions = pgTable("coin_transactions", {
  id: uuid().primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  type: coinTransactionTypeEnum().notNull(),
  amount: integer().notNull(),
  relatedAppId: uuid("related_app_id").references(() => apps.id),
  relatedProductId: varchar("related_product_id", { length: 100 }),
  receiptId: varchar("receipt_id", { length: 255 }),
  description: text(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const appPurchases = pgTable("app_purchases", {
  id: uuid().primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  appVersionId: uuid("app_version_id")
    .notNull()
    .references(() => appVersions.id),
  productId: varchar("product_id", { length: 100 }).notNull(),
  amount: integer().notNull(),
  status: purchaseStatusEnum().notNull().default("completed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
