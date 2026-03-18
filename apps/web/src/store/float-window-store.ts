import { create } from "zustand";

export interface FloatWindowEntry {
  agentId: string;
  agentName?: string;
  agentAvatar?: string | null;
}

interface FloatWindowState {
  /** Currently open float windows (ordered) */
  windows: FloatWindowEntry[];
  /** Open a float chat window for an agent (no-op if already open) */
  open: (entry: FloatWindowEntry) => void;
  /** Close a specific float window */
  close: (agentId: string) => void;
  /** Close all float windows */
  closeAll: () => void;
}

export const useFloatWindowStore = create<FloatWindowState>((set, get) => ({
  windows: [],

  open: (entry) => {
    const existing = get().windows;
    if (existing.some((w) => w.agentId === entry.agentId)) return;
    set({ windows: [...existing, entry] });
  },

  close: (agentId) => {
    set({ windows: get().windows.filter((w) => w.agentId !== agentId) });
  },

  closeAll: () => {
    set({ windows: [] });
  },
}));
