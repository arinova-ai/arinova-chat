"use client";

import { useCallback, useEffect, useRef } from "react";

export function useAutoScroll<T extends HTMLElement>(
  deps: unknown[],
  options?: { conversationId?: string | null; skipScroll?: boolean },
) {
  const ref = useRef<T>(null);
  const userScrolledUp = useRef(false);
  const prevConversationId = useRef(options?.conversationId);

  // Reset scroll flag and force scroll to bottom when conversation changes
  useEffect(() => {
    if (options?.conversationId !== prevConversationId.current) {
      userScrolledUp.current = false;
      prevConversationId.current = options?.conversationId;
      const el = ref.current;
      if (el) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    }
  }, [options?.conversationId]);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const threshold = 100;
    const isNearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    userScrolledUp.current = !isNearBottom;
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    const el = ref.current;
    if (!el || userScrolledUp.current || options?.skipScroll) return;
    el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
