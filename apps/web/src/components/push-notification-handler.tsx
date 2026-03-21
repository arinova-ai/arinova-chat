"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useChatStore } from "@/store/chat-store";
import {
  refreshPushSubscription,
  setupNotificationClickHandler,
} from "@/lib/push";

export function PushNotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    refreshPushSubscription();
    const cleanup = setupNotificationClickHandler((url) => {
      const params = new URLSearchParams(url.split("?")[1] || "");
      const convId = params.get("c");
      const msgId = params.get("m");
      if (convId) {
        const store = useChatStore.getState();
        // On mobile, ensure back button returns to conversation list
        const isMobile = window.matchMedia("(max-width: 767px)").matches;
        if (isMobile && !store.activeConversationId) {
          history.pushState({ arinovaChat: true }, "");
        }
        if (msgId) {
          store.jumpToMessage(convId, msgId);
        } else {
          store.setActiveConversation(convId);
        }
        if (window.location.pathname !== "/") {
          router.push("/");
        }
      } else {
        router.push(url);
      }
    });
    return cleanup;
  }, [router]);

  return null;
}
