import type { ThemeManifest } from "./theme-types";
import { BACKEND_URL } from "@/lib/config";

// ── Constants ──

export const BUILTIN_DEFAULT_THEME_ID = "default";

// ── Theme assets base URL (resolved from backend /api/themes/config) ──

let _themeAssetsBaseUrl: string | null = null;

async function getThemeAssetsBaseUrl(): Promise<string> {
  if (_themeAssetsBaseUrl !== null) return _themeAssetsBaseUrl;
  try {
    const res = await fetch(`${BACKEND_URL}/api/themes/config`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      if (data.themeAssetsBaseUrl) {
        _themeAssetsBaseUrl = data.themeAssetsBaseUrl as string;
        return _themeAssetsBaseUrl!;
      }
    }
  } catch { /* fall through */ }
  _themeAssetsBaseUrl = "/themes";
  return _themeAssetsBaseUrl;
}

/** Get the base URL for a specific theme's assets. */
export async function getThemeBaseUrl(themeId: string): Promise<string> {
  if (themeId === BUILTIN_DEFAULT_THEME_ID) return `/themes/${BUILTIN_DEFAULT_THEME_ID}`;
  const base = await getThemeAssetsBaseUrl();
  return `${base}/${themeId}`;
}

function themeUrl(themeId: string): string {
  // Sync fallback for initial load — will be overridden once config is fetched
  if (_themeAssetsBaseUrl) return `${_themeAssetsBaseUrl}/${themeId}/theme.json`;
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

  // iframe themes only need basic fields + path safety — skip canvas/zones/layers/characters
  const isIframe = d.renderer === "iframe";

  if (!isIframe) {
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

    // v3 themes use room.model
    const room = d.room as Record<string, unknown> | undefined;
    const isV3 = !!room?.model;

    if (!isV3) {
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
    }

    // Path safety: atlas, seatSprites, audio (pixi-specific assets)
    const charsForPath = d.characters as Record<string, unknown> | undefined;
    if (charsForPath && typeof charsForPath.atlas === "string" && charsForPath.atlas.length > 0) {
      assertSafePath(charsForPath.atlas, "characters.atlas");
    }
    if (charsForPath?.seatSprites && typeof charsForPath.seatSprites === "object") {
      const ss = charsForPath.seatSprites as Record<string, Record<string, string[]>>;
      for (const [seatId, statusMap] of Object.entries(ss)) {
        for (const [status, paths] of Object.entries(statusMap)) {
          if (Array.isArray(paths)) {
            for (const p of paths) {
              assertSafePath(p, `characters.seatSprites.${seatId}.${status}`);
            }
          }
        }
      }
    }
    const audio = d.audio as Record<string, unknown> | undefined;
    if (audio?.ambient) {
      const ambient = audio.ambient as Record<string, unknown>;
      if (ambient.src) assertSafePath(ambient.src, "audio.ambient.src");
    }
  }

  // Path safety: preview (shared by all renderers)
  if (d.preview != null) assertSafePath(d.preview, "preview");
  // iframe: entry is required
  if (isIframe) {
    if (typeof d.entry !== "string" || d.entry.length === 0) {
      throw new Error("iframe theme missing required 'entry' path");
    }
    assertSafePath(d.entry, "entry");
  }

  return data as ThemeManifest;
}

/**
 * Load the built-in default theme directly from /themes/default/ (no backend API).
 * This is the ultimate fallback — must never fail due to backend issues.
 */
async function loadBuiltinDefaultTheme(): Promise<ThemeManifest> {
  const res = await fetch(`/themes/${BUILTIN_DEFAULT_THEME_ID}/theme.json`);
  if (!res.ok) {
    throw new Error(`Failed to load built-in default theme: ${res.status}`);
  }
  const raw = await res.json();
  return validateManifest(raw);
}

/**
 * Load and validate a theme manifest by ID.
 * Fetches via backend API to avoid CORS issues with R2.
 * Falls back to built-in default theme on any error.
 */
export async function loadTheme(themeId: string): Promise<ThemeManifest> {
  // Built-in default: load directly from static assets, skip backend
  if (themeId === BUILTIN_DEFAULT_THEME_ID) {
    return loadBuiltinDefaultTheme();
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/themes/${encodeURIComponent(themeId)}/manifest`, {
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(`Failed to load theme "${themeId}": ${res.status} ${res.statusText}`);
    }
    const raw = await res.json();
    return validateManifest(raw);
  } catch (err) {
    console.error(`[theme-loader] Failed to load theme "${themeId}", falling back to default:`, err);
    return loadBuiltinDefaultTheme();
  }
}
