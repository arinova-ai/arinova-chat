import { useCallback, useRef } from "react";

interface UseLongPressOptions {
  /** Hold duration in ms before triggering (default: 500) */
  threshold?: number;
  /** Movement in px that cancels the press (default: 10) */
  moveThreshold?: number;
}

export function useLongPress(
  callback: () => void,
  options?: UseLongPressOptions
) {
  const { threshold = 500, moveThreshold = 10 } = options ?? {};
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPos.current = null;
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      startPos.current = { x: touch.clientX, y: touch.clientY };
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        navigator.vibrate?.(50);
        callback();
      }, threshold);
    },
    [callback, threshold]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPos.current || !timerRef.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startPos.current.x;
      const dy = touch.clientY - startPos.current.y;
      if (Math.abs(dx) > moveThreshold || Math.abs(dy) > moveThreshold) {
        clear();
      }
    },
    [moveThreshold, clear]
  );

  const onTouchEnd = useCallback(() => {
    clear();
  }, [clear]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
