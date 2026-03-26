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
  coverImageUrl: string | null;
  // Official-specific
  isPublic: boolean;
  category: string | null;
  welcomeEnabled: boolean;
  welcomeMessage: string | null;
  autoReplyMode: string | null;
  autoReplySystemPrompt: string | null;
  autoReplyWebhookUrl: string | null;
  // Lounge-specific
  personaCatchphrase: string | null;
  personaTone: string | null;
  personaPersonality: string | null;
  personaTemplate: string | null;
  personaAge: number | null;
  personaInterests: string | null;
  personaBackstory: string | null;
  personaIntro: string | null;
  personaForbiddenTopics: string | null;
  pricingMode: string | null;
  pricingAmount: number | null;
  freeTrialMessages: number | null;
  voiceModelStatus: string | null;
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

export interface DiaryEntry {
  id: string;
  date: string;
  content: string;
  imageUrl: string | null;
  isImportant: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GiftCatalogItem {
  id: string;
  name: string;
  icon: string;
  price: number;
  category: string | null;
  sortOrder: number;
}

export interface FanEntry {
  userId: string;
  userName: string;
  userImage: string | null;
  level: number;
  totalSpent: number;
  totalMessages: number;
  updatedAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  userImage: string | null;
  totalGifted: number;
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
  subscribe: (accountId: string) => Promise<{ conversationId?: string }>;
  unsubscribe: (accountId: string) => Promise<void>;

  // Lounge: Diaries
  loadDiaries: (accountId: string) => Promise<DiaryEntry[]>;
  createDiary: (accountId: string, data: { content: string; date?: string; imageUrl?: string; isImportant?: boolean }) => Promise<DiaryEntry>;
  updateDiary: (accountId: string, diaryId: string, data: Partial<DiaryEntry>) => Promise<void>;
  deleteDiary: (accountId: string, diaryId: string) => Promise<void>;

  // Lounge: Preview
  sendPreviewMessage: (accountId: string, content: string) => Promise<unknown>;
  loadPreviewMessages: (accountId: string) => Promise<unknown[]>;
  clearPreview: (accountId: string) => Promise<void>;

  // Gift catalog + tokens
  loadGiftCatalog: () => Promise<GiftCatalogItem[]>;
  sendGiftV2: (toAccountId: string, giftId: string, quantity?: number, message?: string) => Promise<{ newBalance: number }>;
  getTokenBalance: () => Promise<number>;
  topupTokens: (amount: number) => Promise<number>;

  // Fans
  loadFans: (accountId: string) => Promise<FanEntry[]>;
  loadLeaderboard: (accountId: string) => Promise<LeaderboardEntry[]>;
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
    return api<{ conversationId?: string }>(`/api/accounts/${accountId}/subscribe`, { method: "POST" });
  },

  unsubscribe: async (accountId) => {
    await api(`/api/accounts/${accountId}/subscribe`, { method: "DELETE" });
  },

  // Lounge: Diaries
  loadDiaries: async (accountId) => {
    const res = await api<DiaryEntry[] | { diaries: DiaryEntry[] }>(`/api/accounts/${accountId}/diaries`);
    return Array.isArray(res) ? res : (res?.diaries ?? []);
  },
  createDiary: async (accountId, data) => {
    return api<DiaryEntry>(`/api/accounts/${accountId}/diaries`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  updateDiary: async (accountId, diaryId, data) => {
    await api(`/api/accounts/${accountId}/diaries/${diaryId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  },
  deleteDiary: async (accountId, diaryId) => {
    await api(`/api/accounts/${accountId}/diaries/${diaryId}`, { method: "DELETE" });
  },

  // Lounge: Preview
  sendPreviewMessage: async (accountId, content) => {
    return api(`/api/accounts/${accountId}/preview`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
  },
  loadPreviewMessages: async (accountId) => {
    const res = await api<{ messages: unknown[] }>(`/api/accounts/${accountId}/preview/messages`);
    return res?.messages ?? [];
  },
  clearPreview: async (accountId) => {
    await api(`/api/accounts/${accountId}/preview`, { method: "DELETE" });
  },

  // Gift catalog + tokens
  loadGiftCatalog: async () => {
    const res = await api<GiftCatalogItem[] | { gifts: GiftCatalogItem[] }>("/api/gifts/catalog");
    return Array.isArray(res) ? res : (res?.gifts ?? []);
  },
  sendGiftV2: async (toAccountId, giftId, quantity, message) => {
    return api<{ newBalance: number }>("/api/gifts/send", {
      method: "POST",
      body: JSON.stringify({ toAccountId, giftId, quantity: quantity ?? 1, message }),
    });
  },
  getTokenBalance: async () => {
    const res = await api<{ balance: number }>("/api/tokens/balance");
    return res?.balance ?? 0;
  },
  topupTokens: async (amount) => {
    const res = await api<{ balance: number }>("/api/tokens/topup", {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
    return res?.balance ?? 0;
  },

  // Fans
  loadFans: async (accountId) => {
    const res = await api<FanEntry[] | { fans: FanEntry[] }>(`/api/accounts/${accountId}/fans`);
    return Array.isArray(res) ? res : (res?.fans ?? []);
  },
  loadLeaderboard: async (accountId) => {
    const res = await api<LeaderboardEntry[] | { leaderboard: LeaderboardEntry[] }>(`/api/accounts/${accountId}/gifts/leaderboard`);
    return Array.isArray(res) ? res : (res?.leaderboard ?? []);
  },
}));
