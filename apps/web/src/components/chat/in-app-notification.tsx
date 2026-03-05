"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useNotificationStore } from "@/store/notification-store";
import { useChatStore } from "@/store/chat-store";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { assetUrl } from "@/lib/config";

const AUTO_DISMISS_MS = 4000;

export function InAppNotification() {
  const router = useRouter();
  const notification = useNotificationStore((s) => s.current);
  const dismiss = useNotificationStore((s) => s.dismiss);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!notification) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [notification, dismiss]);

  if (!notification) return null;

  const handleClick = () => {
    dismiss();
    useChatStore.getState().setActiveConversation(notification.conversationId);
    router.push(`/?c=${notification.conversationId}`);
  };

  const initial = (notification.senderName || "?").charAt(0).toUpperCase();

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] pointer-events-none md:hidden"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <button
        onClick={handleClick}
        className="pointer-events-auto mx-2 mt-2 flex items-center gap-3 rounded-xl border border-border bg-card/95 backdrop-blur-md px-3 py-2.5 shadow-lg animate-in slide-in-from-top-2 duration-200"
      >
        <Avatar className="h-9 w-9 shrink-0">
          {notification.senderImage ? (
            <AvatarImage src={assetUrl(notification.senderImage)} alt={notification.senderName} />
          ) : null}
          <AvatarFallback className="text-xs">{initial}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-sm font-semibold text-foreground truncate">{notification.senderName}</p>
          <p className="text-xs text-muted-foreground truncate">{notification.preview}</p>
        </div>
      </button>
    </div>
  );
}
