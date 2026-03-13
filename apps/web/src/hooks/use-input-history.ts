import { useCallback, useRef } from "react";

const STORAGE_KEY = "chat-input-history";
const MAX_HISTORY = 50;

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(history: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {}
}

/**
 * Shell-like input history for chat input.
 * - addToHistory(text): call after sending a message
 * - navigateUp(): returns previous history entry (or null)
 * - navigateDown(): returns next history entry (or null to restore draft)
 * - resetNavigation(): call when user types manually
 * - isNavigating: true when browsing history
 */
export function useInputHistory() {
  // -1 means not navigating; 0 = most recent entry
  const indexRef = useRef(-1);
  const draftRef = useRef("");

  const addToHistory = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const history = loadHistory();
    // Deduplicate: remove if already the most recent
    if (history.length > 0 && history[history.length - 1] === trimmed) {
      // already at top, skip
    } else {
      history.push(trimmed);
      if (history.length > MAX_HISTORY) {
        history.splice(0, history.length - MAX_HISTORY);
      }
    }
    saveHistory(history);
    indexRef.current = -1;
  }, []);

  const navigateUp = useCallback((currentValue: string): string | null => {
    const history = loadHistory();
    if (history.length === 0) return null;

    if (indexRef.current === -1) {
      // Starting navigation — save current input as draft
      draftRef.current = currentValue;
      indexRef.current = history.length - 1;
    } else if (indexRef.current > 0) {
      indexRef.current--;
    } else {
      // Already at oldest entry
      return null;
    }

    return history[indexRef.current];
  }, []);

  const navigateDown = useCallback((): string | null => {
    if (indexRef.current === -1) return null;

    const history = loadHistory();
    if (indexRef.current < history.length - 1) {
      indexRef.current++;
      return history[indexRef.current];
    }

    // Back to the draft
    indexRef.current = -1;
    return draftRef.current;
  }, []);

  const resetNavigation = useCallback(() => {
    indexRef.current = -1;
  }, []);

  const isNavigating = useCallback(() => indexRef.current !== -1, []);

  return { addToHistory, navigateUp, navigateDown, resetNavigation, isNavigating };
}
