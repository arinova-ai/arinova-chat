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

interface ChatState {
  agents: Agent[];
  conversations: ConversationWithAgent[];
  messagesByConversation: Record<string, Message[]>;
  activeConversationId: string | null;
  sidebarOpen: boolean;
  searchQuery: string;
  loading: boolean;
  unreadCounts: Record<string, number>;
  agentHealth: Record<string, { status: "online" | "offline" | "error"; latencyMs: number | null }>;
  agentSkills: Record<string, AgentSkill[]>;
  ttsEnabled: boolean;

  // Actions
  setActiveConversation: (id: string) => void;
  setSidebarOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  loadAgents: () => Promise<void>;
  loadConversations: (query?: string) => Promise<void>;
  loadMessages: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => void;
  cancelStream: () => void;
  createAgent: (data: { name: string; description?: string; a2aEndpoint?: string }) => Promise<Agent>;
  updateAgent: (id: string, data: { name?: string; description?: string | null; avatarUrl?: string | null }) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  createConversation: (agentId: string, title?: string) => Promise<Conversation>;
  createGroupConversation: (agentIds: string[], title: string) => Promise<Conversation>;
  loadGroupMembers: (conversationId: string) => Promise<GroupMember[]>;
  addGroupMember: (conversationId: string, agentId: string) => Promise<void>;
  removeGroupMember: (conversationId: string, agentId: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversation: (id: string, data: { title?: string; pinned?: boolean }) => Promise<void>;
  deleteMessage: (conversationId: string, messageId: string) => Promise<void>;
  loadAgentSkills: (agentId: string) => Promise<void>;
  loadAgentHealth: () => Promise<void>;
  insertSystemMessage: (content: string) => void;
  clearConversation: (conversationId: string) => Promise<void>;
  getConversationStatus: () => string;
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
  loading: false,
  unreadCounts: {},
  agentHealth: {},
  agentSkills: {},
  ttsEnabled: typeof window !== "undefined"
    ? localStorage.getItem("arinova_tts") === "true"
    : false,

  setActiveConversation: (id) => {
    set({
      activeConversationId: id,
      sidebarOpen: false,
      unreadCounts: { ...get().unreadCounts, [id]: 0 },
    });
    get().loadMessages(id);
  },

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setSearchQuery: (query) => {
    set({ searchQuery: query });
    get().loadConversations(query || undefined);
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
    const { messagesByConversation } = get();
    if (messagesByConversation[conversationId]) return;

    const data = await api<{ messages: Message[]; hasMore: boolean }>(
      `/api/conversations/${conversationId}/messages`
    );
    set({
      messagesByConversation: {
        ...get().messagesByConversation,
        [conversationId]: data.messages,
      },
    });
  },

  sendMessage: (content) => {
    const { activeConversationId } = get();
    if (!activeConversationId) return;

    // Optimistic: add user message to UI
    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      conversationId: activeConversationId,
      role: "user",
      content,
      status: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const current = get().messagesByConversation[activeConversationId] ?? [];
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
    // Refresh agents list
    await get().loadAgents();
    // Also refresh conversations (agent name may have changed)
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
    return api<GroupMember[]>(`/api/conversations/${conversationId}/members`);
  },

  addGroupMember: async (conversationId, agentId) => {
    await api(`/api/conversations/${conversationId}/members`, {
      method: "POST",
      body: JSON.stringify({ agentId }),
    });
    await get().loadConversations();
  },

  removeGroupMember: async (conversationId, agentId) => {
    await api(`/api/conversations/${conversationId}/members/${agentId}`, {
      method: "DELETE",
    });
    await get().loadConversations();
  },

  deleteConversation: async (id) => {
    await api(`/api/conversations/${id}`, { method: "DELETE" });
    const { activeConversationId, messagesByConversation } = get();
    const newMessages = { ...messagesByConversation };
    delete newMessages[id];
    set({
      conversations: get().conversations.filter((c) => c.id !== id),
      activeConversationId: activeConversationId === id ? null : activeConversationId,
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
    // Optimistic messages (temp-*) only exist in UI, skip API call
    if (!messageId.startsWith("temp-")) {
      await api(`/api/conversations/${conversationId}/messages/${messageId}`, {
        method: "DELETE",
      });
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
      const data = await api<{ skills: AgentSkill[] }>(`/api/agents/${agentId}/skills`);
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
      const results = await api<{ agentId: string; status: "online" | "offline" | "error"; latencyMs: number | null }[]>(
        "/api/agents/health"
      );
      const health: Record<string, { status: "online" | "offline" | "error"; latencyMs: number | null }> = {};
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
      role: "agent",
      content: `**[System]**\n\n${content}`,
      status: "completed",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const current = get().messagesByConversation[activeConversationId] ?? [];
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
      // If API fails (e.g., endpoint not implemented), still clear locally
    }
    set({
      messagesByConversation: {
        ...get().messagesByConversation,
        [conversationId]: [],
      },
    });
  },

  getConversationStatus: () => {
    const { activeConversationId, conversations, agentHealth, messagesByConversation } = get();
    if (!activeConversationId) return "No active conversation.";

    const conv = conversations.find((c) => c.id === activeConversationId);
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
      const latency = health?.latencyMs != null ? `${health.latencyMs}ms` : "N/A";
      lines.push(`**Agent:** ${agentName}`);
      lines.push(`**Agent Status:** ${status}`);
      lines.push(`**Latency:** ${latency}`);
    }

    lines.push(`**WebSocket:** ${wsManager.isConnected() ? "Connected" : "Disconnected"}`);

    return lines.join("\n");
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
      const { conversationId, messageId } = event;
      const current = get().messagesByConversation[conversationId] ?? [];
      // Add streaming agent message
      const agentMsg: Message = {
        id: messageId,
        conversationId,
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
      });
      return;
    }

    if (event.type === "stream_chunk") {
      const { conversationId, messageId, chunk } = event;
      const current = get().messagesByConversation[conversationId] ?? [];
      set({
        messagesByConversation: {
          ...get().messagesByConversation,
          [conversationId]: current.map((m) =>
            m.id === messageId ? { ...m, content: m.content + chunk } : m
          ),
        },
      });
      return;
    }

    if (event.type === "stream_end") {
      const { conversationId, messageId } = event;
      const current = get().messagesByConversation[conversationId] ?? [];
      const { activeConversationId, unreadCounts } = get();
      set({
        messagesByConversation: {
          ...get().messagesByConversation,
          [conversationId]: current.map((m) =>
            m.id === messageId
              ? { ...m, status: "completed" as const, updatedAt: new Date() }
              : m
          ),
        },
        // Increment unread if not viewing this conversation
        unreadCounts:
          conversationId !== activeConversationId
            ? { ...unreadCounts, [conversationId]: (unreadCounts[conversationId] ?? 0) + 1 }
            : unreadCounts,
      });
      // Refresh conversation list to update last message
      get().loadConversations();
      return;
    }

    if (event.type === "stream_error") {
      const { conversationId, messageId, error } = event;
      const current = get().messagesByConversation[conversationId] ?? [];
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
  },

  initWS: () => {
    wsManager.connect();
    const unsub = wsManager.subscribe((event) => {
      get().handleWSEvent(event);
    });
    return () => {
      unsub();
      wsManager.disconnect();
    };
  },
}));
