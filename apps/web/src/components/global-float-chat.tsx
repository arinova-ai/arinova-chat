"use client";

import { useFloatWindowStore } from "@/store/float-window-store";
import { FloatChatWindow } from "@/components/office/float-chat-window";

export function GlobalFloatChat() {
  const windows = useFloatWindowStore((s) => s.windows);
  const close = useFloatWindowStore((s) => s.close);

  if (windows.length === 0) return null;

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <>
      {windows.map((w, idx) => (
        <FloatChatWindow
          key={w.agentId}
          agentId={w.agentId}
          agentName={w.agentName}
          agentAvatar={w.agentAvatar}
          onClose={() => close(w.agentId)}
          offsetIndex={idx}
          isMobile={isMobile}
        />
      ))}
    </>
  );
}
