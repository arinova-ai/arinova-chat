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

/** Parse HUD data from agent message content.
 *  Supports:
 *  1. JSON format: {"context":{"percent":5},"limit5h":{"percent":32},"limit7d":{"percent":19},"model":"Opus 4.6","cost":1.38}
 *  2. [HUD]...[/HUD] wrapper around JSON or text
 *  3. Inline text: "Context: X% | 5H: Y% | 7D: Z%"
 */
export function parseHudData(content: string): HudData | null {
  // Try [HUD]...[/HUD] wrapper
  const hudMatch = content.match(/\[HUD\]([\s\S]*?)\[\/HUD\]/);
  const hudText = hudMatch ? hudMatch[1].trim() : null;
  const text = hudText ?? content;

  // Try JSON format (bridge output)
  try {
    const jsonStr = text.match(/\{[\s\S]*"limit5h"[\s\S]*\}/)?.[0];
    if (jsonStr) {
      const j = JSON.parse(jsonStr) as Record<string, unknown>;
      const ctx = j.context as { percent?: number } | undefined;
      const h5 = j.limit5h as { percent?: number } | undefined;
      const d7 = j.limit7d as { percent?: number } | undefined;
      if (h5?.percent != null || d7?.percent != null || ctx?.percent != null) {
        return {
          context: ctx?.percent != null ? `${ctx.percent}%` : undefined,
          fiveHour: h5?.percent != null ? `${h5.percent}%` : undefined,
          sevenDay: d7?.percent != null ? `${d7.percent}%` : undefined,
          model: j.model as string | undefined,
          cost: j.cost != null ? `$${j.cost}` : undefined,
        };
      }
    }
  } catch { /* not JSON, try text format */ }

  // Try inline text format: "Context: X% | 5H: Y% | 7D: Z%"
  const contextMatch = text.match(/Context:\s*(\d+%)/i);
  const fiveHourMatch = text.match(/5H:\s*(\d+%)/i);
  const sevenDayMatch = text.match(/7D:\s*(\d+%)/i);

  if (contextMatch || fiveHourMatch || sevenDayMatch) {
    return {
      context: contextMatch?.[1],
      fiveHour: fiveHourMatch?.[1],
      sevenDay: sevenDayMatch?.[1],
      raw: hudText ?? undefined,
    };
  }
  return null;
}
