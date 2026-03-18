import { create } from "zustand";

interface OfficePipState {
  /** Whether PiP mode is active */
  active: boolean;
  /** The iframe src URL to render in the PiP window */
  iframeSrc: string | null;
  /** Theme ID for reference */
  themeId: string | null;
  /** Enter PiP mode with the given iframe src */
  enter: (src: string, themeId: string) => void;
  /** Exit PiP mode */
  exit: () => void;
}

export const useOfficePipStore = create<OfficePipState>((set) => ({
  active: false,
  iframeSrc: null,
  themeId: null,

  enter: (src, themeId) => {
    set({ active: true, iframeSrc: src, themeId });
  },

  exit: () => {
    set({ active: false, iframeSrc: null, themeId: null });
  },
}));
