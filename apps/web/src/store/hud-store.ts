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
  data: HudData | null;
  conversationId: string | null;
  toggle: () => void;
  setEnabled: (v: boolean) => void;
  setData: (conversationId: string, data: HudData) => void;
  clear: () => void;
}

export const useHudStore = create<HudStore>((set, get) => ({
  enabled: false,
  data: null,
  conversationId: null,
  toggle: () => set({ enabled: !get().enabled }),
  setEnabled: (v) => set({ enabled: v }),
  setData: (conversationId, data) => set({ data, conversationId }),
  clear: () => set({ data: null, conversationId: null }),
}));

/** Parse HUD data from agent message content.
 *  Supports:
 *  1. JSON format: {"context":{"percent":5},"limit5h":{"percent":32},"limit7d":{"percent":19},"model":"Opus 4.6","cost":1.38}
 *  2. [HUD]...[/HUD] wrapper around JSON or text
 *  3. Inline text: "Context: X% | 5H: Y% | 7D: Z%"
 */
export function parseHudData(content: string): HudData | null {
  try {
    const jsonStr = content.match(/\{[\s\S]*\}/)?.[0];
    if (!jsonStr) return null;
    const raw = JSON.parse(jsonStr) as Record<string, unknown>;
    const j = raw["hud-for-usage"] as Record<string, unknown> | undefined;
    if (!j) return null;
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
  return null;
}
