"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useAutoScroll<T extends HTMLElement>(
  deps: unknown[],
  options?: { conversationId?: string | null; skipScroll?: boolean },
) {
  const ref = useRef<T>(null);
  const userScrolledUp = useRef(false);
  const prevConversationId = useRef<string | null | undefined>(undefined);
  const prevScrollTopRef = useRef(0);
  const stickyTimerRef = useRef<number | null>(null);
  const stickyUntilRef = useRef(0);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const stopStickyScroll = useCallback(() => {
    if (stickyTimerRef.current !== null) {
      window.clearTimeout(stickyTimerRef.current);
      stickyTimerRef.current = null;
    }
    stickyUntilRef.current = 0;
  }, []);

  const forceScrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const startStickyScroll = useCallback(
    (durationMs = 2200) => {
      if (options?.skipScroll) return;
      stopStickyScroll();
      stickyUntilRef.current = Date.now() + durationMs;

      const tick = () => {
        if (options?.skipScroll || userScrolledUp.current) {
          stopStickyScroll();
          return;
        }

        forceScrollToBottom("auto");

        if (Date.now() < stickyUntilRef.current) {
          stickyTimerRef.current = window.setTimeout(tick, 50);
          return;
        }

        stopStickyScroll();
      };

      tick();
    },
    [forceScrollToBottom, options?.skipScroll, stopStickyScroll],
  );

  useEffect(() => stopStickyScroll, [stopStickyScroll]);

  // Reset scroll flag and force scroll to bottom when conversation changes
  // (skip when jumpToMessage sets a highlight target — it handles its own scroll)
  useEffect(() => {
    if (prevConversationId.current === undefined) {
      prevConversationId.current = options?.conversationId;
      userScrolledUp.current = false;
      prevScrollTopRef.current = 0;
      setShowScrollButton(false);
      startStickyScroll();
      return;
    }

    if (options?.conversationId !== prevConversationId.current) {
      userScrolledUp.current = false;
      prevScrollTopRef.current = 0;
      setShowScrollButton(false);
      prevConversationId.current = options?.conversationId;
      startStickyScroll();
    }
  }, [options?.conversationId, startStickyScroll]);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const prevTop = prevScrollTopRef.current;
    const currentTop = el.scrollTop;
    prevScrollTopRef.current = currentTop;

    const movingUp = currentTop < prevTop;
    const pinThreshold = 24;
    const buttonThreshold = 100;
    const bottomDist = el.scrollHeight - currentTop - el.clientHeight;
    const isNearBottomForPin = bottomDist < pinThreshold;
    const isNearBottomForButton = bottomDist < buttonThreshold;

    if (movingUp) {
      userScrolledUp.current = true;
      stopStickyScroll();
    } else if (isNearBottomForPin) {
      userScrolledUp.current = false;
    }

    setShowScrollButton(!isNearBottomForButton);
  }, [stopStickyScroll]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (userScrolledUp.current || options?.skipScroll) return;
    startStickyScroll(1200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const scrollToBottom = useCallback(() => {
    forceScrollToBottom("smooth");
    userScrolledUp.current = false;
    setShowScrollButton(false);
    startStickyScroll(800);
  }, [forceScrollToBottom, startStickyScroll]);

  return { ref, showScrollButton, scrollToBottom };
}
