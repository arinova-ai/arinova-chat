import { create } from "zustand";
import type { Agent } from "@/components/office/types";

interface PipUser {
  id: string;
  name: string;
  username: string;
}

interface OfficePipState {
  /** Whether PiP mode is active */
  active: boolean;
  /** Theme ID for reference */
  themeId: string | null;
  /** Agents snapshot for ThemeIframe init */
  agents: Agent[];
  /** User snapshot for ThemeIframe init */
  user: PipUser | null;
  /** Enter PiP mode with theme + context data */
  enter: (themeId: string, agents: Agent[], user: PipUser) => void;
  /** Exit PiP mode */
  exit: () => void;
}

export const useOfficePipStore = create<OfficePipState>((set) => ({
  active: false,
  themeId: null,
  agents: [],
  user: null,

  enter: (themeId, agents, user) => {
    set({ active: true, themeId, agents, user });
  },

  exit: () => {
    set({ active: false, themeId: null, agents: [], user: null });
  },
}));
