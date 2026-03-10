"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { ThemeManifest } from "./theme-types";
import { loadTheme, BUILTIN_DEFAULT_THEME_ID } from "./theme-loader";
import { fetchThemeRegistry, invalidateThemeCache, isKnownTheme, isFreeTheme, type ThemeEntry } from "./theme-registry";
import { api } from "@/lib/api";

const DEFAULT_THEME_ID = BUILTIN_DEFAULT_THEME_ID;
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
    set.add(DEFAULT_THEME_ID); // default always present
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
  uninstallTheme: (themeId: string) => void;
  resetToDefault: () => void;
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
  uninstallTheme: () => {},
  resetToDefault: () => {},
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
    // Built-in default is always valid
    if (themeId === DEFAULT_THEME_ID) return;
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

  // Load theme manifest when themeId changes — with fallback to default
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    // If it's a non-default theme that isn't known, resolve to default
    const resolvedId =
      themeId === DEFAULT_THEME_ID
        ? DEFAULT_THEME_ID
        : isKnownTheme(themeId, themes)
          ? themeId
          : DEFAULT_THEME_ID;

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
        if (cancelled) return;
        console.error(`[ThemeProvider] Failed to load theme "${resolvedId}":`, err);
        // If it was already default, we can't fall back further
        if (resolvedId === DEFAULT_THEME_ID) {
          setError(err instanceof Error ? err.message : String(err));
          setManifest(null);
          setLoading(false);
        } else {
          // Fallback to default
          console.warn(`[ThemeProvider] Falling back to built-in default theme`);
          saveThemeId(DEFAULT_THEME_ID);
          setThemeId(DEFAULT_THEME_ID);
        }
      });

    return () => { cancelled = true; };
  }, [themeId, ready, themes]);

  const isDownloaded = useCallback((id: string) => id === DEFAULT_THEME_ID || downloadedThemes.has(id), [downloadedThemes]);

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
    // Built-in default can always be switched to
    if (newId === DEFAULT_THEME_ID) {
      saveThemeId(DEFAULT_THEME_ID);
      setThemeId(DEFAULT_THEME_ID);
      return;
    }
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

  const uninstallTheme = useCallback((id: string) => {
    // Never allow uninstalling the default theme
    if (id === DEFAULT_THEME_ID) return;
    const next = new Set(downloadedThemes);
    next.delete(id);
    next.add(DEFAULT_THEME_ID); // ensure default is always present
    setDownloadedThemes(next);
    saveDownloadedThemes(next);
    // If uninstalling the active theme, switch to default
    if (themeId === id) {
      saveThemeId(DEFAULT_THEME_ID);
      setThemeId(DEFAULT_THEME_ID);
    }
  }, [downloadedThemes, themeId]);

  const resetToDefault = useCallback(() => {
    saveThemeId(DEFAULT_THEME_ID);
    setThemeId(DEFAULT_THEME_ID);
    // Clear all downloaded except default
    const next = new Set([DEFAULT_THEME_ID]);
    setDownloadedThemes(next);
    saveDownloadedThemes(next);
  }, []);

  return (
    <ThemeContext.Provider value={{ manifest, loading, error, themeId, themes, ownedThemes, downloadedThemes, switchTheme, downloadTheme, uninstallTheme, resetToDefault, isDownloaded, refreshOwned, refreshThemes }}>
      {children}
    </ThemeContext.Provider>
  );
}
