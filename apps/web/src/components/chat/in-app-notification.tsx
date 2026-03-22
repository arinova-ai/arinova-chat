"use client";

import { useEffect, useRef, useCallback } from "react";
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
  const bannerRef = useRef<HTMLButtonElement>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    if (!notification) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [notification, dismiss]);

  // Swipe up to dismiss
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (dy < -30) {
      // Swipe up — animate out then dismiss
      if (bannerRef.current) {
        bannerRef.current.style.transition = "transform 200ms, opacity 200ms";
        bannerRef.current.style.transform = "translateY(-100%)";
        bannerRef.current.style.opacity = "0";
        setTimeout(dismiss, 200);
      } else {
        dismiss();
      }
    }
  }, [dismiss]);

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
        ref={bannerRef}
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="pointer-events-auto mx-3 mt-2 flex w-[calc(100%-1.5rem)] max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-xl border border-border bg-card backdrop-blur-md px-3 py-2.5 shadow-xl animate-in slide-in-from-top-2 duration-200"
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
