"use client";

import { useHudStore } from "@/store/hud-store";
import { useChatStore } from "@/store/chat-store";
import { useIsMobile } from "@/hooks/use-is-mobile";

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
  const activeConvId = useChatStore((s) => s.activeConversationId);
  const convData = useHudStore((s) => activeConvId ? s.dataMap[activeConvId] : null);
  const shared = useHudStore((s) => s.shared);
  const isMobile = useIsMobile();

  // Show if enabled AND we have either shared or per-conversation data
  const has5h = shared.fiveHour || convData?.fiveHour;
  const has7d = shared.sevenDay || convData?.sevenDay;
  const hasCtx = convData?.context;
  const hasModel = convData?.model;

  if (!enabled || (!has5h && !has7d && !hasCtx && !hasModel)) return null;

  // 5H/7D from shared (global), context/model from per-conversation
  const fiveHour = shared.fiveHour || convData?.fiveHour;
  const fiveHourReset = shared.fiveHourReset || convData?.fiveHourReset;
  const sevenDay = shared.sevenDay || convData?.sevenDay;
  const sevenDayReset = shared.sevenDayReset || convData?.sevenDayReset;
  const context = convData?.context;
  const model = convData?.model;

  const fmt5h = fiveHourReset ? (isMobile ? fmtReset(fiveHourReset) : fiveHourReset) : "";
  const fmt7d = sevenDayReset ? (isMobile ? fmtReset(sevenDayReset) : sevenDayReset) : "";

  return (
    <div className="shrink-0 flex items-center justify-center gap-3 px-3 py-0.5 text-[10px] text-muted-foreground/60 font-mono select-none">
      {context && <span>Ctx: {context}</span>}
      {fiveHour && <span>5H: {fiveHour}{fmt5h ? ` (${fmt5h})` : ""}</span>}
      {sevenDay && <span>7D: {sevenDay}{fmt7d ? ` (${fmt7d})` : ""}</span>}
      {model && <span>{fmtModel(model)}</span>}
    </div>
  );
}
