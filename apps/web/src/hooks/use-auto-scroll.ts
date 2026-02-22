"use client";

import { useCallback, useEffect, useRef } from "react";

export function useAutoScroll<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T>(null);
  const userScrolledUp = useRef(false);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // If user is within 100px of bottom, auto-scroll; otherwise don't force
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
    if (!el || userScrolledUp.current) return;
    el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
