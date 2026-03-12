import { create } from "zustand";
import { persist } from "zustand/middleware";

interface HeaderPinState {
  pinnedIds: string[];
  setPinnedIds: (ids: string[]) => void;
  togglePin: (id: string) => void;
}

export const useHeaderPinStore = create<HeaderPinState>()(
  persist(
    (set, get) => ({
      pinnedIds: ["search", "mute"],
      setPinnedIds: (ids) => set({ pinnedIds: ids }),
      togglePin: (id) => {
        const current = get().pinnedIds;
        if (current.includes(id)) {
          set({ pinnedIds: current.filter((x) => x !== id) });
        } else if (current.length < 5) {
          set({ pinnedIds: [...current, id] });
        }
      },
    }),
    { name: "arinova_header_pinned_buttons" }
  )
);
