"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { ThemeManifest } from "./theme-types";
import { loadTheme } from "./theme-loader";

const DEFAULT_THEME_ID = "default-office";

interface ThemeContextValue {
  manifest: ThemeManifest | null;
  loading: boolean;
  error: string | null;
  themeId: string;
  switchTheme: (themeId: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  manifest: null,
  loading: true,
  error: null,
  themeId: DEFAULT_THEME_ID,
  switchTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  children: ReactNode;
  initialThemeId?: string;
}

export function ThemeProvider({ children, initialThemeId = DEFAULT_THEME_ID }: ThemeProviderProps) {
  const [themeId, setThemeId] = useState(initialThemeId);
  const [manifest, setManifest] = useState<ThemeManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    loadTheme(themeId)
      .then((m) => {
        if (!cancelled) {
          setManifest(m);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error(`[ThemeProvider] Failed to load theme "${themeId}":`, err);
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
          // manifest stays null → OfficeMap uses fallback
        }
      });

    return () => { cancelled = true; };
  }, [themeId]);

  const switchTheme = useCallback((newId: string) => {
    if (newId !== themeId) {
      setThemeId(newId);
    }
  }, [themeId]);

  return (
    <ThemeContext.Provider value={{ manifest, loading, error, themeId, switchTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
