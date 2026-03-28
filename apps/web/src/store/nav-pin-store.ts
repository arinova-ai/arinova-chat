import { create } from "zustand";

/**
 * IDs that are always visible in the icon rail (cannot be unpinned).
 */
export const DEFAULT_NAV_IDS = [
  "chat",
  "office",
  "agents",
  "friends",
  "community",
  "skills",
  "expert-hub",
  "market",
  "stickers",
] as const;

/**
 * IDs that are hidden by default but can be pinned by the user.
 */
export const PINNABLE_NAV_IDS = [
  "spaces",
  "explore-official",
  "explore-lounge",
  "theme",
  "creator",
  "wallet",
] as const;

const STORAGE_KEY = "arinova-nav-pins";

function loadPins(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function savePins(pins: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  } catch { /* ignore */ }
}

interface NavPinState {
  pinnedIds: string[];
  togglePin: (id: string) => void;
  isPinned: (id: string) => boolean;
}

export const useNavPinStore = create<NavPinState>((set, get) => ({
  pinnedIds: loadPins(),

  togglePin: (id) => {
    const prev = get().pinnedIds;
    const next = prev.includes(id)
      ? prev.filter((x) => x !== id)
      : [...prev, id];
    savePins(next);
    set({ pinnedIds: next });
  },

  isPinned: (id) => get().pinnedIds.includes(id),
}));
