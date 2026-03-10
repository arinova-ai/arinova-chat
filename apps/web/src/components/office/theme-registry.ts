import { api } from "@/lib/api";

export interface ThemeEntry {
  id: string;
  name: string;
  description: string;
  previewUrl: string;
  price: "free" | number;
  maxAgents: number;
  tags: string[];
  author?: { name: string; id: string };
  license?: string;
  version?: string;
  renderer?: string;
}

let _cache: ThemeEntry[] | null = null;

/** Fetch all themes from the API. Results are cached for the session. */
export async function fetchThemeRegistry(): Promise<ThemeEntry[]> {
  if (_cache) return _cache;
  try {
    const data = await api<{ themes: ThemeEntry[] }>("/api/themes", { silent: true });
    _cache = data.themes;
    return _cache;
  } catch {
    return [];
  }
}

/** Invalidate the cached theme list (e.g. after upload). */
export function invalidateThemeCache(): void {
  _cache = null;
}

/** Check if a themeId exists. Requires themes to be loaded first. */
export function isKnownTheme(id: string, themes: ThemeEntry[]): boolean {
  return themes.some((t) => t.id === id);
}

/** Check if a theme is free. Requires themes to be loaded first. */
export function isFreeTheme(id: string, themes: ThemeEntry[]): boolean {
  const entry = themes.find((t) => t.id === id);
  return entry?.price === "free";
}
