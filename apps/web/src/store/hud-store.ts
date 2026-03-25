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

interface HudStore {
  enabled: boolean;
  dataMap: Record<string, HudData>;
  toggle: () => void;
  setEnabled: (v: boolean) => void;
  setData: (conversationId: string, data: HudData) => void;
  getData: (conversationId: string) => HudData | null;
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
  dataMap: {},
  toggle: () => { const next = !get().enabled; writeEnabled(next); set({ enabled: next }); },
  setEnabled: (v) => { writeEnabled(v); set({ enabled: v }); },
  setData: (conversationId, data) => set({ dataMap: { ...get().dataMap, [conversationId]: data } }),
  getData: (conversationId) => get().dataMap[conversationId] ?? null,
  clear: () => set({ dataMap: {} }),
}));

/** Parse HUD data from agent message content.
 *  Supports:
 *  1. JSON format: {"context":{"percent":5},"limit5h":{"percent":32},"limit7d":{"percent":19},"model":"Opus 4.6","cost":1.38}
 *  2. [HUD]...[/HUD] wrapper around JSON or text
 *  3. Inline text: "Context: X% | 5H: Y% | 7D: Z%"
 */
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
