// ── Theme Manifest Type Definitions ──────────────────────────────
// All themes use sandboxed iframes. The manifest provides metadata
// and points to an entry JS file that the platform loads.

// ── Meta ────────────────────────────────────────────────────────

export interface ThemeAuthor {
  name: string;
  id: string;
}

// ── Top-level Manifest ──────────────────────────────────────────

export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  author: ThemeAuthor;
  description: string;
  tags: string[];
  preview: string;
  license: "standard" | "exclusive";

  /** Entry JS file loaded inside the sandboxed iframe. */
  entry: string;

  /** Maximum number of agents the theme can display. */
  maxAgents?: number;
}
