import type { ThemeManifest } from "./theme-types";

const cache = new Map<string, ThemeManifest>();

function themeUrl(themeId: string): string {
  return `/themes/${themeId}/theme.json`;
}

/** Lightweight runtime validation of a parsed manifest. */
export function validateManifest(data: unknown): ThemeManifest {
  const d = data as Record<string, unknown>;
  if (!d || typeof d !== "object") throw new Error("Manifest must be an object");
  if (typeof d.id !== "string") throw new Error("Manifest missing 'id'");
  if (typeof d.name !== "string") throw new Error("Manifest missing 'name'");
  if (typeof d.version !== "string") throw new Error("Manifest missing 'version'");

  const canvas = d.canvas as Record<string, unknown> | undefined;
  if (!canvas || typeof canvas.width !== "number" || typeof canvas.height !== "number") {
    throw new Error("Manifest missing valid 'canvas' (width/height)");
  }
  if (!canvas.background || typeof canvas.background !== "object") {
    throw new Error("Manifest missing 'canvas.background'");
  }

  if (!Array.isArray(d.zones)) throw new Error("Manifest missing 'zones' array");
  for (const zone of d.zones as unknown[]) {
    const z = zone as Record<string, unknown>;
    if (!z.id || !z.bounds || !Array.isArray(z.seats)) {
      throw new Error(`Zone '${z.id ?? "unknown"}' missing id/bounds/seats`);
    }
  }

  if (!Array.isArray(d.layers) || (d.layers as unknown[]).length === 0) {
    throw new Error("Manifest missing 'layers' array");
  }

  const chars = d.characters as Record<string, unknown> | undefined;
  if (!chars?.statusBadge || typeof chars.statusBadge !== "object") {
    throw new Error("Manifest missing 'characters.statusBadge'");
  }

  return data as ThemeManifest;
}

/**
 * Load and validate a theme manifest by ID.
 * Returns cached manifest if available. Fetches from /themes/{id}/theme.json.
 */
export async function loadTheme(themeId: string): Promise<ThemeManifest> {
  const cached = cache.get(themeId);
  if (cached) return cached;

  const url = themeUrl(themeId);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load theme "${themeId}": ${res.status} ${res.statusText}`);
  }

  const raw = await res.json();
  const manifest = validateManifest(raw);
  cache.set(themeId, manifest);
  return manifest;
}

/** Clear cached manifests. */
export function clearThemeCache(): void {
  cache.clear();
}

/** Pre-seed cache with a manifest (for fallback/testing). */
export function cacheTheme(manifest: ThemeManifest): void {
  cache.set(manifest.id, manifest);
}
