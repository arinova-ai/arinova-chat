import { create } from "zustand";
import { api } from "@/lib/api";

export interface QuickShortcut {
  type: string;
  targetId?: string;
  url?: string;
  label: string;
  icon: string;
}

interface ShortcutState {
  shortcuts: QuickShortcut[];
  loaded: boolean;
  editing: boolean;

  fetchShortcuts: () => Promise<void>;
  addShortcut: (shortcut: QuickShortcut) => Promise<void>;
  removeShortcut: (index: number) => Promise<void>;
  setEditing: (v: boolean) => void;
}

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  shortcuts: [],
  loaded: false,
  editing: false,

  fetchShortcuts: async () => {
    try {
      const data = await api<{ shortcuts: QuickShortcut[] }>(
        "/api/user/shortcuts",
        { silent: true }
      );
      set({ shortcuts: data.shortcuts, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  addShortcut: async (shortcut) => {
    const next = [...get().shortcuts, shortcut];
    set({ shortcuts: next });
    try {
      await api("/api/user/shortcuts", {
        method: "PUT",
        body: JSON.stringify({ shortcuts: next }),
      });
    } catch {
      // revert on failure
      set({ shortcuts: get().shortcuts.filter((_, i) => i !== next.length - 1) });
    }
  },

  removeShortcut: async (index) => {
    const prev = get().shortcuts;
    const next = prev.filter((_, i) => i !== index);
    set({ shortcuts: next });
    try {
      await api("/api/user/shortcuts", {
        method: "PUT",
        body: JSON.stringify({ shortcuts: next }),
      });
    } catch {
      set({ shortcuts: prev });
    }
  },

  setEditing: (v) => set({ editing: v }),
}));
