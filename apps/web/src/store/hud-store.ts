import { create } from "zustand";

export interface HudData {
  context?: string;
  fiveHour?: string;
  sevenDay?: string;
  model?: string;
  cost?: string;
  raw?: string;
}

interface HudStore {
  enabled: boolean;
  data: HudData | null;
  conversationId: string | null;
  lastAutoRefreshAt: number;
  toggle: () => void;
  setEnabled: (v: boolean) => void;
  setData: (conversationId: string, data: HudData) => void;
  markAutoRefresh: () => void;
  canAutoRefresh: () => boolean;
  clear: () => void;
}

export const useHudStore = create<HudStore>((set, get) => ({
  enabled: false,
  data: null,
  conversationId: null,
  lastAutoRefreshAt: 0,
  toggle: () => set({ enabled: !get().enabled }),
  setEnabled: (v) => set({ enabled: v }),
  setData: (conversationId, data) => set({ data, conversationId }),
  markAutoRefresh: () => set({ lastAutoRefreshAt: Date.now() }),
  canAutoRefresh: () => Date.now() - get().lastAutoRefreshAt > 5000,
  clear: () => set({ data: null, conversationId: null }),
}));

/** Parse HUD data from WS event data payload or legacy message content string.
 *  Accepts either:
 *  - A structured object: { "hud-for-usage": { context: { percent: 5 }, ... } }
 *  - A string containing JSON (legacy fallback)
 */
export function parseHudData(input: Record<string, unknown> | string): HudData | null {
  try {
    let j: Record<string, unknown> | undefined;

    if (typeof input === "string") {
      // Legacy: parse JSON from string content
      const jsonStr = input.match(/\{[\s\S]*\}/)?.[0];
      if (!jsonStr) return null;
      const raw = JSON.parse(jsonStr) as Record<string, unknown>;
      j = raw["hud-for-usage"] as Record<string, unknown> | undefined;
    } else {
      // Structured WS event data
      j = input["hud-for-usage"] as Record<string, unknown> | undefined;
      if (!j) j = input as Record<string, unknown>;
    }

    if (!j) return null;
    const ctx = j.context as { percent?: number } | undefined;
    const h5 = j.limit5h as { percent?: number } | undefined;
    const d7 = j.limit7d as { percent?: number } | undefined;
    return {
      context: ctx?.percent != null ? `${ctx.percent}%` : undefined,
      fiveHour: h5?.percent != null ? `${h5.percent}%` : undefined,
      sevenDay: d7?.percent != null ? `${d7.percent}%` : undefined,
      model: j.model as string | undefined,
      cost: j.cost != null ? `$${j.cost}` : undefined,
    };
  } catch {
    return null;
  }
}
