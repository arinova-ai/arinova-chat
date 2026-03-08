"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { ThemeManifest } from "./theme-types";
import { loadTheme } from "./theme-loader";
import { fetchThemeRegistry, invalidateThemeCache, isKnownTheme, isFreeTheme, type ThemeEntry } from "./theme-registry";
import { api } from "@/lib/api";

const DEFAULT_THEME_ID = "cozy-studio-v2";
const STORAGE_KEY = "arinova-office-theme";
const DOWNLOADED_KEY = "arinova-downloaded-themes";

function readSavedThemeId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
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

function readDownloadedThemes(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DOWNLOADED_KEY);
    if (!raw) return new Set([DEFAULT_THEME_ID]);
    const arr = JSON.parse(raw) as string[];
    const set = new Set(arr);
    set.add(DEFAULT_THEME_ID);
    return set;
  } catch {
    return new Set([DEFAULT_THEME_ID]);
  }
}

function saveDownloadedThemes(set: Set<string>): void {
  try {
    localStorage.setItem(DOWNLOADED_KEY, JSON.stringify([...set]));
  } catch {
    // storage unavailable
  }
}

interface ThemeContextValue {
  manifest: ThemeManifest | null;
  loading: boolean;
  error: string | null;
  themeId: string;
  themes: ThemeEntry[];
  ownedThemes: Set<string>;
  downloadedThemes: Set<string>;
  switchTheme: (themeId: string) => void;
  downloadTheme: (themeId: string) => Promise<void>;
  isDownloaded: (themeId: string) => boolean;
  refreshOwned: () => Promise<void>;
  refreshThemes: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue>({
  manifest: null,
  loading: true,
  error: null,
  themeId: DEFAULT_THEME_ID,
  themes: [],
  ownedThemes: new Set(),
  downloadedThemes: new Set(),
  switchTheme: () => {},
  downloadTheme: async () => {},
  isDownloaded: () => false,
  refreshOwned: async () => {},
  refreshThemes: async () => {},
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
  const [themes, setThemes] = useState<ThemeEntry[]>([]);
  const [ownedThemes, setOwnedThemes] = useState<Set<string>>(new Set());
  const [downloadedThemes, setDownloadedThemes] = useState<Set<string>>(() => readDownloadedThemes());
  const [ready, setReady] = useState(false);

  // Fetch theme registry + owned themes on mount
  const refreshThemes = useCallback(async () => {
    try {
      invalidateThemeCache();
      const list = await fetchThemeRegistry();
      setThemes(list);
    } catch { /* ignore */ }
  }, []);

  const refreshOwned = useCallback(async () => {
    try {
      const data = await api<{ owned: string[] }>("/api/themes/owned", { silent: true });
      setOwnedThemes(new Set(data.owned));
    } catch { /* not logged in yet */ }
  }, []);

  useEffect(() => {
    Promise.all([refreshThemes(), refreshOwned()]).then(() => setReady(true));
  }, [refreshThemes, refreshOwned]);

  // Validate saved themeId once data is loaded
  useEffect(() => {
    if (!ready || themes.length === 0) return;
    if (!isKnownTheme(themeId, themes)) {
      setThemeId(DEFAULT_THEME_ID);
      saveThemeId(DEFAULT_THEME_ID);
      return;
    }
    if (!isFreeTheme(themeId, themes) && !ownedThemes.has(themeId)) {
      setThemeId(DEFAULT_THEME_ID);
      saveThemeId(DEFAULT_THEME_ID);
    }
  }, [ready, themes, ownedThemes, themeId]);

  // Load theme manifest when themeId changes
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const resolvedId = isKnownTheme(themeId, themes) ? themeId : DEFAULT_THEME_ID;
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
  }, [themeId, ready, themes]);

  const isDownloaded = useCallback((id: string) => downloadedThemes.has(id), [downloadedThemes]);

  const downloadTheme = useCallback(async (id: string) => {
    // Prefetch manifest to "download" the theme
    await loadTheme(id);
    const next = new Set(downloadedThemes);
    next.add(id);
    setDownloadedThemes(next);
    saveDownloadedThemes(next);
  }, [downloadedThemes]);

  const switchTheme = useCallback((newId: string) => {
    if (newId === themeId) return;
    if (!isKnownTheme(newId, themes)) {
      console.warn(`[ThemeProvider] Cannot switch to "${newId}" — not a known theme`);
      return;
    }
    if (!isFreeTheme(newId, themes) && !ownedThemes.has(newId)) {
      console.warn(`[ThemeProvider] Cannot switch to "${newId}" — not owned`);
      return;
    }
    if (!downloadedThemes.has(newId)) {
      console.warn(`[ThemeProvider] Cannot switch to "${newId}" — not downloaded`);
      return;
    }
    saveThemeId(newId);
    setThemeId(newId);
  }, [themeId, ownedThemes, themes, downloadedThemes]);

  return (
    <ThemeContext.Provider value={{ manifest, loading, error, themeId, themes, ownedThemes, downloadedThemes, switchTheme, downloadTheme, isDownloaded, refreshOwned, refreshThemes }}>
      {children}
    </ThemeContext.Provider>
  );
}
