import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before imports
vi.mock("../auth.js", () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("../db/index.js", () => {
  const mockDb = {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue(undefined),
  };
  return { db: mockDb };
});

vi.mock("../db/schema.js", () => ({
  messages: {},
  conversations: {},
  agents: {},
  conversationReads: {},
}));

vi.mock("../db/redis.js", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("./agent-handler.js", () => ({
  isAgentConnected: vi.fn().mockReturnValue(false),
  sendTaskToAgent: vi.fn().mockReturnValue({ cancel: vi.fn() }),
}));

vi.mock("../lib/message-seq.js", () => ({
  getNextSeq: vi.fn().mockResolvedValue(1),
}));

vi.mock("../lib/pending-events.js", () => ({
  pushEvent: vi.fn().mockResolvedValue(undefined),
  getPendingEvents: vi.fn().mockResolvedValue([]),
  clearPendingEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/push.js", () => ({
  sendPushToUser: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/push-trigger.js", () => ({
  shouldSendPush: vi.fn().mockResolvedValue(false),
  isConversationMuted: vi.fn().mockResolvedValue(false),
}));

vi.mock("@arinova/shared/schemas", () => ({
  wsClientEventSchema: {
    parse: vi.fn((v) => v),
  },
}));

import {
  hasActiveStream,
  isUserOnline,
  isUserForeground,
  triggerAgentResponse,
} from "./handler.js";
import { db } from "../db/index.js";
import { isAgentConnected } from "./agent-handler.js";
import { getNextSeq } from "../lib/message-seq.js";

describe("WS Handler - exported utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("hasActiveStream", () => {
    it("returns false for unknown conversation", () => {
      expect(hasActiveStream("unknown-conv")).toBe(false);
    });
  });

  describe("isUserOnline", () => {
    it("returns false when no connections exist", () => {
      expect(isUserOnline("unknown-user")).toBe(false);
    });
  });

  describe("isUserForeground", () => {
    it("returns false when no connections exist", () => {
      expect(isUserForeground("unknown-user")).toBe(false);
    });
  });

  describe("triggerAgentResponse", () => {
    const USER_ID = "user-1";
    const CONV_ID = "conv-1";
    const AGENT_ID = "agent-1";

    it("does nothing when conversation not found", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([]);

      await triggerAgentResponse(USER_ID, CONV_ID, "Hello");

      // No message insert should happen
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("does nothing when conversation has no agentId", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([{ id: CONV_ID, agentId: null }]);

      await triggerAgentResponse(USER_ID, CONV_ID, "Hello");

      expect(db.insert).not.toHaveBeenCalled();
    });

    it("saves user message and sends error when agent is not connected", async () => {
      // First query: get conversation with agentId
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValueOnce([{ id: CONV_ID, agentId: AGENT_ID }]);

      // User message insert
      vi.mocked(db.insert).mockReturnValue(db as any);
      vi.mocked(db.values).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([{ id: "msg-1" }]);

      // Update conversation timestamp
      vi.mocked(db.update).mockReturnValue(db as any);
      vi.mocked(db.set).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue(undefined);

      // Agent lookup for error message
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([{ name: "TestBot" }]);

      vi.mocked(isAgentConnected).mockReturnValue(false);
      vi.mocked(getNextSeq).mockResolvedValue(1);

      await triggerAgentResponse(USER_ID, CONV_ID, "Hello");

      // Should have called insert for user message
      expect(db.insert).toHaveBeenCalled();
    });

    it("skips user message when skipUserMessage option is set", async () => {
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValueOnce([{ id: CONV_ID, agentId: AGENT_ID }]);

      vi.mocked(isAgentConnected).mockReturnValue(false);
      vi.mocked(getNextSeq).mockResolvedValue(1);

      // Agent lookup
      vi.mocked(db.select).mockReturnValue(db as any);
      vi.mocked(db.from).mockReturnValue(db as any);
      vi.mocked(db.where).mockResolvedValue([{ name: "TestBot" }]);

      vi.mocked(db.insert).mockReturnValue(db as any);
      vi.mocked(db.values).mockReturnValue(db as any);
      vi.mocked(db.returning).mockResolvedValue([{ id: "msg-err" }]);
      vi.mocked(db.update).mockReturnValue(db as any);
      vi.mocked(db.set).mockReturnValue(db as any);

      await triggerAgentResponse(USER_ID, CONV_ID, "Hello", { skipUserMessage: true });

      // getNextSeq should be called for the error message but NOT for user message
      // (the first insert should be the error message, not user message)
      expect(getNextSeq).toHaveBeenCalled();
    });
  });
});
