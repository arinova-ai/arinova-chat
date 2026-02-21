import { useCallback, useRef } from "react";

interface UseDoubleTapOptions {
  /** Max interval between taps in ms (default: 300) */
  threshold?: number;
}

export function useDoubleTap(
  callback: () => void,
  options?: UseDoubleTapOptions
) {
  const { threshold = 300 } = options ?? {};
  const lastTapRef = useRef(0);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const now = Date.now();
      if (now - lastTapRef.current < threshold) {
        lastTapRef.current = 0;
        e.preventDefault();
        navigator.vibrate?.(50);
        callback();
      } else {
        lastTapRef.current = now;
      }
    },
    [callback, threshold]
  );

  return { onTouchEnd };
}
