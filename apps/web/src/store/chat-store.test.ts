import { describe, it, expect, vi, beforeEach } from "vitest";
import { useChatStore } from "./chat-store";

// Mock api and wsManager
vi.mock("@/lib/api", () => ({
  api: vi.fn().mockResolvedValue({ messages: [], hasMore: false }),
}));

vi.mock("@/lib/ws", () => ({
  wsManager: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    isConnected: vi.fn(() => false),
  },
}));

function resetStore() {
  useChatStore.setState({
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
  });
}

describe("chat-store", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  // --------------------------------------------------
  // setActiveConversation
  // --------------------------------------------------

  describe("setActiveConversation", () => {
    it("sets activeConversationId", () => {
      useChatStore.getState().setActiveConversation("conv-1");
      expect(useChatStore.getState().activeConversationId).toBe("conv-1");
    });

    it("clears unread count for conversation", () => {
      useChatStore.setState({ unreadCounts: { "conv-1": 5 } });
      useChatStore.getState().setActiveConversation("conv-1");
      expect(useChatStore.getState().unreadCounts["conv-1"]).toBe(0);
    });

    it("closes sidebar on mobile", () => {
      useChatStore.setState({ sidebarOpen: true });
      useChatStore.getState().setActiveConversation("conv-1");
      expect(useChatStore.getState().sidebarOpen).toBe(false);
    });

    it("clears search active state", () => {
      useChatStore.setState({ searchActive: true });
      useChatStore.getState().setActiveConversation("conv-1");
      expect(useChatStore.getState().searchActive).toBe(false);
    });

    it("sets null to deactivate", () => {
      useChatStore.setState({ activeConversationId: "conv-1" });
      useChatStore.getState().setActiveConversation(null);
      expect(useChatStore.getState().activeConversationId).toBeNull();
    });
  });

  // --------------------------------------------------
  // sendMessage (optimistic update + WS send)
  // --------------------------------------------------

  describe("sendMessage", () => {
    it("adds optimistic user message to store", async () => {
      const { wsManager } = await import("@/lib/ws");
      useChatStore.setState({
        activeConversationId: "conv-1",
        messagesByConversation: { "conv-1": [] },
      });

      useChatStore.getState().sendMessage("Hello!");
      const msgs = useChatStore.getState().messagesByConversation["conv-1"];
      expect(msgs).toHaveLength(1);
      expect(msgs[0].role).toBe("user");
      expect(msgs[0].content).toBe("Hello!");
      expect(msgs[0].id).toMatch(/^temp-/);
      expect(wsManager.send).toHaveBeenCalledWith({
        type: "send_message",
        conversationId: "conv-1",
        content: "Hello!",
      });
    });

    it("does nothing without active conversation", async () => {
      const { wsManager } = await import("@/lib/ws");
      useChatStore.getState().sendMessage("Hello!");
      expect(wsManager.send).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------
  // cancelStream
  // --------------------------------------------------

  describe("cancelStream", () => {
    it("marks streaming message as cancelled", async () => {
      const { wsManager } = await import("@/lib/ws");
      useChatStore.setState({
        activeConversationId: "conv-1",
        messagesByConversation: {
          "conv-1": [
            {
              id: "msg-1",
              conversationId: "conv-1",
              role: "agent",
              content: "partial...",
              status: "streaming",
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
        },
      });

      useChatStore.getState().cancelStream();
      const msgs = useChatStore.getState().messagesByConversation["conv-1"];
      expect(msgs[0].status).toBe("cancelled");
      expect(wsManager.send).toHaveBeenCalledWith(
        expect.objectContaining({ type: "cancel_stream", messageId: "msg-1" })
      );
    });
  });

  // --------------------------------------------------
  // deleteConversation
  // --------------------------------------------------

  describe("deleteConversation", () => {
    it("removes conversation from state", async () => {
      const { api } = await import("@/lib/api");
      (api as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      useChatStore.setState({
        activeConversationId: "conv-1",
        conversations: [{ id: "conv-1" } as never],
        messagesByConversation: { "conv-1": [] },
      });

      await useChatStore.getState().deleteConversation("conv-1");
      expect(useChatStore.getState().conversations).toHaveLength(0);
      expect(useChatStore.getState().activeConversationId).toBeNull();
      expect(useChatStore.getState().messagesByConversation["conv-1"]).toBeUndefined();
    });
  });

  // --------------------------------------------------
  // deleteMessage
  // --------------------------------------------------

  describe("deleteMessage", () => {
    it("removes message from conversation", async () => {
      const { api } = await import("@/lib/api");
      (api as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      useChatStore.setState({
        messagesByConversation: {
          "conv-1": [
            { id: "msg-1", conversationId: "conv-1", role: "user", content: "Hi", status: "completed", createdAt: new Date(), updatedAt: new Date() },
            { id: "msg-2", conversationId: "conv-1", role: "agent", content: "Hey", status: "completed", createdAt: new Date(), updatedAt: new Date() },
          ],
        },
      });

      await useChatStore.getState().deleteMessage("conv-1", "msg-1");
      const msgs = useChatStore.getState().messagesByConversation["conv-1"];
      expect(msgs).toHaveLength(1);
      expect(msgs[0].id).toBe("msg-2");
    });

    it("skips API call for temp messages", async () => {
      const { api } = await import("@/lib/api");

      useChatStore.setState({
        messagesByConversation: {
          "conv-1": [
            { id: "temp-123", conversationId: "conv-1", role: "user", content: "Hi", status: "completed", createdAt: new Date(), updatedAt: new Date() },
          ],
        },
      });

      await useChatStore.getState().deleteMessage("conv-1", "temp-123");
      expect(api).not.toHaveBeenCalled();
      expect(useChatStore.getState().messagesByConversation["conv-1"]).toHaveLength(0);
    });
  });

  // --------------------------------------------------
  // handleWSEvent
  // --------------------------------------------------

  describe("handleWSEvent", () => {
    it("handles stream_start: adds streaming message", () => {
      useChatStore.setState({
        messagesByConversation: { "conv-1": [] },
      });

      useChatStore.getState().handleWSEvent({
        type: "stream_start",
        conversationId: "conv-1",
        messageId: "msg-1",
      });

      const msgs = useChatStore.getState().messagesByConversation["conv-1"];
      expect(msgs).toHaveLength(1);
      expect(msgs[0].status).toBe("streaming");
      expect(msgs[0].content).toBe("");
    });

    it("handles stream_chunk: updates content", () => {
      useChatStore.setState({
        messagesByConversation: {
          "conv-1": [
            { id: "msg-1", conversationId: "conv-1", role: "agent", content: "", status: "streaming", createdAt: new Date(), updatedAt: new Date() },
          ],
        },
      });

      useChatStore.getState().handleWSEvent({
        type: "stream_chunk",
        conversationId: "conv-1",
        messageId: "msg-1",
        chunk: "Hello world",
      });

      const msgs = useChatStore.getState().messagesByConversation["conv-1"];
      expect(msgs[0].content).toBe("Hello world");
    });

    it("handles stream_end: marks completed", () => {
      useChatStore.setState({
        activeConversationId: "conv-1",
        messagesByConversation: {
          "conv-1": [
            { id: "msg-1", conversationId: "conv-1", role: "agent", content: "Done", status: "streaming", createdAt: new Date(), updatedAt: new Date() },
          ],
        },
      });

      useChatStore.getState().handleWSEvent({
        type: "stream_end",
        conversationId: "conv-1",
        messageId: "msg-1",
      });

      const msgs = useChatStore.getState().messagesByConversation["conv-1"];
      expect(msgs[0].status).toBe("completed");
    });

    it("handles stream_end: increments unread for inactive conversation", () => {
      useChatStore.setState({
        activeConversationId: "conv-2",
        unreadCounts: {},
        mutedConversations: {},
        messagesByConversation: {
          "conv-1": [
            { id: "msg-1", conversationId: "conv-1", role: "agent", content: "Hi", status: "streaming", createdAt: new Date(), updatedAt: new Date() },
          ],
        },
      });

      useChatStore.getState().handleWSEvent({
        type: "stream_end",
        conversationId: "conv-1",
        messageId: "msg-1",
      });

      expect(useChatStore.getState().unreadCounts["conv-1"]).toBe(1);
    });

    it("handles stream_end: does not increment unread for muted conversation", () => {
      useChatStore.setState({
        activeConversationId: "conv-2",
        unreadCounts: {},
        mutedConversations: { "conv-1": true },
        messagesByConversation: {
          "conv-1": [
            { id: "msg-1", conversationId: "conv-1", role: "agent", content: "Hi", status: "streaming", createdAt: new Date(), updatedAt: new Date() },
          ],
        },
      });

      useChatStore.getState().handleWSEvent({
        type: "stream_end",
        conversationId: "conv-1",
        messageId: "msg-1",
      });

      expect(useChatStore.getState().unreadCounts["conv-1"]).toBeUndefined();
    });

    it("handles stream_error: marks as error", () => {
      useChatStore.setState({
        messagesByConversation: {
          "conv-1": [
            { id: "msg-1", conversationId: "conv-1", role: "agent", content: "", status: "streaming", createdAt: new Date(), updatedAt: new Date() },
          ],
        },
      });

      useChatStore.getState().handleWSEvent({
        type: "stream_error",
        conversationId: "conv-1",
        messageId: "msg-1",
        error: "Agent offline",
      });

      const msgs = useChatStore.getState().messagesByConversation["conv-1"];
      expect(msgs[0].status).toBe("error");
      expect(msgs[0].content).toBe("Agent offline");
    });

    it("ignores pong events", () => {
      const before = useChatStore.getState();
      useChatStore.getState().handleWSEvent({ type: "pong" });
      // Should not throw or change state meaningfully
      expect(useChatStore.getState().activeConversationId).toBe(before.activeConversationId);
    });
  });

  // --------------------------------------------------
  // searchMessages / clearSearch
  // --------------------------------------------------

  describe("searchMessages", () => {
    it("sets search state and calls API", async () => {
      const { api } = await import("@/lib/api");
      (api as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        results: [{ messageId: "m1", content: "match" }],
        total: 1,
      });

      await useChatStore.getState().searchMessages("match");
      expect(useChatStore.getState().searchActive).toBe(true);
      expect(useChatStore.getState().searchResults).toHaveLength(1);
    });

    it("does nothing for empty query", async () => {
      const { api } = await import("@/lib/api");
      await useChatStore.getState().searchMessages("  ");
      expect(api).not.toHaveBeenCalled();
    });
  });

  describe("clearSearch", () => {
    it("resets all search state", () => {
      useChatStore.setState({
        searchQuery: "test",
        searchResults: [{ messageId: "m1" } as never],
        searchTotal: 1,
        searchActive: true,
        searchLoading: true,
        highlightMessageId: "m1",
      });

      useChatStore.getState().clearSearch();
      const state = useChatStore.getState();
      expect(state.searchQuery).toBe("");
      expect(state.searchResults).toHaveLength(0);
      expect(state.searchTotal).toBe(0);
      expect(state.searchActive).toBe(false);
      expect(state.highlightMessageId).toBeNull();
    });
  });

  // --------------------------------------------------
  // toggleTimestamps / toggleMuteConversation / setTtsEnabled
  // --------------------------------------------------

  describe("toggleTimestamps", () => {
    it("toggles showTimestamps and persists to localStorage", () => {
      expect(useChatStore.getState().showTimestamps).toBe(false);
      useChatStore.getState().toggleTimestamps();
      expect(useChatStore.getState().showTimestamps).toBe(true);
      expect(localStorage.getItem("arinova_timestamps")).toBe("true");
      useChatStore.getState().toggleTimestamps();
      expect(useChatStore.getState().showTimestamps).toBe(false);
    });
  });

  describe("toggleMuteConversation", () => {
    it("toggles mute state", () => {
      useChatStore.getState().toggleMuteConversation("conv-1");
      expect(useChatStore.getState().mutedConversations["conv-1"]).toBe(true);
      useChatStore.getState().toggleMuteConversation("conv-1");
      expect(useChatStore.getState().mutedConversations["conv-1"]).toBeUndefined();
    });
  });

  describe("setTtsEnabled", () => {
    it("sets tts and persists", () => {
      useChatStore.getState().setTtsEnabled(true);
      expect(useChatStore.getState().ttsEnabled).toBe(true);
      expect(localStorage.getItem("arinova_tts")).toBe("true");
    });
  });

  // --------------------------------------------------
  // insertSystemMessage
  // --------------------------------------------------

  describe("insertSystemMessage", () => {
    it("adds system message to active conversation", () => {
      useChatStore.setState({
        activeConversationId: "conv-1",
        messagesByConversation: { "conv-1": [] },
      });

      useChatStore.getState().insertSystemMessage("Server restarted");
      const msgs = useChatStore.getState().messagesByConversation["conv-1"];
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toContain("[System]");
      expect(msgs[0].content).toContain("Server restarted");
      expect(msgs[0].id).toMatch(/^system-/);
    });

    it("does nothing without active conversation", () => {
      useChatStore.getState().insertSystemMessage("nope");
      // No crash
    });
  });

  // --------------------------------------------------
  // clearConversation
  // --------------------------------------------------

  describe("clearConversation", () => {
    it("clears messages locally", async () => {
      const { api } = await import("@/lib/api");
      (api as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      useChatStore.setState({
        messagesByConversation: {
          "conv-1": [{ id: "msg-1" } as never],
        },
      });

      await useChatStore.getState().clearConversation("conv-1");
      expect(useChatStore.getState().messagesByConversation["conv-1"]).toHaveLength(0);
    });
  });

  // --------------------------------------------------
  // initWS
  // --------------------------------------------------

  describe("initWS", () => {
    it("connects and returns cleanup function", async () => {
      const { wsManager } = await import("@/lib/ws");
      const cleanup = useChatStore.getState().initWS();
      expect(wsManager.connect).toHaveBeenCalled();
      expect(typeof cleanup).toBe("function");
      cleanup();
      expect(wsManager.disconnect).toHaveBeenCalled();
    });
  });
});
