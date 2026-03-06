"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { ThemeManifest } from "./theme-types";
import { loadTheme } from "./theme-loader";
import { isKnownTheme, isFreeTheme } from "./theme-registry";
import { api } from "@/lib/api";

const DEFAULT_THEME_ID = "cozy-studio";
const STORAGE_KEY = "arinova-office-theme";

/** Read saved themeId from localStorage — validates on mount with owned check. */
function readSavedThemeId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isKnownTheme(saved)) return saved;
    return DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

function saveThemeId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // storage unavailable
  }
}

interface ThemeContextValue {
  manifest: ThemeManifest | null;
  loading: boolean;
  error: string | null;
  themeId: string;
  ownedThemes: Set<string>;
  switchTheme: (themeId: string) => void;
  refreshOwned: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  manifest: null,
  loading: true,
  error: null,
  themeId: DEFAULT_THEME_ID,
  ownedThemes: new Set(),
  switchTheme: () => {},
  refreshOwned: async () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  children: ReactNode;
  initialThemeId?: string;
}

export function ThemeProvider({ children, initialThemeId }: ThemeProviderProps) {
  const [themeId, setThemeId] = useState(() => initialThemeId ?? readSavedThemeId());
  const [manifest, setManifest] = useState<ThemeManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownedThemes, setOwnedThemes] = useState<Set<string>>(new Set());
  const [ownedLoaded, setOwnedLoaded] = useState(false);

  // Fetch owned themes on mount
  const refreshOwned = useCallback(async () => {
    try {
      const data = await api<{ owned: string[] }>("/api/themes/owned", { silent: true });
      setOwnedThemes(new Set(data.owned));
    } catch { /* not logged in yet */ }
    setOwnedLoaded(true);
  }, []);

  useEffect(() => {
    refreshOwned();
  }, [refreshOwned]);

  // Validate saved themeId once owned themes are loaded — if it's a paid theme
  // the user doesn't own, fall back to default
  useEffect(() => {
    if (!ownedLoaded) return; // wait for fetch to complete before validating
    if (!isKnownTheme(themeId)) return;
    if (!isFreeTheme(themeId) && !ownedThemes.has(themeId)) {
      setThemeId(DEFAULT_THEME_ID);
      saveThemeId(DEFAULT_THEME_ID);
    }
  }, [ownedLoaded, ownedThemes, themeId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    // Validate themeId against registry whitelist
    const resolvedId = isKnownTheme(themeId) ? themeId : DEFAULT_THEME_ID;
    if (resolvedId !== themeId) {
      setThemeId(resolvedId);
      return;
    }

    loadTheme(resolvedId)
      .then((m) => {
        if (!cancelled) {
          setManifest(m);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(`[ThemeProvider] Failed to load theme "${resolvedId}":`, err);
          setError(err instanceof Error ? err.message : String(err));
          setManifest(null);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [themeId]);

  const switchTheme = useCallback((newId: string) => {
    if (newId === themeId) return;
    if (!isKnownTheme(newId)) {
      console.warn(`[ThemeProvider] Cannot switch to "${newId}" — not a known theme`);
      return;
    }
    // Allow free themes or owned themes
    if (!isFreeTheme(newId) && !ownedThemes.has(newId)) {
      console.warn(`[ThemeProvider] Cannot switch to "${newId}" — not owned`);
      return;
    }
    saveThemeId(newId);
    setThemeId(newId);
  }, [themeId, ownedThemes]);

  return (
    <ThemeContext.Provider value={{ manifest, loading, error, themeId, ownedThemes, switchTheme, refreshOwned }}>
      {children}
    </ThemeContext.Provider>
  );
}
