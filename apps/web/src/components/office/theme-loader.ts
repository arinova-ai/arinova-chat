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

  // entry: required
  if (typeof d.entry !== "string" || d.entry.length === 0) {
    throw new Error("Theme missing required 'entry' path");
  }
  assertSafePath(d.entry, "entry");

  // Path safety: preview
  if (d.preview != null) assertSafePath(d.preview, "preview");

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
