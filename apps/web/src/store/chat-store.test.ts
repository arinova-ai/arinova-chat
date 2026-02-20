import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChatStore } from "./chat-store";
import type { Message } from "@arinova/shared/types";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  ApiError: class extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/ws", () => ({
  wsManager: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    onStatusChange: vi.fn(() => vi.fn()),
    isConnected: vi.fn(() => false),
    updateLastSeq: vi.fn(),
    setupVisibilityListeners: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Pull in the mocked api so individual tests can configure its resolved value.
import { api } from "@/lib/api";
const mockedApi = api as ReturnType<typeof vi.fn>;

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    conversationId: "conv-1",
    seq: 1,
    role: "agent",
    content: "Hello",
    status: "completed",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const INITIAL_STATE = {
  agents: [],
  conversations: [],
  messagesByConversation: {},
  activeConversationId: null,
  sidebarOpen: false,
  searchQuery: "",
  searchResults: [],
  searchTotal: 0,
  searchLoading: false,
  searchActive: false,
  highlightMessageId: null,
  loading: false,
  unreadCounts: {},
  agentHealth: {},
  agentSkills: {},
  showTimestamps: false,
  mutedConversations: {},
  ttsEnabled: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useChatStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState(INITIAL_STATE);
  });

  // -------------------------------------------------------------------------
  // sendMessage — optimistic insert
  // -------------------------------------------------------------------------
  describe("sendMessage", () => {
    it("optimistically inserts a temp user message into messagesByConversation", () => {
      useChatStore.setState({ activeConversationId: "conv-1" });

      useChatStore.getState().sendMessage("hello");

      const messages =
        useChatStore.getState().messagesByConversation["conv-1"];
      expect(messages).toBeDefined();
      expect(messages).toHaveLength(1);

      const [msg] = messages;
      expect(msg.id).toMatch(/^temp-/);
      expect(msg.role).toBe("user");
      expect(msg.content).toBe("hello");
      expect(msg.conversationId).toBe("conv-1");
    });

    it("does nothing when there is no active conversation", () => {
      // activeConversationId is null by default
      useChatStore.getState().sendMessage("ignored");

      expect(
        Object.keys(useChatStore.getState().messagesByConversation)
      ).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // setActiveConversation — clears unreads
  // -------------------------------------------------------------------------
  describe("setActiveConversation", () => {
    it("clears the unread count for the activated conversation", async () => {
      // Pre-seed unread counts
      useChatStore.setState({ unreadCounts: { "conv-1": 5, "conv-2": 3 } });

      // Mock loadMessages (called internally by setActiveConversation)
      mockedApi.mockResolvedValue({ messages: [], hasMore: false });

      await useChatStore.getState().setActiveConversation("conv-1");

      const { unreadCounts } = useChatStore.getState();
      expect(unreadCounts["conv-1"]).toBe(0);
      // Other counts remain untouched
      expect(unreadCounts["conv-2"]).toBe(3);
    });

    it("sets activeConversationId to null without any API call when given null", () => {
      useChatStore.setState({ activeConversationId: "conv-1" });

      useChatStore.getState().setActiveConversation(null);

      expect(useChatStore.getState().activeConversationId).toBeNull();
      expect(mockedApi).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // handleWSEvent — stream_chunk
  // -------------------------------------------------------------------------
  describe("handleWSEvent — stream_chunk", () => {
    it("appends delta to message content when a stream_chunk event arrives", () => {
      const streamingMsg = makeMessage({
        id: "msg-stream",
        conversationId: "conv-1",
        status: "streaming",
        content: "Hel",
      });
      useChatStore.setState({
        messagesByConversation: { "conv-1": [streamingMsg] },
      });

      useChatStore.getState().handleWSEvent({
        type: "stream_chunk",
        conversationId: "conv-1",
        messageId: "msg-stream",
        seq: 2,
        chunk: "lo world",
      });

      const messages = useChatStore.getState().messagesByConversation["conv-1"];
      const updated = messages.find((m) => m.id === "msg-stream");
      expect(updated?.content).toBe("Hello world");
    });

    it("leaves other messages unchanged when processing stream_chunk", () => {
      const otherMsg = makeMessage({ id: "msg-other", content: "Other" });
      const streamingMsg = makeMessage({
        id: "msg-stream",
        conversationId: "conv-1",
        status: "streaming",
        content: "",
      });
      useChatStore.setState({
        messagesByConversation: { "conv-1": [otherMsg, streamingMsg] },
      });

      useChatStore.getState().handleWSEvent({
        type: "stream_chunk",
        conversationId: "conv-1",
        messageId: "msg-stream",
        seq: 2,
        chunk: "Partial text",
      });

      const messages = useChatStore.getState().messagesByConversation["conv-1"];
      expect(messages.find((m) => m.id === "msg-other")?.content).toBe("Other");
    });
  });

  // -------------------------------------------------------------------------
  // handleWSEvent — stream_end
  // -------------------------------------------------------------------------
  describe("handleWSEvent — stream_end", () => {
    it("marks the streaming message as completed on stream_end", () => {
      const streamingMsg = makeMessage({
        id: "msg-stream",
        conversationId: "conv-1",
        status: "streaming",
        content: "Full response",
      });
      useChatStore.setState({
        messagesByConversation: { "conv-1": [streamingMsg] },
      });

      useChatStore.getState().handleWSEvent({
        type: "stream_end",
        conversationId: "conv-1",
        messageId: "msg-stream",
        seq: 5,
      });

      const messages = useChatStore.getState().messagesByConversation["conv-1"];
      const completed = messages.find((m) => m.id === "msg-stream");
      expect(completed?.status).toBe("completed");
    });

    it("increments unread count for a non-active conversation on stream_end", () => {
      useChatStore.setState({
        activeConversationId: "conv-2",
        unreadCounts: { "conv-1": 1 },
        messagesByConversation: {
          "conv-1": [
            makeMessage({
              id: "msg-1",
              conversationId: "conv-1",
              status: "streaming",
            }),
          ],
        },
      });

      useChatStore.getState().handleWSEvent({
        type: "stream_end",
        conversationId: "conv-1",
        messageId: "msg-1",
        seq: 3,
      });

      expect(useChatStore.getState().unreadCounts["conv-1"]).toBe(2);
    });

    it("does NOT increment unread count for the active conversation on stream_end", () => {
      useChatStore.setState({
        activeConversationId: "conv-1",
        unreadCounts: { "conv-1": 0 },
        messagesByConversation: {
          "conv-1": [
            makeMessage({
              id: "msg-1",
              conversationId: "conv-1",
              status: "streaming",
            }),
          ],
        },
      });

      useChatStore.getState().handleWSEvent({
        type: "stream_end",
        conversationId: "conv-1",
        messageId: "msg-1",
        seq: 3,
      });

      expect(useChatStore.getState().unreadCounts["conv-1"]).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // deleteConversation — nulls active
  // -------------------------------------------------------------------------
  describe("deleteConversation", () => {
    it("sets activeConversationId to null when the active conversation is deleted", async () => {
      useChatStore.setState({
        activeConversationId: "conv-1",
        messagesByConversation: {
          "conv-1": [makeMessage({ conversationId: "conv-1" })],
        },
      });
      // Mock the DELETE api call
      mockedApi.mockResolvedValue(undefined);

      await useChatStore.getState().deleteConversation("conv-1");

      expect(useChatStore.getState().activeConversationId).toBeNull();
    });

    it("removes the conversation's messages from the store after deletion", async () => {
      useChatStore.setState({
        activeConversationId: "conv-1",
        messagesByConversation: {
          "conv-1": [makeMessage({ conversationId: "conv-1" })],
          "conv-2": [makeMessage({ id: "msg-2", conversationId: "conv-2" })],
        },
      });
      mockedApi.mockResolvedValue(undefined);

      await useChatStore.getState().deleteConversation("conv-1");

      const { messagesByConversation } = useChatStore.getState();
      expect(messagesByConversation["conv-1"]).toBeUndefined();
      // Other conversations' messages are preserved
      expect(messagesByConversation["conv-2"]).toHaveLength(1);
    });

    it("preserves activeConversationId when a different conversation is deleted", async () => {
      useChatStore.setState({
        activeConversationId: "conv-2",
        messagesByConversation: {
          "conv-1": [],
          "conv-2": [],
        },
      });
      mockedApi.mockResolvedValue(undefined);

      await useChatStore.getState().deleteConversation("conv-1");

      expect(useChatStore.getState().activeConversationId).toBe("conv-2");
    });
  });

  // -------------------------------------------------------------------------
  // toggleTimestamps
  // -------------------------------------------------------------------------
  describe("toggleTimestamps", () => {
    it("flips showTimestamps from false to true", () => {
      useChatStore.setState({ showTimestamps: false });

      useChatStore.getState().toggleTimestamps();

      expect(useChatStore.getState().showTimestamps).toBe(true);
    });

    it("flips showTimestamps from true to false", () => {
      useChatStore.setState({ showTimestamps: true });

      useChatStore.getState().toggleTimestamps();

      expect(useChatStore.getState().showTimestamps).toBe(false);
    });

    it("persists the new value to localStorage", () => {
      const setItem = vi.spyOn(localStorage, "setItem");
      useChatStore.setState({ showTimestamps: false });

      useChatStore.getState().toggleTimestamps();

      expect(setItem).toHaveBeenCalledWith("arinova_timestamps", "true");
    });

    it("persists false to localStorage when toggling off", () => {
      const setItem = vi.spyOn(localStorage, "setItem");
      useChatStore.setState({ showTimestamps: true });

      useChatStore.getState().toggleTimestamps();

      expect(setItem).toHaveBeenCalledWith("arinova_timestamps", "false");
    });
  });
});
