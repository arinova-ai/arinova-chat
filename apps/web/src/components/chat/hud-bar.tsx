"use client";

import { useHudStore } from "@/store/hud-store";
import { useChatStore } from "@/store/chat-store";

/** Tiny HUD bar above chat input showing context/usage stats */
export function HudBar() {
  const enabled = useHudStore((s) => s.enabled);
  const data = useHudStore((s) => s.data);
  const hudConvId = useHudStore((s) => s.conversationId);
  const activeConvId = useChatStore((s) => s.activeConversationId);

  if (!enabled || !data || hudConvId !== activeConvId) return null;

  return (
    <div className="shrink-0 flex items-center justify-center gap-3 px-3 py-0.5 text-[10px] text-muted-foreground/60 font-mono select-none">
      {data.context && <span>Context: {data.context}</span>}
      {data.fiveHour && <span>5H: {data.fiveHour}</span>}
      {data.sevenDay && <span>7D: {data.sevenDay}</span>}
      {data.model && <span>{data.model}</span>}
    </div>
  );
}
