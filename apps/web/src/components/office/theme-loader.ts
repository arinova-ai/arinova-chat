import type { ThemeManifest } from "./theme-types";

function themeUrl(themeId: string): string {
  return `/themes/${themeId}/theme.json`;
}

/** Check that a path is relative, contains no ".." traversal, and no protocol scheme. */
function isSafePath(p: unknown): boolean {
  if (typeof p !== "string" || p.length === 0) return true; // empty/missing is fine
  if (p.startsWith("/") || p.startsWith("\\")) return false; // absolute
  if (p.includes("..")) return false; // traversal
  if (p.includes(":")) return false; // blocks all protocol schemes (http:, javascript:, data:, etc.)
  return true;
}

function assertSafePath(p: unknown, label: string): void {
  if (!isSafePath(p)) {
    throw new Error(`Unsafe path in ${label}: "${p}" — must be relative with no "..", ":" or absolute prefix`);
  }
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
  if (canvas.width <= 0 || canvas.height <= 0) {
    throw new Error("Canvas width/height must be > 0");
  }
  if (!canvas.background || typeof canvas.background !== "object") {
    throw new Error("Manifest missing 'canvas.background'");
  }

  // Path safety: background images
  const bg = canvas.background as Record<string, unknown>;
  if (bg.image != null) assertSafePath(bg.image, "canvas.background.image");
  if (bg.image2x != null) assertSafePath(bg.image2x, "canvas.background.image2x");
  if (bg.mobile != null) assertSafePath(bg.mobile, "canvas.background.mobile");

  // Zones: must be non-empty, each zone must have ≥1 seat
  if (!Array.isArray(d.zones)) throw new Error("Manifest missing 'zones' array");
  const zones = d.zones as unknown[];
  if (zones.length === 0) throw new Error("Manifest 'zones' must not be empty");
  for (const zone of zones) {
    const z = zone as Record<string, unknown>;
    if (!z.id || !z.bounds || !Array.isArray(z.seats)) {
      throw new Error(`Zone '${z.id ?? "unknown"}' missing id/bounds/seats`);
    }
    if ((z.seats as unknown[]).length === 0) {
      throw new Error(`Zone '${z.id}' must have at least 1 seat`);
    }
  }

  // Layers: must have entries
  if (!Array.isArray(d.layers) || (d.layers as unknown[]).length === 0) {
    throw new Error("Manifest missing 'layers' array");
  }

  // Characters: statusBadge.colors must exist
  const chars = d.characters as Record<string, unknown> | undefined;
  if (!chars?.statusBadge || typeof chars.statusBadge !== "object") {
    throw new Error("Manifest missing 'characters.statusBadge'");
  }
  const badge = chars.statusBadge as Record<string, unknown>;
  if (!badge.colors || typeof badge.colors !== "object") {
    throw new Error("Manifest missing 'characters.statusBadge.colors'");
  }

  // Path safety: preview, atlas, audio
  if (d.preview != null) assertSafePath(d.preview, "preview");
  if (typeof chars.atlas === "string" && chars.atlas.length > 0) {
    assertSafePath(chars.atlas, "characters.atlas");
  }
  const audio = d.audio as Record<string, unknown> | undefined;
  if (audio?.ambient) {
    const ambient = audio.ambient as Record<string, unknown>;
    if (ambient.src) assertSafePath(ambient.src, "audio.ambient.src");
  }

  return data as ThemeManifest;
}

/**
 * Load and validate a theme manifest by ID.
 * Always fetches fresh from /themes/{id}/theme.json (manifest is small).
 * No in-memory cache — avoids stale version issues on theme updates.
 */
export async function loadTheme(themeId: string): Promise<ThemeManifest> {
  const url = themeUrl(themeId);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load theme "${themeId}": ${res.status} ${res.statusText}`);
  }

  const raw = await res.json();
  return validateManifest(raw);
}
