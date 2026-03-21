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

    // Handle deep-link from push notification (openWindow case):
    // When SW opens a new window with /?c=xxx&m=yyy, the postMessage
    // arrives before React mounts. Read URL params on mount as fallback.
    const urlParams = new URLSearchParams(window.location.search);
    const deepConvId = urlParams.get("c");
    const deepMsgId = urlParams.get("m");
    if (deepConvId) {
      // Clean URL params (cosmetic — remove ?c=&m= from address bar)
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
      // Navigate after a short delay to let chat-store initialize
      setTimeout(() => {
        const store = useChatStore.getState();
        if (deepMsgId) {
          store.jumpToMessage(deepConvId, deepMsgId);
        } else {
          store.setActiveConversation(deepConvId);
        }
      }, 500);
    }

    // Handle in-app notification click (postMessage from SW):
    const cleanup = setupNotificationClickHandler((url) => {
      const params = new URLSearchParams(url.split("?")[1] || "");
      const convId = params.get("c");
      const msgId = params.get("m");
      if (convId) {
        const store = useChatStore.getState();
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
