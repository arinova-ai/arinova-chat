import { create } from "zustand";

export interface HudData {
  context?: string;
  fiveHour?: string;
  sevenDay?: string;
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
 *  Format: [HUD]Context: 2% | 5H: 10% | 7D: 3%[/HUD]
 *  Or: /hud response lines like "Context: X% | 5H: Y% | 7D: Z%"
 */
export function parseHudData(content: string): HudData | null {
  // Try [HUD]...[/HUD] format
  const hudMatch = content.match(/\[HUD\]([\s\S]*?)\[\/HUD\]/);
  const hudText = hudMatch ? hudMatch[1].trim() : null;

  // Try inline format: "Context: X% | 5H: Y% | 7D: Z%"
  const text = hudText ?? content;
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
