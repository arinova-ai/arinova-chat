import { create } from "zustand";
import type {
  Space,
  SpaceSession,
  SpaceParticipant,
  SpaceCategory,
} from "@arinova/shared/types";
import { api } from "@/lib/api";

interface SpaceWithOwner extends Space {
  owner?: { id: string; name: string; image: string | null };
  sessions?: (SpaceSession & { participantCount: number })[];
}

interface SpacesListResponse {
  spaces: Space[];
  total: number;
  page: number;
  totalPages: number;
}

export type PipMode = "fullscreen" | "pip";

interface SpacesState {
  // List
  spaces: Space[];
  loading: boolean;
  error: boolean;
  page: number;
  totalPages: number;
  search: string;
  category: string;

  // Detail
  currentSpace: SpaceWithOwner | null;
  detailLoading: boolean;

  // PIP (Picture-in-Picture)
  pipMode: PipMode | null;
  pipIframeUrl: string | null;
  pipGameId: string | null;
  pipGameName: string | null;
  pipAppId: string | null;
  pipBtnPos: { x: number; y: number } | null;

  // Actions
  fetchSpaces: () => Promise<void>;
  setSearch: (q: string) => void;
  setCategory: (cat: string) => void;
  setPage: (p: number) => void;
  fetchSpaceDetail: (id: string) => Promise<void>;
  createSpace: (data: {
    name: string;
    description: string;
    category: SpaceCategory;
    tags?: string[];
  }) => Promise<Space>;
  deleteSpace: (id: string) => Promise<void>;
  createSession: (spaceId: string) => Promise<SpaceSession>;
  joinSession: (
    spaceId: string,
    sessionId: string,
    agentId?: string
  ) => Promise<SpaceParticipant>;
  leaveSession: (spaceId: string, sessionId: string) => Promise<void>;

  // PIP Actions
  openPip: (gameId: string, gameName: string, iframeUrl: string, appId?: string) => void;
  closePip: () => void;
  setPipMode: (mode: PipMode) => void;
  togglePipMode: () => void;
  setPipBtnPos: (pos: { x: number; y: number }) => void;
}

export const useSpacesStore = create<SpacesState>((set, get) => ({
  spaces: [],
  loading: false,
  error: false,
  page: 1,
  totalPages: 1,
  search: "",
  category: "All",
  currentSpace: null,
  detailLoading: false,

  // PIP
  pipMode: null,
  pipIframeUrl: null,
  pipGameId: null,
  pipGameName: null,
  pipAppId: null,
  pipBtnPos: null,

  fetchSpaces: async () => {
    set({ loading: true, error: false });
    try {
      const { search, category, page } = get();
      const params = new URLSearchParams();
      if (category !== "All") params.set("category", category.toLowerCase());
      if (search.trim()) params.set("search", search.trim());
      params.set("page", String(page));

      const data = await api<SpacesListResponse>(
        `/api/spaces?${params.toString()}`
      );
      set({
        spaces: data.spaces,
        totalPages: data.totalPages,
        page: data.page,
      });
    } catch {
      set({ error: true });
    } finally {
      set({ loading: false });
    }
  },

  setSearch: (q) => {
    set({ search: q, page: 1 });
  },

  setCategory: (cat) => {
    set({ category: cat, page: 1 });
  },

  setPage: (p) => {
    set({ page: p });
  },

  fetchSpaceDetail: async (id) => {
    set({ detailLoading: true, currentSpace: null });
    try {
      const data = await api<SpaceWithOwner>(`/api/spaces/${id}`);
      set({ currentSpace: data });
    } catch {
      // handled by api()
    } finally {
      set({ detailLoading: false });
    }
  },

  createSpace: async (data) => {
    const space = await api<Space>("/api/spaces", {
      method: "POST",
      body: JSON.stringify(data),
    });
    // Refresh list
    get().fetchSpaces();
    return space;
  },

  deleteSpace: async (id) => {
    await api(`/api/spaces/${id}`, { method: "DELETE" });
    set({ currentSpace: null });
    get().fetchSpaces();
  },

  createSession: async (spaceId) => {
    const session = await api<SpaceSession & { participantCount: number }>(
      `/api/spaces/${spaceId}/sessions`,
      { method: "POST" }
    );
    // Refresh detail
    get().fetchSpaceDetail(spaceId);
    return session;
  },

  joinSession: async (spaceId, sessionId, agentId) => {
    const participant = await api<SpaceParticipant>(
      `/api/spaces/${spaceId}/sessions/${sessionId}/join`,
      {
        method: "POST",
        body: JSON.stringify({ agentId }),
      }
    );
    // Refresh detail
    get().fetchSpaceDetail(spaceId);
    return participant;
  },

  leaveSession: async (spaceId, sessionId) => {
    await api(`/api/spaces/${spaceId}/sessions/${sessionId}/leave`, {
      method: "POST",
    });
    // Refresh detail
    get().fetchSpaceDetail(spaceId);
  },

  // PIP Actions
  openPip: (gameId, gameName, iframeUrl, appId) => {
    set({
      pipMode: "fullscreen",
      pipGameId: gameId,
      pipGameName: gameName,
      pipIframeUrl: iframeUrl,
      pipAppId: appId ?? null,
    });
  },

  closePip: () => {
    set({
      pipMode: null,
      pipGameId: null,
      pipGameName: null,
      pipIframeUrl: null,
      pipAppId: null,
      pipBtnPos: null,
    });
  },

  setPipMode: (mode) => {
    set({ pipMode: mode });
  },

  togglePipMode: () => {
    set((s) => ({
      pipMode: s.pipMode === "fullscreen" ? "pip" : "fullscreen",
    }));
  },

  setPipBtnPos: (pos) => {
    set({ pipBtnPos: pos });
  },
}));
