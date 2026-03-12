import { create } from "zustand";
import { api } from "@/lib/api";
import { GROUP_DEFAULT_PINS, GROUP_MAX_PINS } from "@/components/chat/chat-header-settings";

interface GroupPinState {
  /** conversationId → pinned button ids */
  pins: Record<string, string[]>;
  /** Load pins for a conversation from server */
  loadPins: (conversationId: string) => Promise<void>;
  /** Get pins for a conversation (returns default if not loaded) */
  getPins: (conversationId: string) => string[];
  /** Toggle a pin for a specific conversation */
  togglePin: (conversationId: string, id: string) => void;
  /** Set pins for a specific conversation */
  setPins: (conversationId: string, ids: string[]) => void;
}

export const useGroupPinStore = create<GroupPinState>()((set, get) => ({
  pins: {},

  loadPins: async (conversationId: string) => {
    try {
      const data = await api<{ pinnedButtons: string[] | null }>(
        `/api/conversations/${conversationId}/settings`,
        { silent: true }
      );
      if (data.pinnedButtons) {
        set((s) => ({ pins: { ...s.pins, [conversationId]: data.pinnedButtons! } }));
      }
    } catch {
      // Use defaults
    }
  },

  getPins: (conversationId: string) => {
    return get().pins[conversationId] ?? GROUP_DEFAULT_PINS;
  },

  togglePin: (conversationId: string, id: string) => {
    const current = get().getPins(conversationId);
    let next: string[];
    if (current.includes(id)) {
      next = current.filter((x) => x !== id);
    } else if (current.length < GROUP_MAX_PINS) {
      next = [...current, id];
    } else {
      return;
    }
    set((s) => ({ pins: { ...s.pins, [conversationId]: next } }));
    // Persist to server
    api(`/api/conversations/${conversationId}/settings`, {
      method: "PATCH",
      body: JSON.stringify({ pinnedButtons: next }),
      silent: true,
    }).catch(() => {});
  },

  setPins: (conversationId: string, ids: string[]) => {
    set((s) => ({ pins: { ...s.pins, [conversationId]: ids } }));
    api(`/api/conversations/${conversationId}/settings`, {
      method: "PATCH",
      body: JSON.stringify({ pinnedButtons: ids }),
      silent: true,
    }).catch(() => {});
  },
}));
