import { create } from "zustand";
import type { Agent, Conversation, Message } from "@arinova/shared/types";
import type { WSServerEvent } from "@arinova/shared/types";
import { api } from "@/lib/api";
import { wsManager } from "@/lib/ws";

interface ConversationWithAgent extends Conversation {
  agentName: string;
  agentDescription: string | null;
  agentAvatarUrl: string | null;
  lastMessage: Message | null;
}

interface GroupMember {
  id: string;
  conversationId: string;
  agentId: string;
  addedAt: string;
  agentName: string;
  agentDescription: string | null;
  agentAvatarUrl: string | null;
}

interface AgentSkill {
  id: string;
  name: string;
  description: string;
}

interface SearchResult {
  messageId: string;
  conversationId: string;
  content: string;
  role: string;
  createdAt: string;
  conversationTitle: string | null;
  agentName: string | null;
  agentAvatarUrl: string | null;
}

interface ChatState {
  agents: Agent[];
  conversations: ConversationWithAgent[];
  messagesByConversation: Record<string, Message[]>;
  activeConversationId: string | null;
  sidebarOpen: boolean;
  searchQuery: string;
  searchResults: SearchResult[];
  searchTotal: number;
  searchLoading: boolean;
  searchActive: boolean;
  highlightMessageId: string | null;
  loading: boolean;
  unreadCounts: Record<string, number>;
  agentHealth: Record<
    string,
    { status: "online" | "offline" | "error"; latencyMs: number | null }
  >;
  agentSkills: Record<string, AgentSkill[]>;
  showTimestamps: boolean;
  mutedConversations: Record<string, boolean>;
  ttsEnabled: boolean;

  // Actions
  setActiveConversation: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  searchMessages: (query: string) => Promise<void>;
  clearSearch: () => void;
  jumpToMessage: (conversationId: string, messageId: string) => Promise<void>;
  loadAgents: () => Promise<void>;
  loadConversations: (query?: string) => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => void;
  cancelStream: () => void;
  createAgent: (data: {
    name: string;
    description?: string;
    a2aEndpoint?: string;
  }) => Promise<Agent>;
  updateAgent: (id: string, data: Record<string, unknown>) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  createConversation: (
    agentId: string,
    title?: string
  ) => Promise<Conversation>;
  createGroupConversation: (
    agentIds: string[],
    title: string
  ) => Promise<Conversation>;
  loadGroupMembers: (conversationId: string) => Promise<GroupMember[]>;
  addGroupMember: (conversationId: string, agentId: string) => Promise<void>;
  removeGroupMember: (conversationId: string, agentId: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversation: (
    id: string,
    data: { title?: string; pinned?: boolean }
  ) => Promise<void>;
  deleteMessage: (conversationId: string, messageId: string) => Promise<void>;
  loadAgentSkills: (agentId: string) => Promise<void>;
  loadAgentHealth: () => Promise<void>;
  insertSystemMessage: (content: string) => void;
  clearConversation: (conversationId: string) => Promise<void>;
  getConversationStatus: () => string;
  toggleTimestamps: () => void;
  toggleMuteConversation: (conversationId: string) => void;
  setTtsEnabled: (enabled: boolean) => void;
  handleWSEvent: (event: WSServerEvent) => void;
  initWS: () => () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
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
  showTimestamps:
    typeof window !== "undefined"
      ? localStorage.getItem("arinova_timestamps") === "true"
      : false,
  mutedConversations:
    typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem("arinova_muted") || "{}")
      : {},
  ttsEnabled:
    typeof window !== "undefined"
      ? localStorage.getItem("arinova_tts") === "true"
      : false,

  setActiveConversation: (id) => {
    if (id === null) {
      set({ activeConversationId: null });
      return;
    }
    set({
      activeConversationId: id,
      sidebarOpen: false,
      searchActive: false,
      unreadCounts: { ...get().unreadCounts, [id]: 0 },
    });
    get().loadMessages(id);
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  searchMessages: async (query) => {
    if (!query.trim()) return;
    set({
      searchQuery: query,
      searchLoading: true,
      searchActive: true,
      activeConversationId: null,
    });
    try {
      const data = await api<{ results: SearchResult[]; total: number }>(
        `/api/messages/search?q=${encodeURIComponent(query)}&limit=30`
      );
      set({ searchResults: data.results, searchTotal: data.total });
    } catch {
      set({ searchResults: [], searchTotal: 0 });
    } finally {
      set({ searchLoading: false });
    }
  },

  clearSearch: () => {
    set({
      searchQuery: "",
      searchResults: [],
      searchTotal: 0,
      searchActive: false,
      searchLoading: false,
      highlightMessageId: null,
    });
  },

  jumpToMessage: async (conversationId, messageId) => {
    // Fetch around-cursor messages FIRST, before switching conversation,
    // so MessageList mounts with correct messages already in store.
    const data = await api<{
      messages: Message[];
      hasMoreUp: boolean;
      hasMoreDown: boolean;
    }>(
      `/api/conversations/${conversationId}/messages?around=${messageId}&limit=50`
    );

    // Set everything atomically — conversation, messages, and highlight together
    set({
      searchActive: false,
      activeConversationId: conversationId,
      sidebarOpen: false,
      highlightMessageId: messageId,
      unreadCounts: { ...get().unreadCounts, [conversationId]: 0 },
      messagesByConversation: {
        ...get().messagesByConversation,
        [conversationId]: data.messages,
      },
    });

    setTimeout(() => {
      if (get().highlightMessageId === messageId) {
        set({ highlightMessageId: null });
      }
    }, 8000);
  },

  loadAgents: async () => {
    const agents = await api<Agent[]>("/api/agents");
    set({ agents });
  },

  loadConversations: async (query) => {
    const path = query
      ? `/api/conversations?q=${encodeURIComponent(query)}`
      : "/api/conversations";
    const conversations = await api<ConversationWithAgent[]>(path);
    set({ conversations });
  },

  loadMessages: async (conversationId) => {
    // Always load fresh messages (no cache guard)
    const data = await api<{ messages: Message[]; hasMore: boolean }>(
      `/api/conversations/${conversationId}/messages`
    );
    set({
      messagesByConversation: {
        ...get().messagesByConversation,
        [conversationId]: data.messages,
      },
    });

    // Send mark_read with max seq from loaded messages
    if (get().activeConversationId === conversationId) {
      const maxSeq = data.messages.reduce(
        (max, m) => Math.max(max, m.seq ?? 0),
        0
      );
      if (maxSeq > 0) {
        wsManager.send({
          type: "mark_read",
          conversationId,
          seq: maxSeq,
        });
        wsManager.updateLastSeq(conversationId, maxSeq);
      }
    }
  },

  sendMessage: (content) => {
    const { activeConversationId } = get();
    if (!activeConversationId) return;

    // Optimistic: add user message to UI
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      conversationId: activeConversationId,
      seq: 0,
      role: "user",
      content,
      status: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const current =
      get().messagesByConversation[activeConversationId] ?? [];
    set({
      messagesByConversation: {
        ...get().messagesByConversation,
        [activeConversationId]: [...current, userMsg],
      },
    });

    // Send via WebSocket
    wsManager.send({
      type: "send_message",
      conversationId: activeConversationId,
      content,
    });
  },

  cancelStream: () => {
    const { activeConversationId, messagesByConversation } = get();
    if (!activeConversationId) return;
    const msgs = messagesByConversation[activeConversationId] ?? [];
    const streamingMsg = msgs.find((m) => m.status === "streaming");
    if (!streamingMsg) return;
    wsManager.send({
      type: "cancel_stream",
      conversationId: activeConversationId,
      messageId: streamingMsg.id,
    });
    set({
      messagesByConversation: {
        ...get().messagesByConversation,
        [activeConversationId]: msgs.map((m) =>
          m.id === streamingMsg.id
            ? { ...m, status: "cancelled" as const }
            : m
        ),
      },
    });
  },

  createAgent: async (data) => {
    const agent = await api<Agent>("/api/agents", {
      method: "POST",
      body: JSON.stringify(data),
    });
    set({ agents: [...get().agents, agent] });
    return agent;
  },

  updateAgent: async (id, data) => {
    await api(`/api/agents/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    await get().loadAgents();
    await get().loadConversations();
  },

  deleteAgent: async (id) => {
    await api(`/api/agents/${id}`, { method: "DELETE" });
    set({ agents: get().agents.filter((a) => a.id !== id) });
  },

  createConversation: async (agentId, title) => {
    const conv = await api<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ agentId, title }),
    });
    await get().loadConversations();
    return conv;
  },

  createGroupConversation: async (agentIds, title) => {
    const conv = await api<Conversation>("/api/conversations/group", {
      method: "POST",
      body: JSON.stringify({ agentIds, title }),
    });
    await get().loadConversations();
    return conv;
  },

  loadGroupMembers: async (conversationId) => {
    return api<GroupMember[]>(
      `/api/conversations/${conversationId}/members`
    );
  },

  addGroupMember: async (conversationId, agentId) => {
    await api(`/api/conversations/${conversationId}/members`, {
      method: "POST",
      body: JSON.stringify({ agentId }),
    });
    await get().loadConversations();
  },

  removeGroupMember: async (conversationId, agentId) => {
    await api(
      `/api/conversations/${conversationId}/members/${agentId}`,
      {
        method: "DELETE",
      }
    );
    await get().loadConversations();
  },

  deleteConversation: async (id) => {
    await api(`/api/conversations/${id}`, { method: "DELETE" });
    const { activeConversationId, messagesByConversation } = get();
    const newMessages = { ...messagesByConversation };
    delete newMessages[id];
    set({
      conversations: get().conversations.filter((c) => c.id !== id),
      activeConversationId:
        activeConversationId === id ? null : activeConversationId,
      messagesByConversation: newMessages,
    });
  },

  updateConversation: async (id, data) => {
    await api(`/api/conversations/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    await get().loadConversations();
  },

  deleteMessage: async (conversationId, messageId) => {
    if (!messageId.startsWith("temp-")) {
      await api(
        `/api/conversations/${conversationId}/messages/${messageId}`,
        {
          method: "DELETE",
        }
      );
    }
    const current = get().messagesByConversation[conversationId] ?? [];
    set({
      messagesByConversation: {
        ...get().messagesByConversation,
        [conversationId]: current.filter((m) => m.id !== messageId),
      },
    });
  },

  loadAgentSkills: async (agentId) => {
    if (get().agentSkills[agentId]) return;
    try {
      const data = await api<{ skills: AgentSkill[] }>(
        `/api/agents/${agentId}/skills`
      );
      set({
        agentSkills: { ...get().agentSkills, [agentId]: data.skills },
      });
    } catch {
      set({
        agentSkills: { ...get().agentSkills, [agentId]: [] },
      });
    }
  },

  loadAgentHealth: async () => {
    try {
      const results = await api<
        {
          agentId: string;
          status: "online" | "offline" | "error";
          latencyMs: number | null;
        }[]
      >("/api/agents/health");
      const health: Record<
        string,
        { status: "online" | "offline" | "error"; latencyMs: number | null }
      > = {};
      for (const r of results) {
        health[r.agentId] = { status: r.status, latencyMs: r.latencyMs };
      }
      set({ agentHealth: health });
    } catch {
      // ignore health check failures
    }
  },

  insertSystemMessage: (content) => {
    const { activeConversationId } = get();
    if (!activeConversationId) return;

    const systemMsg: Message = {
      id: `system-${Date.now()}`,
      conversationId: activeConversationId,
      seq: 0,
      role: "agent",
      content: `**[System]**\n\n${content}`,
      status: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const current =
      get().messagesByConversation[activeConversationId] ?? [];
    set({
      messagesByConversation: {
        ...get().messagesByConversation,
        [activeConversationId]: [...current, systemMsg],
      },
    });
  },

  clearConversation: async (conversationId) => {
    try {
      await api(`/api/conversations/${conversationId}/messages`, {
        method: "DELETE",
      });
    } catch {
      // If API fails, still clear locally
    }
    set({
      messagesByConversation: {
        ...get().messagesByConversation,
        [conversationId]: [],
      },
    });
  },

  getConversationStatus: () => {
    const {
      activeConversationId,
      conversations,
      agentHealth,
      messagesByConversation,
    } = get();
    if (!activeConversationId) return "No active conversation.";

    const conv = conversations.find(
      (c) => c.id === activeConversationId
    );
    if (!conv) return "Conversation not found.";

    const msgs = messagesByConversation[activeConversationId] ?? [];
    const streamingMsg = msgs.find((m) => m.status === "streaming");

    const lines: string[] = [];
    lines.push(`**Conversation:** ${conv.title ?? "Untitled"}`);
    lines.push(`**Type:** ${conv.type}`);
    lines.push(`**Messages:** ${msgs.length}`);
    lines.push(`**Streaming:** ${streamingMsg ? "Yes" : "No"}`);

    if (conv.type === "direct" && conv.agentId) {
      const agentName = conv.agentName ?? "Unknown";
      const health = agentHealth[conv.agentId];
      const status = health?.status ?? "unknown";
      const latency =
        health?.latencyMs != null ? `${health.latencyMs}ms` : "N/A";
      lines.push(`**Agent:** ${agentName}`);
      lines.push(`**Agent Status:** ${status}`);
      lines.push(`**Latency:** ${latency}`);
    }

    lines.push(
      `**WebSocket:** ${wsManager.isConnected() ? "Connected" : "Disconnected"}`
    );

    return lines.join("\n");
  },

  toggleTimestamps: () => {
    const next = !get().showTimestamps;
    set({ showTimestamps: next });
    if (typeof window !== "undefined") {
      localStorage.setItem("arinova_timestamps", String(next));
    }
  },

  toggleMuteConversation: (conversationId) => {
    const muted = { ...get().mutedConversations };
    const newMuted = !muted[conversationId];
    if (newMuted) {
      muted[conversationId] = true;
    } else {
      delete muted[conversationId];
    }
    set({ mutedConversations: muted });
    if (typeof window !== "undefined") {
      localStorage.setItem("arinova_muted", JSON.stringify(muted));
    }
    // Persist to backend for push notification filtering
    api(`/api/conversations/${conversationId}/mute`, {
      method: "PUT",
      body: JSON.stringify({ muted: newMuted }),
    }).catch(() => {});
  },

  setTtsEnabled: (enabled) => {
    set({ ttsEnabled: enabled });
    if (typeof window !== "undefined") {
      localStorage.setItem("arinova_tts", String(enabled));
    }
  },

  handleWSEvent: (event) => {
    if (event.type === "pong") return;

    if (event.type === "stream_start") {
      const { conversationId, messageId, seq } = event;
      const current =
        get().messagesByConversation[conversationId] ?? [];
      const agentMsg: Message = {
        id: messageId,
        conversationId,
        seq,
        role: "agent",
        content: "",
        status: "streaming",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      set({
        messagesByConversation: {
          ...get().messagesByConversation,
          [conversationId]: [...current, agentMsg],
        },
        // Update sidebar to show typing indicator
        conversations: get().conversations.map((c) =>
          c.id === conversationId
            ? { ...c, lastMessage: agentMsg }
            : c
        ),
      });
      return;
    }

    if (event.type === "stream_chunk") {
      const { conversationId, messageId, chunk } = event;
      const current =
        get().messagesByConversation[conversationId] ?? [];
      set({
        messagesByConversation: {
          ...get().messagesByConversation,
          [conversationId]: current.map((m) =>
            m.id === messageId ? { ...m, content: chunk } : m
          ),
        },
      });
      return;
    }

    if (event.type === "stream_end") {
      const { conversationId, messageId, seq } = event;
      const current =
        get().messagesByConversation[conversationId] ?? [];
      const { activeConversationId, unreadCounts } = get();

      // Find the completed message content for sidebar preview
      const completedMsg = current.find((m) => m.id === messageId);

      set({
        messagesByConversation: {
          ...get().messagesByConversation,
          [conversationId]: current.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  status: "completed" as const,
                  updatedAt: new Date(),
                }
              : m
          ),
        },
        // Update sidebar lastMessage preview directly
        conversations: get().conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessage: completedMsg
                  ? {
                      ...completedMsg,
                      status: "completed" as const,
                      updatedAt: new Date(),
                    }
                  : c.lastMessage,
                updatedAt: new Date(),
              }
            : c
        ),
        // Increment unread if not viewing this conversation
        unreadCounts:
          conversationId !== activeConversationId &&
          !get().mutedConversations[conversationId]
            ? {
                ...unreadCounts,
                [conversationId]:
                  (unreadCounts[conversationId] ?? 0) + 1,
              }
            : unreadCounts,
      });

      // If viewing this conversation, mark as read
      if (conversationId === activeConversationId && seq > 0) {
        wsManager.send({
          type: "mark_read",
          conversationId,
          seq,
        });
      }
      return;
    }

    if (event.type === "stream_error") {
      const { conversationId, messageId, error } = event;
      const current =
        get().messagesByConversation[conversationId] ?? [];
      set({
        messagesByConversation: {
          ...get().messagesByConversation,
          [conversationId]: current.map((m) =>
            m.id === messageId
              ? { ...m, content: error, status: "error" as const }
              : m
          ),
        },
      });
      return;
    }

    if (event.type === "sync_response") {
      const { conversations: convSummaries, missedMessages } = event;

      // Update unread counts and muted state from server
      const newUnreadCounts = { ...get().unreadCounts };
      const newMuted = { ...get().mutedConversations };
      for (const summary of convSummaries) {
        if (summary.conversationId !== get().activeConversationId) {
          newUnreadCounts[summary.conversationId] = summary.unreadCount;
        } else {
          newUnreadCounts[summary.conversationId] = 0;
        }
        if (summary.muted) {
          newMuted[summary.conversationId] = true;
        } else {
          delete newMuted[summary.conversationId];
        }
      }

      // Update conversation lastMessage from summaries
      const convUpdates = new Map(
        convSummaries.map((s) => [s.conversationId, s])
      );
      const updatedConversations = get().conversations.map((c) => {
        const summary = convUpdates.get(c.id);
        if (summary && summary.lastMessage) {
          return {
            ...c,
            lastMessage: {
              id: "",
              conversationId: c.id,
              seq: summary.maxSeq,
              role: summary.lastMessage.role,
              content: summary.lastMessage.content,
              status: summary.lastMessage.status,
              createdAt: new Date(summary.lastMessage.createdAt),
              updatedAt: new Date(summary.lastMessage.createdAt),
            } as Message,
          };
        }
        return c;
      });

      // Merge missed messages into existing message arrays
      const missedByConv = new Map<string, typeof missedMessages>();
      for (const msg of missedMessages) {
        const list = missedByConv.get(msg.conversationId) ?? [];
        list.push(msg);
        missedByConv.set(msg.conversationId, list);
      }

      const newMessagesByConv = { ...get().messagesByConversation };
      for (const [convId, missed] of missedByConv) {
        const existing = newMessagesByConv[convId] ?? [];
        // Remove temp messages; keep real ones
        const realMessages = existing.filter(
          (m) => !m.id.startsWith("temp-")
        );
        const existingIds = new Set(realMessages.map((m) => m.id));

        const newMessages = missed
          .filter((m) => !existingIds.has(m.id))
          .map(
            (m) =>
              ({
                id: m.id,
                conversationId: m.conversationId,
                seq: m.seq,
                role: m.role,
                content: m.content,
                status: m.status,
                createdAt: new Date(m.createdAt),
                updatedAt: new Date(m.createdAt),
              }) as Message
          );

        newMessagesByConv[convId] = [
          ...realMessages,
          ...newMessages,
        ].sort((a, b) => {
          if (a.seq && b.seq) return a.seq - b.seq;
          return (
            new Date(a.createdAt).getTime() -
            new Date(b.createdAt).getTime()
          );
        });
      }

      if (typeof window !== "undefined") {
        localStorage.setItem("arinova_muted", JSON.stringify(newMuted));
      }
      set({
        conversations: updatedConversations,
        messagesByConversation: newMessagesByConv,
        unreadCounts: newUnreadCounts,
        mutedConversations: newMuted,
      });
      return;
    }
  },

  initWS: () => {
    wsManager.connect();
    wsManager.setupVisibilityListeners();
    const unsub = wsManager.subscribe((event) => {
      get().handleWSEvent(event);
    });
    return () => {
      unsub();
      wsManager.disconnect();
    };
  },
}));
