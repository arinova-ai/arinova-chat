"use client";

import { useHudStore } from "@/store/hud-store";
import { useChatStore } from "@/store/chat-store";

/** Convert reset time string like "2d 12h 30m" to decimal hours (36.5h) or minutes if < 1h */
function fmtReset(s: string): string {
  let totalMin = 0;
  const d = s.match(/(\d+)d/);
  const h = s.match(/(\d+)h/);
  const m = s.match(/(\d+)m/);
  if (d) totalMin += parseInt(d[1]) * 24 * 60;
  if (h) totalMin += parseInt(h[1]) * 60;
  if (m) totalMin += parseInt(m[1]);
  if (totalMin < 60) return `${totalMin}m`;
  const hours = totalMin / 60;
  return hours % 1 === 0 ? `${hours}h` : `${hours.toFixed(1)}h`;
}

/** Strip parenthetical from model name: "Opus 4.6 (1M context)" → "Opus 4.6" */
function fmtModel(s: string): string {
  return s.replace(/\s*\(.*\)/, "");
}

/** Tiny HUD bar above chat input showing context/usage stats */
export function HudBar() {
  const enabled = useHudStore((s) => s.enabled);
  const data = useHudStore((s) => s.data);
  const hudConvId = useHudStore((s) => s.conversationId);
  const activeConvId = useChatStore((s) => s.activeConversationId);

  if (!enabled || !data || hudConvId !== activeConvId) return null;

  return (
    <div className="shrink-0 flex items-center justify-center gap-3 px-3 py-0.5 text-[10px] text-muted-foreground/60 font-mono select-none">
      {data.context && <span>Ctx: {data.context}</span>}
      {data.fiveHour && <span>5H: {data.fiveHour}{data.fiveHourReset ? ` (${fmtReset(data.fiveHourReset)})` : ""}</span>}
      {data.sevenDay && <span>7D: {data.sevenDay}{data.sevenDayReset ? ` (${fmtReset(data.sevenDayReset)})` : ""}</span>}
      {data.model && <span>{fmtModel(data.model)}</span>}
    </div>
  );
}
