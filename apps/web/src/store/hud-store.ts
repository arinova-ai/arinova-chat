import { create } from "zustand";

export interface HudData {
  context?: string;
  fiveHour?: string;
  fiveHourReset?: string;
  sevenDay?: string;
  sevenDayReset?: string;
  model?: string;
  cost?: string;
  raw?: string;
}

export interface HudShared {
  fiveHour?: string;
  fiveHourReset?: string;
  sevenDay?: string;
  sevenDayReset?: string;
}

interface HudStore {
  enabled: boolean;
  shared: HudShared;
  dataMap: Record<string, HudData>; // per-conversation (context + model)
  toggle: () => void;
  setEnabled: (v: boolean) => void;
  setData: (conversationId: string, data: HudData) => void;
  getData: (conversationId: string) => HudData | null;
  getShared: () => HudShared;
  clear: () => void;
}

const HUD_KEY = "arinova-hud-enabled";
function readEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(HUD_KEY) === "true";
}
function writeEnabled(v: boolean) {
  if (typeof window !== "undefined") localStorage.setItem(HUD_KEY, String(v));
}

export const useHudStore = create<HudStore>((set, get) => ({
  enabled: readEnabled(),
  shared: {},
  dataMap: {},
  toggle: () => { const next = !get().enabled; writeEnabled(next); set({ enabled: next }); },
  setEnabled: (v) => { writeEnabled(v); set({ enabled: v }); },
  setData: (conversationId, data) => {
    // Always update shared 5H/7D
    const shared: HudShared = { ...get().shared };
    if (data.fiveHour) shared.fiveHour = data.fiveHour;
    if (data.fiveHourReset) shared.fiveHourReset = data.fiveHourReset;
    if (data.sevenDay) shared.sevenDay = data.sevenDay;
    if (data.sevenDayReset) shared.sevenDayReset = data.sevenDayReset;
    // Per-conversation: context + model
    set({
      shared,
      dataMap: { ...get().dataMap, [conversationId]: data },
    });
  },
  getData: (conversationId) => get().dataMap[conversationId] ?? null,
  getShared: () => get().shared,
  clear: () => set({ shared: {}, dataMap: {} }),
}));

/** Parse HUD data from a JSON object (from hud_data WS event). */
export function parseHudData(data: unknown): HudData | null {
  try {
    const j = data as Record<string, unknown>;
    if (!j || typeof j !== "object") return null;
    const ctx = j.context as { percent?: number } | undefined;
    const h5 = j.limit5h as { percent?: number; resetIn?: string } | undefined;
    const d7 = j.limit7d as { percent?: number; resetIn?: string } | undefined;
    return {
      context: ctx?.percent != null ? `${ctx.percent}%` : undefined,
      fiveHour: h5?.percent != null ? `${h5.percent}%` : undefined,
      fiveHourReset: h5?.resetIn ?? undefined,
      sevenDay: d7?.percent != null ? `${d7.percent}%` : undefined,
      sevenDayReset: d7?.resetIn ?? undefined,
      model: j.model as string | undefined,
    };
  } catch {
    return null;
  }
}
