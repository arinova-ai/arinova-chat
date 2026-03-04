import { useCallback, useEffect, useRef } from "react";

interface UseLongPressOptions {
  /** Duration in ms before firing (default: 500) */
  threshold?: number;
}

export function useLongPress(
  callback: () => void,
  options?: UseLongPressOptions,
) {
  const { threshold = 500 } = options ?? {};
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      firedRef.current = false;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        firedRef.current = true;
        navigator.vibrate?.(10);
        callback();
      }, threshold);
    },
    [callback, threshold],
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      clear();
      // Prevent tap / click if long-press already fired
      if (firedRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [clear],
  );

  const onTouchMove = useCallback(() => {
    // Cancel long-press if user moves finger (scrolling)
    clear();
  }, [clear]);

  // Clear pending timer on unmount to avoid firing callback after teardown
  useEffect(() => clear, [clear]);

  return { onTouchStart, onTouchEnd, onTouchMove };
}
