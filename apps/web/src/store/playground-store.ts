import { create } from "zustand";
import type {
  Playground,
  PlaygroundSession,
  PlaygroundParticipant,
  PlaygroundCategory,
  PlaygroundWSServerEvent,
  PlaygroundParticipantControlMode,
} from "@arinova/shared/types";
import { api } from "@/lib/api";

interface PlaygroundListItem extends Playground {
  activeSession?: {
    id: string;
    status: string;
    currentPhase: string | null;
    participantCount: number;
    createdAt: string;
  } | null;
}

interface PlaygroundDetail extends Playground {
  activeSession: {
    id: string;
    status: string;
    currentPhase: string | null;
    participantCount: number;
    createdAt: string;
  } | null;
}

interface SessionDetail extends PlaygroundSession {
  participants: PlaygroundParticipant[];
  myParticipantId: string | null;
  myRole: string | null;
}

interface TemplateItem {
  slug: string;
  name: string;
  description: string;
  category: PlaygroundCategory;
  minPlayers: number;
  maxPlayers: number;
}

interface PlaygroundState {
  // List
  playgrounds: PlaygroundListItem[];
  playgroundsLoading: boolean;
  playgroundsPage: number;
  playgroundsTotal: number;
  searchQuery: string;
  categoryFilter: PlaygroundCategory | null;

  // Detail
  activePlayground: PlaygroundDetail | null;
  activePlaygroundLoading: boolean;

  // Session
  activeSession: SessionDetail | null;
  activeSessionLoading: boolean;

  // Templates
  templates: TemplateItem[];
  templatesLoading: boolean;

  // WebSocket
  wsConnected: boolean;

  // Actions — List
  loadPlaygrounds: (page?: number) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setCategoryFilter: (category: PlaygroundCategory | null) => void;

  // Actions — Detail
  loadPlayground: (id: string) => Promise<void>;
  clearActivePlayground: () => void;
  deletePlayground: (id: string) => Promise<void>;

  // Actions — Session
  createSession: (playgroundId: string, agentId?: string, controlMode?: PlaygroundParticipantControlMode) => Promise<SessionDetail>;
  joinSession: (playgroundId: string, sessionId: string, agentId?: string, controlMode?: PlaygroundParticipantControlMode) => Promise<void>;
  leaveSession: (playgroundId: string, sessionId: string) => Promise<void>;
  startSession: (playgroundId: string, sessionId: string) => Promise<void>;
  loadSession: (playgroundId: string, sessionId: string) => Promise<void>;
  clearActiveSession: () => void;

  // Actions — Templates
  loadTemplates: () => Promise<void>;
  deployTemplate: (slug: string) => Promise<Playground>;

  // Actions — WebSocket
  handleWSEvent: (event: PlaygroundWSServerEvent) => void;
}

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
  // Initial state
  playgrounds: [],
  playgroundsLoading: false,
  playgroundsPage: 1,
  playgroundsTotal: 0,
  searchQuery: "",
  categoryFilter: null,

  activePlayground: null,
  activePlaygroundLoading: false,

  activeSession: null,
  activeSessionLoading: false,

  templates: [],
  templatesLoading: false,

  wsConnected: false,

  // --- List ---
  loadPlaygrounds: async (page = 1) => {
    set({ playgroundsLoading: true });
    try {
      const { searchQuery, categoryFilter } = get();
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (searchQuery) params.set("search", searchQuery);
      if (categoryFilter) params.set("category", categoryFilter);

      const res = await api<{
        items: PlaygroundListItem[];
        pagination: { page: number; total: number };
      }>(`/api/playgrounds?${params}`);

      set({
        playgrounds: res.items,
        playgroundsPage: res.pagination.page,
        playgroundsTotal: res.pagination.total,
      });
    } finally {
      set({ playgroundsLoading: false });
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  setCategoryFilter: (category) => set({ categoryFilter: category }),

  // --- Detail ---
  loadPlayground: async (id) => {
    set({ activePlaygroundLoading: true });
    try {
      const playground = await api<PlaygroundDetail>(`/api/playgrounds/${id}`);
      set({ activePlayground: playground });
    } finally {
      set({ activePlaygroundLoading: false });
    }
  },

  clearActivePlayground: () => set({ activePlayground: null }),

  deletePlayground: async (id) => {
    await api(`/api/playgrounds/${id}`, { method: "DELETE" });
    set((s) => ({
      playgrounds: s.playgrounds.filter((p) => p.id !== id),
      activePlayground: s.activePlayground?.id === id ? null : s.activePlayground,
    }));
  },

  // --- Session ---
  createSession: async (playgroundId, agentId, controlMode) => {
    const body: Record<string, string> = {};
    if (agentId) body.agentId = agentId;
    if (controlMode) body.controlMode = controlMode;

    const session = await api<SessionDetail>(
      `/api/playgrounds/${playgroundId}/sessions`,
      { method: "POST", body: JSON.stringify(body) },
    );
    set({ activeSession: session });
    return session;
  },

  joinSession: async (playgroundId, sessionId, agentId, controlMode) => {
    const body: Record<string, string> = {};
    if (agentId) body.agentId = agentId;
    if (controlMode) body.controlMode = controlMode;

    await api(
      `/api/playgrounds/${playgroundId}/sessions/${sessionId}/join`,
      { method: "POST", body: JSON.stringify(body) },
    );
    // Reload session to get updated participants
    await get().loadSession(playgroundId, sessionId);
  },

  leaveSession: async (playgroundId, sessionId) => {
    await api(
      `/api/playgrounds/${playgroundId}/sessions/${sessionId}/leave`,
      { method: "POST" },
    );
    set({ activeSession: null });
  },

  startSession: async (playgroundId, sessionId) => {
    await api(
      `/api/playgrounds/${playgroundId}/sessions/${sessionId}/start`,
      { method: "POST" },
    );
    await get().loadSession(playgroundId, sessionId);
  },

  loadSession: async (playgroundId, sessionId) => {
    set({ activeSessionLoading: true });
    try {
      const session = await api<SessionDetail>(
        `/api/playgrounds/${playgroundId}/sessions/${sessionId}`,
      );
      set({ activeSession: session });
    } finally {
      set({ activeSessionLoading: false });
    }
  },

  clearActiveSession: () => set({ activeSession: null }),

  // --- Templates ---
  loadTemplates: async () => {
    set({ templatesLoading: true });
    try {
      const templates = await api<TemplateItem[]>("/api/playgrounds/templates");
      set({ templates });
    } finally {
      set({ templatesLoading: false });
    }
  },

  deployTemplate: async (slug) => {
    const playground = await api<Playground>(
      `/api/playgrounds/templates/${slug}/deploy`,
      { method: "POST" },
    );
    // Reload list
    get().loadPlaygrounds(1);
    return playground;
  },

  // --- WebSocket ---
  handleWSEvent: (event) => {
    const { activeSession } = get();
    if (!activeSession) return;

    switch (event.type) {
      case "pg_state_update":
        set({
          activeSession: {
            ...activeSession,
            state: event.state,
            currentPhase: event.currentPhase ?? activeSession.currentPhase,
          },
        });
        break;
      case "pg_phase_transition":
        set({
          activeSession: {
            ...activeSession,
            currentPhase: event.to,
          },
        });
        break;
      case "pg_participant_joined":
        set({
          activeSession: {
            ...activeSession,
            participants: [...activeSession.participants, event.participant],
          },
        });
        break;
      case "pg_participant_left":
        set({
          activeSession: {
            ...activeSession,
            participants: activeSession.participants.filter(
              (p) => p.id !== event.participantId,
            ),
          },
        });
        break;
      case "pg_session_started": {
        // Update participant roles from the role assignment map
        const updatedParticipants = activeSession.participants.map((p) => ({
          ...p,
          role: event.roles[p.id] ?? p.role,
        }));
        const myRole = activeSession.myParticipantId
          ? event.roles[activeSession.myParticipantId] ?? activeSession.myRole
          : activeSession.myRole;
        set({
          activeSession: {
            ...activeSession,
            status: "active",
            currentPhase: event.phase,
            participants: updatedParticipants,
            myRole,
          },
        });
        break;
      }
      case "pg_session_finished":
        set({
          activeSession: {
            ...activeSession,
            status: "finished",
            state: {
              ...activeSession.state,
              winners: event.winners,
            },
          },
        });
        break;
    }
  },
}));
