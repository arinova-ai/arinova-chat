import { create } from "zustand";
import type { Agent, Conversation, Message, ThreadSummary, Note } from "@arinova/shared/types";
import type { WSServerEvent } from "@arinova/shared/types";
import { api } from "@/lib/api";
import { wsManager } from "@/lib/ws";
import { diagCount, diagEvent } from "@/lib/chat-diagnostics";

interface ConversationWithAgent extends Conversation {
  agentName: string;
  agentDescription: string | null;
  agentAvatarUrl: string | null;
  peerUserId?: string | null;
  lastMessage: Message | null;
  isVerified?: boolean;
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

export interface GroupAgentMember {
  id: string;
  agentId: string;
  ownerUserId: string | null;
  listenMode: string;
  addedAt: string;
  agentName: string;
  agentDescription: string | null;
  agentAvatarUrl: string | null;
}

export interface GroupUserMember {
  id: string;
  userId: string;
  role: "admin" | "vice_admin" | "member";
  joinedAt: string;
  name: string;
  image: string | null;
  username: string | null;
  isVerified?: boolean;
}

export interface GroupMembers {
  agents: GroupAgentMember[];
  users: GroupUserMember[];
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

export interface ReactionInfo {
  count: number;
  userReacted: boolean;
}

export interface ThinkingAgent {
  messageId: string;
  agentId: string;
  agentName: string;
  seq: number;
  startedAt: Date;
  queued?: boolean;
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
  loadingMessages: boolean;
  loadingRequestId: number;
  unreadCounts: Record<string, number>;
  agentHealth: Record<
    string,
    { status: "online" | "offline" | "error"; latencyMs: number | null }
  >;
  agentSkills: Record<string, AgentSkill[]>;
  showTimestamps: boolean;
  mutedConversations: Record<string, boolean>;
  ttsEnabled: boolean;
  reactionsByMessage: Record<string, Record<string, ReactionInfo>>;
  conversationMembers: Record<string, { agentId: string; agentName: string; type?: "agent" | "user" }[]>;
  groupMembersData: Record<string, GroupMembers>;
  thinkingAgents: Record<string, ThinkingAgent[]>;
  replyingTo: Message | null;
  blockedUserIds: Set<string>;
  currentUserId: string | null;
  inputDrafts: Record<string, string>;
  typingUsers: Record<string, { userId: string; userName: string; expiresAt: number }[]>;
  queuedMessageIds: Record<string, Set<string>>; // conversationId → set of user message IDs

  // Pagination hints from jumpToMessage
  jumpPagination: { hasMoreUp: boolean; hasMoreDown: boolean } | null;

  // Thread state
  activeThreadId: string | null;
  threadMessages: Record<string, Message[]>;
  threadLoading: boolean;

  // Pin state
  pinnedMessageIds: Record<string, Set<string>>; // conversationId → set of pinned message IDs

  // Notebook state
  notesByConversation: Record<string, Note[]>;
  notebookOpen: boolean;
  agentNotesEnabledByConversation: Record<string, boolean>;

  // Conversation search state (in-conversation search bar)
  convSearchOpen: boolean;
  convSearchQuery: string;
  convSearchResults: { messageId: string; content: string }[];
  convSearchIndex: number; // current active result index
  convSearchLoading: boolean;

  // Unread divider: first unread message ID per conversation
  unreadDividerMessageId: string | null;

  // Actions
  setCurrentUserId: (id: string | null) => void;
  setReplyingTo: (message: Message | null) => void;
  setActiveConversation: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  searchMessages: (query: string) => Promise<void>;
  searchMore: () => Promise<void>;
  clearSearch: () => void;
  jumpToMessage: (conversationId: string, messageId: string) => Promise<void>;
  openConvSearch: () => void;
  closeConvSearch: () => void;
  searchConversation: (query: string) => Promise<void>;
  setConvSearchIndex: (index: number) => Promise<void>;
  loadAgents: () => Promise<void>;
  loadConversations: (query?: string) => Promise<void>;
  loadMessages: (conversationId: string, unreadCountForDivider?: number) => Promise<void>;
  sendMessage: (content: string, mentions?: string[]) => void;
  cancelStream: (messageId?: string) => void;
  cancelAgentStream: (conversationId: string, messageId: string) => void;
  cancelQueuedMessage: (conversationId: string, messageId: string) => void;
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
  createDirectConversation: (targetUserId: string) => Promise<Conversation>;
  createGroupConversation: (
    agentIds: string[],
    title: string,
    userIds?: string[]
  ) => Promise<Conversation>;
  loadGroupMembers: (conversationId: string) => Promise<GroupMember[]>;
  loadGroupMembersV2: (conversationId: string) => Promise<GroupMembers>;
  addGroupMember: (conversationId: string, agentId: string) => Promise<void>;
  addGroupUser: (conversationId: string, userId: string) => Promise<void>;
  removeGroupMember: (conversationId: string, agentId: string) => Promise<void>;
  generateInviteLink: (conversationId: string) => Promise<string>;
  joinViaInvite: (token: string) => Promise<string>;
  kickUser: (conversationId: string, userId: string) => Promise<void>;
  promoteUser: (conversationId: string, userId: string) => Promise<void>;
  demoteUser: (conversationId: string, userId: string) => Promise<void>;
  transferAdmin: (conversationId: string, userId: string) => Promise<void>;
  leaveGroup: (conversationId: string) => Promise<void>;
  updateGroupSettings: (conversationId: string, settings: { title?: string; inviteEnabled?: boolean; mentionOnly?: boolean }) => Promise<void>;
  updateAgentListenMode: (conversationId: string, agentId: string, listenMode: string) => Promise<void>;
  setAgentAllowedUsers: (conversationId: string, agentId: string, userIds: string[]) => Promise<void>;
  withdrawAgent: (conversationId: string, agentId: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversation: (
    id: string,
    data: { title?: string; pinned?: boolean; mentionOnly?: boolean }
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
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  loadReactions: (messageId: string) => Promise<void>;
  loadBlockedUsers: () => Promise<void>;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  openThread: (threadId: string) => void;
  closeThread: () => void;
  loadThreadMessages: (conversationId: string, threadId: string) => Promise<void>;
  sendThreadMessage: (content: string) => void;
  setInputDraft: (conversationId: string, text: string) => void;
  clearInputDraft: (conversationId: string) => void;

  // Pin actions
  loadPins: (conversationId: string) => Promise<void>;
  togglePin: (conversationId: string, messageId: string) => Promise<void>;

  // Notebook actions
  openNotebook: () => void;
  closeNotebook: () => void;
  loadNotes: (conversationId: string) => Promise<void>;
  createNote: (conversationId: string, title: string, content: string) => Promise<Note>;
  updateNote: (conversationId: string, noteId: string, updates: { title?: string; content?: string }) => Promise<void>;
  deleteNote: (conversationId: string, noteId: string) => Promise<void>;
  toggleAgentNotesEnabled: (conversationId: string, enabled: boolean) => Promise<void>;

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
  loadingMessages: false,
  loadingRequestId: 0,
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
  reactionsByMessage: {},
  conversationMembers: {},
  groupMembersData: {},
  thinkingAgents: {},
  replyingTo: null,
  blockedUserIds: new Set<string>(),
  currentUserId: null,
  inputDrafts: {},
  typingUsers: {},
  queuedMessageIds: {},
  jumpPagination: null,
  activeThreadId: null,
  threadMessages: {},
  threadLoading: false,
  pinnedMessageIds: {},
  notesByConversation: {},
  notebookOpen: false,
  agentNotesEnabledByConversation: {},
  convSearchOpen: false,
  convSearchQuery: "",
  convSearchResults: [],
  convSearchIndex: -1,
  convSearchLoading: false,
  unreadDividerMessageId: null,

  setCurrentUserId: (id) => {
    diagCount("action:setCurrentUserId");
    if (get().currentUserId === id) return;
    set({ currentUserId: id });
  },
  setReplyingTo: (message) => {
    diagCount("action:setReplyingTo");
    if (get().replyingTo?.id === message?.id) return;
    set({ replyingTo: message });
  },
  setInputDraft: (conversationId, text) => {
    const drafts = { ...get().inputDrafts };
    if (text) {
      drafts[conversationId] = text;
    } else {
      delete drafts[conversationId];
    }
    set({ inputDrafts: drafts });
  },
  clearInputDraft: (conversationId) => {
    const drafts = { ...get().inputDrafts };
    delete drafts[conversationId];
    set({ inputDrafts: drafts });
  },

  setActiveConversation: (id) => {
    diagCount("action:setActiveConversation");
    diagEvent("action:setActiveConversation:input", {
      nextId: id,
      currentId: get().activeConversationId,
      searchActive: get().searchActive,
    });
    if (id === null) {
      if (get().activeConversationId === null) return;
      set({ activeConversationId: null });
      return;
    }
    const currentState = get();
    if (currentState.activeConversationId === id && !currentState.searchActive) {
      return;
    }
    // Save unread count before resetting so we can place a divider after loading
    const savedUnread = get().unreadCounts[id] ?? 0;
    const cached = get().messagesByConversation[id] ?? [];
    set({
      activeConversationId: id,
      sidebarOpen: false,
      searchActive: false,
      activeThreadId: null,
      jumpPagination: null,
      convSearchOpen: false,
      convSearchQuery: "",
      convSearchResults: [],
      convSearchIndex: -1,
      convSearchLoading: false,
      unreadDividerMessageId: null,
      unreadCounts: { ...get().unreadCounts, [id]: 0 },
      // Keep cached messages to prevent flash; loadMessages will replace them
      ...(cached.length === 0 && {
        messagesByConversation: {
          ...get().messagesByConversation,
          [id]: [],
        },
      }),
    });
    get().loadMessages(id, savedUnread);

    // Load conversation members for @mention support
    const conv = get().conversations.find((c) => c.id === id);
    if (conv && !get().conversationMembers[id]) {
      if (conv.type === "group") {
        get()
          .loadGroupMembersV2(id)
          .catch(() => {});
      } else if (conv.agentId) {
        set({
          conversationMembers: {
            ...get().conversationMembers,
            [id]: [{ agentId: conv.agentId, agentName: conv.agentName }],
          },
        });
      }
    }
  },

  setSidebarOpen: (open) => {
    diagCount("action:setSidebarOpen");
    if (get().sidebarOpen === open) return;
    set({ sidebarOpen: open });
  },

  setSearchQuery: (query) => {
    diagCount("action:setSearchQuery");
    if (get().searchQuery === query) return;
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

  searchMore: async () => {
    const { searchQuery, searchResults, searchTotal, searchLoading } = get();
    if (!searchQuery || searchLoading || searchResults.length >= searchTotal) return;
    set({ searchLoading: true });
    try {
      const offset = searchResults.length;
      const data = await api<{ results: SearchResult[]; total: number }>(
        `/api/messages/search?q=${encodeURIComponent(searchQuery)}&limit=30&offset=${offset}`
      );
      set({
        searchResults: [...searchResults, ...data.results],
        searchTotal: data.total,
      });
    } catch {
      // ignore load more errors
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

  openConvSearch: () => {
    set({ convSearchOpen: true, convSearchQuery: "", convSearchResults: [], convSearchIndex: -1 });
  },

  closeConvSearch: () => {
    set({
      convSearchOpen: false,
      convSearchQuery: "",
      convSearchResults: [],
      convSearchIndex: -1,
      convSearchLoading: false,
      highlightMessageId: null,
    });
  },

  searchConversation: async (query) => {
    const conversationId = get().activeConversationId;
    if (!query.trim() || !conversationId) return;
    set({ convSearchQuery: query, convSearchLoading: true, convSearchResults: [], convSearchIndex: -1 });
    try {
      const data = await api<{ results: { messageId: string; content: string }[]; total: number }>(
        `/api/messages/search?q=${encodeURIComponent(query)}&conversation_id=${conversationId}&limit=50`
      );
      const results = data.results.map((r) => ({ messageId: r.messageId, content: r.content }));
      set({
        convSearchResults: results,
        convSearchIndex: results.length > 0 ? 0 : -1,
        highlightMessageId: results.length > 0 ? results[0].messageId : null,
      });

      // If first result is not in loaded messages, load around it
      if (results.length > 0) {
        const currentMsgs = get().messagesByConversation[conversationId] ?? [];
        if (!currentMsgs.some((m) => m.id === results[0].messageId)) {
          try {
            const aroundData = await api<{
              messages: Message[];
              hasMoreUp: boolean;
              hasMoreDown: boolean;
            }>(
              `/api/conversations/${conversationId}/messages?around=${results[0].messageId}&limit=50`
            );
            set({
              jumpPagination: { hasMoreUp: aroundData.hasMoreUp, hasMoreDown: aroundData.hasMoreDown },
              messagesByConversation: {
                ...get().messagesByConversation,
                [conversationId]: aroundData.messages,
              },
            });
          } catch {
            // ignore — highlight will still work if message loads later
          }
        }
      }
    } catch {
      set({ convSearchResults: [], convSearchIndex: -1 });
    } finally {
      set({ convSearchLoading: false });
    }
  },

  setConvSearchIndex: async (index) => {
    const { convSearchResults, activeConversationId } = get();
    if (index < 0 || index >= convSearchResults.length || !activeConversationId) return;
    const result = convSearchResults[index];
    const currentMsgs = get().messagesByConversation[activeConversationId] ?? [];
    const found = currentMsgs.some((m) => m.id === result.messageId);

    if (found) {
      set({ convSearchIndex: index, highlightMessageId: result.messageId });
    } else {
      // Message not in loaded range — fetch messages around it
      try {
        const data = await api<{
          messages: Message[];
          hasMoreUp: boolean;
          hasMoreDown: boolean;
        }>(
          `/api/conversations/${activeConversationId}/messages?around=${result.messageId}&limit=50`
        );
        set({
          convSearchIndex: index,
          highlightMessageId: result.messageId,
          jumpPagination: { hasMoreUp: data.hasMoreUp, hasMoreDown: data.hasMoreDown },
          messagesByConversation: {
            ...get().messagesByConversation,
            [activeConversationId]: data.messages,
          },
        });
      } catch {
        set({ convSearchIndex: index, highlightMessageId: result.messageId });
      }
    }

    // Clear highlight after a delay
    setTimeout(() => {
      if (get().highlightMessageId === result.messageId) {
        set({ highlightMessageId: null });
      }
    }, 3000);
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
      jumpPagination: { hasMoreUp: data.hasMoreUp, hasMoreDown: data.hasMoreDown },
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

  loadMessages: async (conversationId, unreadCountForDivider) => {
    const requestId = get().loadingRequestId + 1;
    const prevMessages = get().messagesByConversation[conversationId] ?? [];
    set({ loadingMessages: true, loadingRequestId: requestId });
    try {
      const data = await api<{ messages: Message[]; hasMore: boolean }>(
        `/api/conversations/${conversationId}/messages`
      );
      // Compute unread divider position before updating messages
      let dividerMsgId: string | null = null;
      if (unreadCountForDivider && unreadCountForDivider > 0 && data.messages.length > 0) {
        const idx = data.messages.length - unreadCountForDivider;
        if (idx > 0 && idx < data.messages.length) {
          dividerMsgId = data.messages[idx].id;
        }
      }
      set({
        messagesByConversation: {
          ...get().messagesByConversation,
          [conversationId]: data.messages,
        },
        ...(dividerMsgId !== null && { unreadDividerMessageId: dividerMsgId }),
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
    } catch {
      // Rollback to previous messages so the UI doesn't show an empty screen
      if (get().loadingRequestId === requestId) {
        set({
          messagesByConversation: {
            ...get().messagesByConversation,
            [conversationId]: prevMessages,
          },
        });
      }
    } finally {
      // Only clear loading if this is still the latest request
      if (get().loadingRequestId === requestId) {
        set({ loadingMessages: false });
      }
    }
  },

  sendMessage: (content, mentions) => {
    const { activeConversationId, replyingTo } = get();
    if (!activeConversationId) return;

    // Optimistic: add user message to UI with stable UUID
    const clientMsgId = crypto.randomUUID();
    const userMsg: Message = {
      id: clientMsgId,
      conversationId: activeConversationId,
      seq: 0,
      role: "user",
      content,
      status: "completed",
      senderUserId: get().currentUserId || undefined,
      replyToId: replyingTo?.id,
      replyTo: replyingTo
        ? {
            role: replyingTo.role,
            content:
              replyingTo.content.length > 200
                ? replyingTo.content.slice(0, 200)
                : replyingTo.content,
            senderAgentName: replyingTo.senderAgentName,
          }
        : undefined,
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
      // Update sidebar lastMessage preview
      conversations: get().conversations.map((c) =>
        c.id === activeConversationId
          ? { ...c, lastMessage: userMsg, updatedAt: new Date() }
          : c
      ),
      replyingTo: null,
    });

    // Send via WebSocket with client-generated UUID
    wsManager.send({
      type: "send_message",
      id: clientMsgId,
      conversationId: activeConversationId,
      content,
      ...(replyingTo ? { replyToId: replyingTo.id } : {}),
      ...(mentions && mentions.length > 0 ? { mentions } : {}),
    });
  },

  cancelStream: (messageId?) => {
    const { activeConversationId, messagesByConversation } = get();
    if (!activeConversationId) return;
    const msgs = messagesByConversation[activeConversationId] ?? [];
    const streamingMsg = messageId
      ? msgs.find((m) => m.id === messageId && m.status === "streaming")
      : msgs.find((m) => m.status === "streaming");
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

  cancelAgentStream: (conversationId, messageId) => {
    wsManager.send({
      type: "cancel_stream",
      conversationId,
      messageId,
    });
    // Optimistically remove from thinkingAgents
    const prev = get().thinkingAgents[conversationId] ?? [];
    set({
      thinkingAgents: {
        ...get().thinkingAgents,
        [conversationId]: prev.filter((t) => t.messageId !== messageId),
      },
    });
    // Also mark message as cancelled if it exists
    const msgs = get().messagesByConversation[conversationId] ?? [];
    const target = msgs.find((m) => m.id === messageId && m.status === "streaming");
    if (target) {
      set({
        messagesByConversation: {
          ...get().messagesByConversation,
          [conversationId]: msgs.map((m) =>
            m.id === messageId ? { ...m, status: "cancelled" as const } : m
          ),
        },
      });
    }
  },

  cancelQueuedMessage: (conversationId, messageId) => {
    wsManager.send({
      type: "cancel_queued",
      conversationId,
      messageId,
    });
    // Optimistically remove from queuedMessageIds
    const prevSet = get().queuedMessageIds[conversationId];
    if (prevSet) {
      const next = new Set(prevSet);
      next.delete(messageId);
      set({
        queuedMessageIds: {
          ...get().queuedMessageIds,
          [conversationId]: next,
        },
      });
    }
    // Also remove any matching queued thinkingAgent entry
    const prev = get().thinkingAgents[conversationId] ?? [];
    set({
      thinkingAgents: {
        ...get().thinkingAgents,
        [conversationId]: prev.filter((t) => !(t.queued && t.messageId === messageId)),
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

  createDirectConversation: async (targetUserId) => {
    const conv = await api<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ targetUserId }),
    });
    await get().loadConversations();
    return conv;
  },

  createGroupConversation: async (agentIds, title, userIds) => {
    const conv = await api<Conversation>("/api/conversations/group", {
      method: "POST",
      body: JSON.stringify({ agentIds, title, ...(userIds?.length ? { userIds } : {}) }),
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

  addGroupUser: async (conversationId, userId) => {
    await api(`/api/groups/${conversationId}/add-user`, {
      method: "POST",
      body: JSON.stringify({ userId }),
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

  loadGroupMembersV2: async (conversationId) => {
    const data = await api<GroupMembers>(
      `/api/conversations/${conversationId}/members`
    );
    set({
      groupMembersData: {
        ...get().groupMembersData,
        [conversationId]: data,
      },
      conversationMembers: {
        ...get().conversationMembers,
        [conversationId]: [
          ...data.agents.map((a) => ({
            agentId: a.agentId,
            agentName: a.agentName,
            type: "agent" as const,
          })),
          ...data.users.map((u) => ({
            agentId: `user:${u.userId}`,
            agentName: u.name ?? u.username ?? "User",
            type: "user" as const,
          })),
        ],
      },
    });
    return data;
  },

  generateInviteLink: async (conversationId) => {
    const data = await api<{ inviteLink: string }>(`/api/groups/${conversationId}/invite-link`, {
      method: "POST",
    });
    return data.inviteLink;
  },

  joinViaInvite: async (token) => {
    const data = await api<{ conversationId: string; joined: boolean }>(`/api/groups/join/${token}`, {
      method: "POST",
    });
    await get().loadConversations();
    return data.conversationId;
  },

  kickUser: async (conversationId, userId) => {
    await api(`/api/groups/${conversationId}/kick/${userId}`, { method: "POST" });
    await get().loadGroupMembersV2(conversationId);
  },

  promoteUser: async (conversationId, userId) => {
    await api(`/api/groups/${conversationId}/promote/${userId}`, { method: "POST" });
    await get().loadGroupMembersV2(conversationId);
  },

  demoteUser: async (conversationId, userId) => {
    await api(`/api/groups/${conversationId}/demote/${userId}`, { method: "POST" });
    await get().loadGroupMembersV2(conversationId);
  },

  transferAdmin: async (conversationId, userId) => {
    await api(`/api/groups/${conversationId}/transfer-admin/${userId}`, { method: "POST" });
    await get().loadGroupMembersV2(conversationId);
  },

  leaveGroup: async (conversationId) => {
    await api(`/api/groups/${conversationId}/leave`, { method: "POST" });
    const { activeConversationId, messagesByConversation, thinkingAgents } = get();
    const newMessages = { ...messagesByConversation };
    delete newMessages[conversationId];
    const newThinking = { ...thinkingAgents };
    delete newThinking[conversationId];
    set({
      conversations: get().conversations.filter((c) => c.id !== conversationId),
      activeConversationId:
        activeConversationId === conversationId ? null : activeConversationId,
      messagesByConversation: newMessages,
      thinkingAgents: newThinking,
    });
  },

  updateGroupSettings: async (conversationId, settings) => {
    await api(`/api/groups/${conversationId}/settings`, {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
    await get().loadConversations();
  },

  updateAgentListenMode: async (conversationId, agentId, listenMode) => {
    await api(`/api/conversations/${conversationId}/agents/${agentId}/listen-mode`, {
      method: "PATCH",
      body: JSON.stringify({ listenMode }),
    });
    await get().loadGroupMembersV2(conversationId);
  },

  setAgentAllowedUsers: async (conversationId, agentId, userIds) => {
    await api(`/api/conversations/${conversationId}/agents/${agentId}/allowed-users`, {
      method: "PUT",
      body: JSON.stringify({ userIds }),
    });
  },

  withdrawAgent: async (conversationId, agentId) => {
    await api(`/api/conversations/${conversationId}/agents/${agentId}/withdraw`, { method: "POST" });
    await get().loadGroupMembersV2(conversationId);
  },

  deleteConversation: async (id) => {
    await api(`/api/conversations/${id}`, { method: "DELETE" });
    const { activeConversationId, messagesByConversation, thinkingAgents } = get();
    const newMessages = { ...messagesByConversation };
    delete newMessages[id];
    const newThinking = { ...thinkingAgents };
    delete newThinking[id];
    set({
      conversations: get().conversations.filter((c) => c.id !== id),
      activeConversationId:
        activeConversationId === id ? null : activeConversationId,
      messagesByConversation: newMessages,
      thinkingAgents: newThinking,
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

  toggleReaction: async (messageId, emoji) => {
    const reactions = { ...get().reactionsByMessage };
    const msgReactions = { ...(reactions[messageId] ?? {}) };
    const existing = msgReactions[emoji];

    if (existing?.userReacted) {
      // Remove reaction (optimistic)
      if (existing.count <= 1) {
        delete msgReactions[emoji];
      } else {
        msgReactions[emoji] = { count: existing.count - 1, userReacted: false };
      }
      reactions[messageId] = msgReactions;
      set({ reactionsByMessage: reactions });

      try {
        await api(`/api/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
          method: "DELETE",
        });
      } catch {
        // Revert on error
        get().loadReactions(messageId);
      }
    } else {
      // Add reaction (optimistic)
      msgReactions[emoji] = {
        count: (existing?.count ?? 0) + 1,
        userReacted: true,
      };
      reactions[messageId] = msgReactions;
      set({ reactionsByMessage: reactions });

      try {
        await api(`/api/messages/${messageId}/reactions`, {
          method: "POST",
          body: JSON.stringify({ emoji }),
        });
      } catch {
        get().loadReactions(messageId);
      }
    }
  },

  loadReactions: async (messageId) => {
    try {
      const data = await api<{ emoji: string; count: number; userReacted: boolean }[]>(
        `/api/messages/${messageId}/reactions`
      );
      const msgReactions: Record<string, ReactionInfo> = {};
      for (const r of data) {
        msgReactions[r.emoji] = { count: r.count, userReacted: r.userReacted };
      }
      set({
        reactionsByMessage: {
          ...get().reactionsByMessage,
          [messageId]: msgReactions,
        },
      });
    } catch {
      // ignore
    }
  },

  loadBlockedUsers: async () => {
    try {
      const data = await api<{ id: string; name: string; username: string; image: string | null }[]>(
        "/api/users/blocked"
      );
      set({ blockedUserIds: new Set(data.map((u) => u.id)) });
    } catch {
      // ignore
    }
  },

  blockUser: async (userId) => {
    await api(`/api/users/${userId}/block`, { method: "POST" });
    set({ blockedUserIds: new Set([...get().blockedUserIds, userId]) });
  },

  unblockUser: async (userId) => {
    await api(`/api/users/${userId}/block`, { method: "DELETE" });
    const next = new Set(get().blockedUserIds);
    next.delete(userId);
    set({ blockedUserIds: next });
  },

  openThread: (threadId) => {
    diagCount("action:openThread");
    const { activeConversationId } = get();
    if (get().activeThreadId === threadId) return;
    set({ activeThreadId: threadId });
    if (activeConversationId) {
      get().loadThreadMessages(activeConversationId, threadId);
    }
  },

  closeThread: () => {
    diagCount("action:closeThread");
    if (get().activeThreadId === null) return;
    set({ activeThreadId: null });
  },

  loadThreadMessages: async (conversationId, threadId) => {
    set({ threadLoading: true });
    try {
      const data = await api<{ messages: Message[]; hasMore: boolean }>(
        `/api/conversations/${conversationId}/threads/${threadId}/messages?limit=50`
      );
      set({
        threadMessages: {
          ...get().threadMessages,
          [threadId]: data.messages,
        },
      });
    } catch {
      // ignore
    } finally {
      set({ threadLoading: false });
    }
  },

  sendThreadMessage: (content) => {
    const { activeConversationId, activeThreadId } = get();
    if (!activeConversationId || !activeThreadId) return;

    // Optimistic: add user message to thread with stable UUID
    const clientThreadMsgId = crypto.randomUUID();
    const userMsg: Message = {
      id: clientThreadMsgId,
      conversationId: activeConversationId,
      seq: 0,
      role: "user",
      content,
      status: "completed",
      threadId: activeThreadId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const current = get().threadMessages[activeThreadId] ?? [];
    set({
      threadMessages: {
        ...get().threadMessages,
        [activeThreadId]: [...current, userMsg],
      },
    });

    // Send via WebSocket with threadId + client UUID
    wsManager.send({
      type: "send_message",
      id: clientThreadMsgId,
      conversationId: activeConversationId,
      content,
      threadId: activeThreadId,
    });
  },

  loadPins: async (conversationId) => {
    diagCount("action:loadPins");
    try {
      const data = await api<{ messageId: string }[]>(
        `/api/conversations/${conversationId}/pins`
      );
      const ids = new Set(data.map((p) => p.messageId));
      set({
        pinnedMessageIds: {
          ...get().pinnedMessageIds,
          [conversationId]: ids,
        },
      });
    } catch {
      // keep existing
    }
  },
  togglePin: async (conversationId, messageId) => {
    diagCount("action:togglePin");
    const current = get().pinnedMessageIds[conversationId] ?? new Set<string>();
    const isPinned = current.has(messageId);
    try {
      await api(`/api/conversations/${conversationId}/pin/${messageId}`, {
        method: isPinned ? "DELETE" : "POST",
      });
      const updated = new Set(current);
      if (isPinned) {
        updated.delete(messageId);
      } else {
        updated.add(messageId);
      }
      set({
        pinnedMessageIds: {
          ...get().pinnedMessageIds,
          [conversationId]: updated,
        },
      });
      // Notify PinnedMessagesBar to refresh its display
      window.dispatchEvent(
        new CustomEvent("pins-changed", { detail: { conversationId } })
      );
    } catch {
      // pin/unpin failed
    }
  },

  openNotebook: () => {
    diagCount("action:openNotebook");
    if (get().notebookOpen) return;
    set({ notebookOpen: true });
  },
  closeNotebook: () => {
    diagCount("action:closeNotebook");
    if (!get().notebookOpen) return;
    set({ notebookOpen: false });
  },

  loadNotes: async (conversationId) => {
    try {
      const res = await api<{ notes: Note[]; hasMore: boolean; nextCursor: string | null }>(
        `/api/conversations/${conversationId}/notes`
      );
      set({
        notesByConversation: {
          ...get().notesByConversation,
          [conversationId]: res.notes,
        },
      });
    } catch {
      // ignore load errors
    }
  },

  createNote: async (conversationId, title, content) => {
    const note = await api<Note>(
      `/api/conversations/${conversationId}/notes`,
      {
        method: "POST",
        body: JSON.stringify({ title, content }),
      }
    );
    const current = get().notesByConversation[conversationId] ?? [];
    // WS note:created may have already added this note
    if (!current.some((n) => n.id === note.id)) {
      set({
        notesByConversation: {
          ...get().notesByConversation,
          [conversationId]: [note, ...current],
        },
      });
    }
    return note;
  },

  updateNote: async (conversationId, noteId, updates) => {
    const updated = await api<Note>(
      `/api/conversations/${conversationId}/notes/${noteId}`,
      {
        method: "PATCH",
        body: JSON.stringify(updates),
      }
    );
    const current = get().notesByConversation[conversationId] ?? [];
    set({
      notesByConversation: {
        ...get().notesByConversation,
        [conversationId]: current.map((n) =>
          n.id === noteId ? updated : n
        ),
      },
    });
  },

  deleteNote: async (conversationId, noteId) => {
    await api(
      `/api/conversations/${conversationId}/notes/${noteId}`,
      { method: "DELETE" }
    );
    const current = get().notesByConversation[conversationId] ?? [];
    set({
      notesByConversation: {
        ...get().notesByConversation,
        [conversationId]: current.filter((n) => n.id !== noteId),
      },
    });
  },

  toggleAgentNotesEnabled: async (conversationId, enabled) => {
    // Optimistic update
    set({
      agentNotesEnabledByConversation: {
        ...get().agentNotesEnabledByConversation,
        [conversationId]: enabled,
      },
    });
    try {
      await api(
        `/api/conversations/${conversationId}/notes/settings`,
        {
          method: "PATCH",
          body: JSON.stringify({ agentNotesEnabled: enabled }),
        }
      );
    } catch {
      // Revert on error
      set({
        agentNotesEnabledByConversation: {
          ...get().agentNotesEnabledByConversation,
          [conversationId]: !enabled,
        },
      });
    }
  },

  handleWSEvent: (event) => {
    diagCount(`ws:${event.type}`);
    if (event.type === "pong") return;

    // If any event carries a conversationId not in our local store,
    // re-fetch conversations (handles soft-hidden conversations reappearing)
    if ("conversationId" in event && event.conversationId) {
      const convId = event.conversationId;
      const exists = get().conversations.some((c) => c.id === convId);
      if (!exists) {
        get().loadConversations();
      }
    }

    if (event.type === "new_message") {
      const { conversationId, message: msg } = event;
      const threadId = (event as { threadId?: string }).threadId ?? msg.threadId;
      const { activeConversationId, unreadCounts } = get();

      const newMsg: Message = {
        id: msg.id,
        conversationId: msg.conversationId,
        seq: msg.seq,
        role: msg.role,
        content: msg.content?.replace(/\r\n?/g, "\n") ?? msg.content,
        status: msg.status,
        senderUserId: msg.senderUserId,
        senderUserName: msg.senderUserName,
        senderUserImage: (msg as Record<string, unknown>).senderUserImage as string | undefined,
        senderIsVerified: (msg as Record<string, unknown>).senderIsVerified as boolean | undefined,
        replyToId: msg.replyToId ?? undefined,
        threadId: threadId ?? undefined,
        attachments: ((msg as Record<string, unknown>).attachments as Message["attachments"]) ?? [],
        createdAt: new Date(msg.createdAt),
        updatedAt: new Date(msg.updatedAt),
      };

      // Thread message — route to threadMessages, update parent threadSummary
      if (threadId) {
        const threadMsgs = get().threadMessages[threadId] ?? [];
        const alreadyExists = threadMsgs.some(
          (m) => m.id === msg.id || (m.id.startsWith("temp-") && m.content === msg.content && m.role === msg.role)
        );
        if (alreadyExists) {
          let replaced = false;
          set({
            threadMessages: {
              ...get().threadMessages,
              [threadId]: threadMsgs.map((m) => {
                if (!replaced && m.id.startsWith("temp-") && m.content === msg.content && m.role === msg.role) {
                  replaced = true;
                  return {
                    ...newMsg,
                    senderUserId: newMsg.senderUserId || get().currentUserId || undefined,
                    attachments: (newMsg.attachments?.length ? newMsg.attachments : m.attachments) ?? [],
                  };
                }
                return m;
              }),
            },
          });
        } else {
          set({
            threadMessages: {
              ...get().threadMessages,
              [threadId]: [...threadMsgs, newMsg],
            },
          });
        }

        // Update parent message's threadSummary in main conversation
        const mainMsgs = get().messagesByConversation[conversationId] ?? [];
        set({
          messagesByConversation: {
            ...get().messagesByConversation,
            [conversationId]: mainMsgs.map((m) =>
              m.id === threadId
                ? {
                    ...m,
                    threadSummary: {
                      replyCount: (m.threadSummary?.replyCount ?? 0) + 1,
                      lastReplyAt: new Date().toISOString(),
                      participants: m.threadSummary?.participants ?? [],
                      lastReplyPreview: msg.content.slice(0, 100),
                    },
                  }
                : m
            ),
          },
        });

        if (conversationId === activeConversationId && msg.seq > 0) {
          wsManager.send({ type: "mark_read", conversationId, seq: msg.seq });
          wsManager.updateLastSeq(conversationId, msg.seq);
        }
        return;
      }

      const current = get().messagesByConversation[conversationId] ?? [];
      // Deduplicate: skip if message already exists (e.g. optimistic send)
      const alreadyExists = current.some(
        (m) => m.id === msg.id || (m.id.startsWith("temp-") && m.content === msg.content && m.role === msg.role)
      );

      if (alreadyExists) {
        // Replace first matching temp message with real one
        let replaced = false;
        set({
          messagesByConversation: {
            ...get().messagesByConversation,
            [conversationId]: current.map((m) => {
              if (!replaced && m.id.startsWith("temp-") && m.content === msg.content && m.role === msg.role) {
                replaced = true;
                return {
                  ...newMsg,
                  senderUserId: newMsg.senderUserId || get().currentUserId || undefined,
                  attachments: (newMsg.attachments?.length ? newMsg.attachments : m.attachments) ?? [],
                };
              }
              return m;
            }),
          },
          conversations: get().conversations.map((c) =>
            c.id === conversationId
              ? { ...c, lastMessage: newMsg, updatedAt: new Date() }
              : c
          ),
        });
      } else {
        set({
          messagesByConversation: {
            ...get().messagesByConversation,
            [conversationId]: [...current, newMsg],
          },
          conversations: get().conversations.map((c) =>
            c.id === conversationId
              ? { ...c, lastMessage: newMsg, updatedAt: new Date() }
              : c
          ),
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
      }

      // When a system message arrives, refresh conversation members (for @mention)
      if (msg.role === "system") {
        const conv = get().conversations.find((c) => c.id === conversationId);
        if (conv?.type === "group") {
          get().loadGroupMembersV2(conversationId).catch(() => {});
        }
      }

      // Mark as read if viewing this conversation
      if (conversationId === activeConversationId && msg.seq > 0) {
        wsManager.send({ type: "mark_read", conversationId, seq: msg.seq });
        wsManager.updateLastSeq(conversationId, msg.seq);
      }
      return;
    }

    if (event.type === "user_typing") {
      const { conversationId, userId, userName } = event;
      const now = Date.now();
      const expiresAt = now + 5000;
      const prev = get().typingUsers[conversationId] ?? [];
      const filtered = prev.filter((u) => u.userId !== userId && u.expiresAt > now);
      set({
        typingUsers: {
          ...get().typingUsers,
          [conversationId]: [...filtered, { userId, userName, expiresAt }],
        },
      });
      setTimeout(() => {
        const current = get().typingUsers[conversationId] ?? [];
        set({
          typingUsers: {
            ...get().typingUsers,
            [conversationId]: current.filter((u) => u.expiresAt > Date.now()),
          },
        });
      }, 5100);
      return;
    }

    if (event.type === "stream_queued") {
      const { conversationId, agentId, agentName } = event;
      const userMessageId = (event as { messageId?: string }).messageId ?? "";
      const queued: ThinkingAgent = {
        messageId: userMessageId,
        agentId: agentId ?? "",
        agentName: agentName ?? "Agent",
        seq: 0,
        startedAt: new Date(),
        queued: true,
      };
      const prev = get().thinkingAgents[conversationId] ?? [];
      // Don't add duplicate queued entries for same agent
      if (!prev.some((t) => t.queued && t.messageId === userMessageId)) {
        set({
          thinkingAgents: {
            ...get().thinkingAgents,
            [conversationId]: [...prev, queued],
          },
        });
      }

      // Track the queued user message ID for per-message indicators
      if (userMessageId) {
        const prevSet = get().queuedMessageIds[conversationId] ?? new Set<string>();
        const next = new Set(prevSet);
        next.add(userMessageId);
        set({
          queuedMessageIds: {
            ...get().queuedMessageIds,
            [conversationId]: next,
          },
        });
      }
      return;
    }

    if (event.type === "queued_cancelled") {
      const { conversationId, messageId } = event;
      // Remove from queuedMessageIds
      const prevSet = get().queuedMessageIds[conversationId];
      if (prevSet) {
        const next = new Set(prevSet);
        next.delete(messageId);
        set({
          queuedMessageIds: {
            ...get().queuedMessageIds,
            [conversationId]: next,
          },
        });
      }
      // Remove matching queued thinkingAgent entry
      const prev = get().thinkingAgents[conversationId] ?? [];
      set({
        thinkingAgents: {
          ...get().thinkingAgents,
          [conversationId]: prev.filter((t) => !(t.queued && t.messageId === messageId)),
        },
      });
      return;
    }

    if (event.type === "stream_start") {
      const { conversationId, messageId, seq, senderAgentId, senderAgentName } = event;

      const thinking: ThinkingAgent = {
        messageId,
        agentId: senderAgentId ?? "",
        agentName: senderAgentName ?? "Agent",
        seq,
        startedAt: new Date(),
      };
      // Replace any queued entry for this agent with the actual thinking entry
      // Also capture the queued entry's messageId so we can clean up queuedMessageIds
      const prevThinking = get().thinkingAgents[conversationId] ?? [];
      const queuedEntry = prevThinking.find(
        (t) => t.queued && t.agentId === (senderAgentId ?? "")
      );
      const prev = prevThinking.filter(
        (t) => !(t.queued && t.agentId === (senderAgentId ?? ""))
      );

      set({
        thinkingAgents: {
          ...get().thinkingAgents,
          [conversationId]: [...prev, thinking],
        },
        conversations: get().conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                lastMessage: {
                  id: messageId,
                  conversationId,
                  seq: seq ?? 0,
                  role: "agent" as const,
                  content: "...",
                  status: "streaming" as const,
                  senderAgentId: senderAgentId ?? undefined,
                  senderAgentName: senderAgentName ?? undefined,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
                updatedAt: new Date(),
              }
            : c
        ),
      });

      // Remove the queued user message from queuedMessageIds
      if (queuedEntry?.messageId) {
        const prevSet = get().queuedMessageIds[conversationId];
        if (prevSet?.has(queuedEntry.messageId)) {
          const next = new Set(prevSet);
          next.delete(queuedEntry.messageId);
          set({
            queuedMessageIds: {
              ...get().queuedMessageIds,
              [conversationId]: next,
            },
          });
        }
      }
      return;
    }

    if (event.type === "stream_chunk") {
      const { conversationId, messageId, chunk } = event;
      const threadId = event.threadId;

      // Check if this is the first chunk (message still in thinkingAgents)
      const thinking = get().thinkingAgents[conversationId] ?? [];
      const thinkingEntry = thinking.find((t) => t.messageId === messageId);

      if (thinkingEntry) {
        // First chunk: create message bubble and remove from thinkingAgents
        const agentMsg: Message = {
          id: messageId,
          conversationId,
          seq: thinkingEntry.seq,
          role: "agent",
          content: chunk,
          status: "streaming",
          senderAgentId: thinkingEntry.agentId || undefined,
          senderAgentName: thinkingEntry.agentName,
          threadId: threadId ?? undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        if (threadId) {
          const threadMsgs = get().threadMessages[threadId] ?? [];
          set({
            threadMessages: {
              ...get().threadMessages,
              [threadId]: [...threadMsgs, agentMsg],
            },
            thinkingAgents: {
              ...get().thinkingAgents,
              [conversationId]: thinking.filter((t) => t.messageId !== messageId),
            },
          });
        } else {
          const current = get().messagesByConversation[conversationId] ?? [];
          set({
            messagesByConversation: {
              ...get().messagesByConversation,
              [conversationId]: [...current, agentMsg],
            },
            thinkingAgents: {
              ...get().thinkingAgents,
              [conversationId]: thinking.filter((t) => t.messageId !== messageId),
            },
            conversations: get().conversations.map((c) =>
              c.id === conversationId
                ? { ...c, lastMessage: agentMsg, updatedAt: new Date() }
                : c
            ),
          });
        }
      } else {
        // Subsequent chunks: append to existing message
        if (threadId) {
          const threadMsgs = get().threadMessages[threadId] ?? [];
          set({
            threadMessages: {
              ...get().threadMessages,
              [threadId]: threadMsgs.map((m) =>
                m.id === messageId ? { ...m, content: m.content + chunk } : m
              ),
            },
          });
        } else {
          const current = get().messagesByConversation[conversationId] ?? [];
          set({
            messagesByConversation: {
              ...get().messagesByConversation,
              [conversationId]: current.map((m) =>
                m.id === messageId ? { ...m, content: m.content + chunk } : m
              ),
            },
            conversations: get().conversations.map((c) =>
              c.id === conversationId && c.lastMessage?.id === messageId
                ? { ...c, lastMessage: { ...c.lastMessage, content: c.lastMessage.content + chunk } }
                : c
            ),
          });
        }
      }
      return;
    }

    if (event.type === "stream_end") {
      const { conversationId, messageId, seq } = event;
      const { activeConversationId, unreadCounts } = get();
      // Normalize \r\n and \r → \n to prevent GFM table formatting differences
      // between streamed chunks (which use \n) and backend final content
      const finalContent = event.content?.replace(/\r\n?/g, "\n");
      const threadId = event.threadId;

      // Check if still in thinkingAgents (no chunks ever arrived)
      const thinking = get().thinkingAgents[conversationId] ?? [];
      const stillThinking = thinking.find((t) => t.messageId === messageId);

      console.log("[stream_end]", {
        conversationId,
        messageId,
        reason: event.reason ?? "unknown",
        agentName: stillThinking?.agentName ?? "unknown",
        timestamp: new Date().toISOString(),
      });
      if (stillThinking) {
        if (finalContent) {
          const agentMsg: Message = {
            id: messageId,
            conversationId,
            seq: stillThinking.seq,
            role: "agent",
            content: finalContent,
            status: "completed",
            senderAgentId: stillThinking.agentId || undefined,
            senderAgentName: stillThinking.agentName,
            threadId: threadId ?? undefined,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          if (threadId) {
            const threadMsgs = get().threadMessages[threadId] ?? [];
            set({
              threadMessages: {
                ...get().threadMessages,
                [threadId]: [...threadMsgs, agentMsg],
              },
              thinkingAgents: {
                ...get().thinkingAgents,
                [conversationId]: thinking.filter((t) => t.messageId !== messageId),
              },
            });
          } else {
            const current = get().messagesByConversation[conversationId] ?? [];
            set({
              messagesByConversation: {
                ...get().messagesByConversation,
                [conversationId]: [...current, agentMsg],
              },
              thinkingAgents: {
                ...get().thinkingAgents,
                [conversationId]: thinking.filter((t) => t.messageId !== messageId),
              },
              conversations: get().conversations.map((c) =>
                c.id === conversationId
                  ? { ...c, lastMessage: agentMsg, updatedAt: new Date() }
                  : c
              ),
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
          }
          if (conversationId === activeConversationId && seq > 0) {
            wsManager.send({ type: "mark_read", conversationId, seq });
          }
        } else {
          set({
            thinkingAgents: {
              ...get().thinkingAgents,
              [conversationId]: thinking.filter((t) => t.messageId !== messageId),
            },
          });
        }
        return;
      }

      // Message already exists from chunks — update status
      if (threadId) {
        const threadMsgs = get().threadMessages[threadId] ?? [];
        const threadMsg = threadMsgs.find((m) => m.id === messageId);

        if (!threadMsg) {
          // Message was cleared from store (conversation switch / reconnect).
          // Re-insert as a completed message so it doesn't vanish.
          if (finalContent) {
            const agentMsg: Message = {
              id: messageId,
              conversationId,
              seq: seq ?? 0,
              role: "agent",
              content: finalContent,
              status: "completed",
              threadId,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            set({
              threadMessages: {
                ...get().threadMessages,
                [threadId]: [...threadMsgs, agentMsg],
              },
            });
          }
        } else {
          const shouldReplaceThreadContent =
            !!finalContent &&
            finalContent !== threadMsg.content;
          set({
            threadMessages: {
              ...get().threadMessages,
              [threadId]: threadMsgs.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      ...(shouldReplaceThreadContent ? { content: finalContent } : {}),
                      status: m.status === "cancelled" ? ("cancelled" as const) : ("completed" as const),
                      updatedAt: new Date(),
                    }
                  : m
              ),
            },
          });
        }
      } else {
        const current = get().messagesByConversation[conversationId] ?? [];
        const completedMsg = current.find((m) => m.id === messageId);

        if (!completedMsg) {
          // Message was cleared from store (conversation switch / reconnect).
          // Re-insert as a completed message so it doesn't vanish.
          if (finalContent) {
            const agentMsg: Message = {
              id: messageId,
              conversationId,
              seq: seq ?? 0,
              role: "agent",
              content: finalContent,
              status: "completed",
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            set({
              messagesByConversation: {
                ...get().messagesByConversation,
                [conversationId]: [...current, agentMsg],
              },
              conversations: get().conversations.map((c) =>
                c.id === conversationId
                  ? { ...c, lastMessage: agentMsg, updatedAt: new Date() }
                  : c
              ),
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
          }
        } else {
          // Only replace content if finalContent actually differs from the
          // streamed accumulation AND is non-empty. Never overwrite accumulated
          // content with an empty string from a backend that didn't echo final text.
          const shouldReplaceContent =
            !!finalContent &&
            finalContent !== completedMsg.content;

          set({
            messagesByConversation: {
              ...get().messagesByConversation,
              [conversationId]: current.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      ...(shouldReplaceContent ? { content: finalContent } : {}),
                      status: m.status === "cancelled" ? ("cancelled" as const) : ("completed" as const),
                      updatedAt: new Date(),
                    }
                  : m
              ),
            },
            conversations: get().conversations.map((c) =>
              c.id === conversationId
                ? {
                    ...c,
                    lastMessage: {
                      ...completedMsg,
                      ...(shouldReplaceContent ? { content: finalContent } : {}),
                      status: "completed" as const,
                      updatedAt: new Date(),
                    },
                    updatedAt: new Date(),
                  }
                : c
            ),
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
        }
      }

      if (conversationId === activeConversationId && seq > 0) {
        wsManager.send({
          type: "mark_read",
          conversationId,
          seq,
        });
      }

      // Safety cleanup: ensure this messageId is removed from thinkingAgents
      const thinkingAfter = get().thinkingAgents[conversationId] ?? [];
      if (thinkingAfter.some((t) => t.messageId === messageId)) {
        set({
          thinkingAgents: {
            ...get().thinkingAgents,
            [conversationId]: thinkingAfter.filter((t) => t.messageId !== messageId),
          },
        });
      }

      // Safety cleanup: clear stale queued message indicators when no thinking agents remain
      const remainingThinking = get().thinkingAgents[conversationId] ?? [];
      if (!remainingThinking.some((t) => t.queued)) {
        const prevQueued = get().queuedMessageIds[conversationId];
        if (prevQueued && prevQueued.size > 0) {
          set({
            queuedMessageIds: {
              ...get().queuedMessageIds,
              [conversationId]: new Set<string>(),
            },
          });
        }
      }
      return;
    }

    if (event.type === "stream_error") {
      const { conversationId, messageId, error } = event;
      const threadId = event.threadId;

      // Check if still in thinkingAgents (no chunks ever arrived)
      const thinking = get().thinkingAgents[conversationId] ?? [];
      const stillThinking = thinking.find((t) => t.messageId === messageId);
      if (stillThinking) {
        const errorMsg: Message = {
          id: messageId,
          conversationId,
          seq: stillThinking.seq,
          role: "agent",
          content: error,
          status: "error",
          senderAgentId: stillThinking.agentId || undefined,
          senderAgentName: stillThinking.agentName,
          threadId: threadId ?? undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        if (threadId) {
          const threadMsgs = get().threadMessages[threadId] ?? [];
          set({
            threadMessages: {
              ...get().threadMessages,
              [threadId]: [...threadMsgs, errorMsg],
            },
            thinkingAgents: {
              ...get().thinkingAgents,
              [conversationId]: thinking.filter((t) => t.messageId !== messageId),
            },
          });
        } else {
          const current = get().messagesByConversation[conversationId] ?? [];
          set({
            messagesByConversation: {
              ...get().messagesByConversation,
              [conversationId]: [...current, errorMsg],
            },
            thinkingAgents: {
              ...get().thinkingAgents,
              [conversationId]: thinking.filter((t) => t.messageId !== messageId),
            },
          });
        }
        return;
      }

      // Message exists: update with error
      if (threadId) {
        const threadMsgs = get().threadMessages[threadId] ?? [];
        set({
          threadMessages: {
            ...get().threadMessages,
            [threadId]: threadMsgs.map((m) =>
              m.id === messageId
                ? { ...m, content: error, status: "error" as const }
                : m
            ),
          },
        });
      } else {
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
      }

      // Safety cleanup: clear stale queued message indicators when no thinking agents remain
      const remainingThinkingErr = get().thinkingAgents[conversationId] ?? [];
      if (!remainingThinkingErr.some((t) => t.queued)) {
        const prevQueuedErr = get().queuedMessageIds[conversationId];
        if (prevQueuedErr && prevQueuedErr.size > 0) {
          set({
            queuedMessageIds: {
              ...get().queuedMessageIds,
              [conversationId]: new Set<string>(),
            },
          });
        }
      }
      return;
    }

    if (event.type === "reaction_added") {
      const { messageId, emoji } = event;
      const reactions = { ...get().reactionsByMessage };
      const msgReactions = { ...(reactions[messageId] ?? {}) };
      const existing = msgReactions[emoji];
      msgReactions[emoji] = {
        count: (existing?.count ?? 0) + 1,
        userReacted: existing?.userReacted ?? false,
      };
      reactions[messageId] = msgReactions;
      set({ reactionsByMessage: reactions });
      return;
    }

    if (event.type === "reaction_removed") {
      const { messageId, emoji } = event;
      const reactions = { ...get().reactionsByMessage };
      const msgReactions = { ...(reactions[messageId] ?? {}) };
      const existing = msgReactions[emoji];
      if (existing) {
        if (existing.count <= 1) {
          delete msgReactions[emoji];
        } else {
          msgReactions[emoji] = { ...existing, count: existing.count - 1 };
        }
        reactions[messageId] = msgReactions;
        set({ reactionsByMessage: reactions });
      }
      return;
    }

    if (event.type === "note:created") {
      const { conversationId, note } = event;
      const current = get().notesByConversation[conversationId] ?? [];
      // Don't add duplicate
      if (!current.some((n) => n.id === note.id)) {
        set({
          notesByConversation: {
            ...get().notesByConversation,
            [conversationId]: [note, ...current],
          },
        });
      }
      return;
    }

    if (event.type === "note:updated") {
      const { conversationId, note } = event;
      const current = get().notesByConversation[conversationId] ?? [];
      set({
        notesByConversation: {
          ...get().notesByConversation,
          [conversationId]: current.map((n) =>
            n.id === note.id ? note : n
          ),
        },
      });
      return;
    }

    if (event.type === "note:deleted") {
      const { conversationId, noteId } = event;
      const current = get().notesByConversation[conversationId] ?? [];
      set({
        notesByConversation: {
          ...get().notesByConversation,
          [conversationId]: current.filter((n) => n.id !== noteId),
        },
      });
      return;
    }

    if (event.type === "kicked_from_group") {
      const convId = event.conversationId;
      const { activeConversationId, messagesByConversation, thinkingAgents } = get();
      const newMessages = { ...messagesByConversation };
      delete newMessages[convId];
      const newThinking = { ...thinkingAgents };
      delete newThinking[convId];
      set({
        conversations: get().conversations.filter((c) => c.id !== convId),
        activeConversationId:
          activeConversationId === convId ? null : activeConversationId,
        messagesByConversation: newMessages,
        thinkingAgents: newThinking,
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
                senderUserId: (m as unknown as Record<string, unknown>).senderUserId as string | undefined,
                attachments: ((m as unknown as Record<string, unknown>).attachments as Array<Record<string, unknown>> | undefined)?.map((att) => ({
                  id: att.id as string,
                  messageId: att.messageId as string,
                  fileName: att.fileName as string,
                  fileType: att.fileType as string,
                  fileSize: att.fileSize as number,
                  url: att.url as string,
                  duration: att.duration as number | undefined,
                  createdAt: new Date(att.createdAt as string),
                })) ?? [],
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
      // Clear stale thinking indicators — if stream completed while
      // disconnected, thinkingAgents entries won't get cleaned up by
      // the missed stream_end/stream_error. Active streams will
      // re-create entries from subsequent stream_chunk events.
      set({
        conversations: updatedConversations,
        messagesByConversation: newMessagesByConv,
        unreadCounts: newUnreadCounts,
        mutedConversations: newMuted,
        thinkingAgents: {},
      });

      // HTTP fallback: pull latest messages for the active conversation
      // to cover any gaps the WS sync may have missed (e.g. long offline)
      const activeId = get().activeConversationId;
      if (activeId) {
        const activeMessages = newMessagesByConv[activeId] ?? [];
        const lastMsg = activeMessages[activeMessages.length - 1];
        if (lastMsg) {
          api<{ messages: Message[]; hasMoreDown: boolean }>(
            `/api/conversations/${activeId}/messages?after=${lastMsg.id}&limit=50`
          )
            .then((data) => {
              if (data.messages.length > 0) {
                const store = get();
                const current = store.messagesByConversation[activeId] ?? [];
                const existingIds = new Set(current.map((m) => m.id));
                const fresh = data.messages.filter((m) => !existingIds.has(m.id));
                if (fresh.length > 0) {
                  set({
                    messagesByConversation: {
                      ...store.messagesByConversation,
                      [activeId]: [...current, ...fresh].sort((a, b) => {
                        if (a.seq && b.seq) return a.seq - b.seq;
                        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                      }),
                    },
                  });
                }
              }
            })
            .catch(() => {});
        }
      }
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
