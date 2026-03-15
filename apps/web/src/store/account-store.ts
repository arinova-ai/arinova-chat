import { create } from "zustand";
import { api } from "@/lib/api";

export interface Account {
  id: string;
  ownerId: string;
  type: "official" | "lounge";
  name: string;
  avatar: string | null;
  bio: string | null;
  agentId: string | null;
  proxyUserId: string | null;
  aiMode: string;
  systemPrompt: string | null;
  apiKey: string | null;
  model: string | null;
  contextWindow: number;
  voiceSampleUrl: string | null;
  voiceCloneId: string | null;
  // Official-specific
  isPublic: boolean;
  category: string | null;
  welcomeEnabled: boolean;
  welcomeMessage: string | null;
  autoReplyMode: string | null;
  autoReplySystemPrompt: string | null;
  autoReplyWebhookUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountSubscriber {
  id: string;
  userId: string;
  userName: string;
  userImage: string | null;
  subscribedAt: string;
}

export interface GiftReport {
  giftType: string;
  count: number;
  totalAmount: number;
}

export interface AnalyticsData {
  subscriberCount: number;
  totalGifts: number;
  totalGiftAmount: number;
  conversationCount: number;
  dailyStats: Array<{
    date: string;
    subscribers: number;
    gifts: number;
    conversations: number;
  }>;
}

export interface AccountConversation {
  id: string;
  title: string | null;
  type: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

interface AccountState {
  accounts: Account[];
  activeAccountId: string | null;
  accountConversations: AccountConversation[];
  loading: boolean;

  // Actions
  loadAccounts: () => Promise<void>;
  createAccount: (data: {
    name: string;
    type: "official" | "lounge";
    avatar?: string;
    bio?: string;
    agentId?: string;
  }) => Promise<Account>;
  updateAccount: (id: string, data: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  setActiveAccount: (id: string | null) => void;
  loadAccountConversations: (accountId: string) => Promise<void>;

  // Subscribers
  loadSubscribers: (accountId: string) => Promise<AccountSubscriber[]>;

  // Broadcast
  broadcast: (accountId: string, content: string) => Promise<void>;

  // Voice
  uploadVoiceSample: (accountId: string, url: string) => Promise<void>;

  // Gifts
  sendGift: (
    accountId: string,
    giftType: string,
    amount: number,
    message?: string,
  ) => Promise<void>;
  loadGiftReport: (accountId: string) => Promise<GiftReport[]>;

  // Analytics
  loadAnalytics: (accountId: string) => Promise<AnalyticsData>;

  // Subscribe/Unsubscribe (as a user, not as owner)
  subscribe: (accountId: string) => Promise<void>;
  unsubscribe: (accountId: string) => Promise<void>;
}

const stored =
  typeof window !== "undefined"
    ? localStorage.getItem("activeAccountId")
    : null;

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  activeAccountId: stored,
  accountConversations: [],
  loading: false,

  loadAccounts: async () => {
    set({ loading: true });
    try {
      const accounts = await api<Account[]>("/api/accounts");
      set({ accounts });
    } finally {
      set({ loading: false });
    }
  },

  createAccount: async (data) => {
    const account = await api<Account>("/api/accounts", {
      method: "POST",
      body: JSON.stringify(data),
    });
    set((s) => ({ accounts: [account, ...s.accounts] }));
    return account;
  },

  updateAccount: async (id, data) => {
    await api(`/api/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    set((s) => ({
      accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...data } : a)),
    }));
  },

  deleteAccount: async (id) => {
    await api(`/api/accounts/${id}`, { method: "DELETE" });
    set((s) => ({
      accounts: s.accounts.filter((a) => a.id !== id),
      activeAccountId: s.activeAccountId === id ? null : s.activeAccountId,
    }));
    if (get().activeAccountId === null) {
      localStorage.removeItem("activeAccountId");
    }
  },

  setActiveAccount: (id) => {
    set({ activeAccountId: id, accountConversations: [] });
    if (id) {
      localStorage.setItem("activeAccountId", id);
      get().loadAccountConversations(id);
    } else {
      localStorage.removeItem("activeAccountId");
    }
  },

  loadAccountConversations: async (accountId) => {
    try {
      const convs = await api<AccountConversation[]>(`/api/accounts/${accountId}/conversations`);
      set({ accountConversations: convs });
    } catch {
      set({ accountConversations: [] });
    }
  },

  loadSubscribers: async (accountId) => {
    const res = await api<AccountSubscriber[] | { subscribers: AccountSubscriber[] }>(
      `/api/accounts/${accountId}/subscribers`,
    );
    return Array.isArray(res) ? res : (res?.subscribers ?? []);
  },

  broadcast: async (accountId, content) => {
    await api(`/api/accounts/${accountId}/broadcast`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  },

  uploadVoiceSample: async (accountId, url) => {
    await api(`/api/accounts/${accountId}/voice-sample`, {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  },

  sendGift: async (accountId, giftType, amount, message) => {
    await api(`/api/accounts/${accountId}/gifts`, {
      method: "POST",
      body: JSON.stringify({ giftType, amount, message }),
    });
  },

  loadGiftReport: async (accountId) => {
    return api<GiftReport[]>(`/api/accounts/${accountId}/gifts`);
  },

  loadAnalytics: async (accountId) => {
    return api<AnalyticsData>(`/api/accounts/${accountId}/analytics`);
  },

  subscribe: async (accountId) => {
    await api(`/api/accounts/${accountId}/subscribe`, { method: "POST" });
  },

  unsubscribe: async (accountId) => {
    await api(`/api/accounts/${accountId}/subscribe`, { method: "DELETE" });
  },
}));
