import { z } from "zod";

// ── Helpers ──────────────────────────────────────────────────────

/** Path must be relative, no ".." traversal, no protocol scheme. */
const safePathSchema = z.string().min(1).refine(
  (p) => !p.startsWith("/") && !p.startsWith("\\") && !p.includes("..") && !p.includes(":"),
  "Must be a relative path with no '..' traversal or protocol scheme",
);

// ── Meta ─────────────────────────────────────────────────────────

const themeAuthorSchema = z.object({
  name: z.string().min(1).max(100),
  id: z.string().min(1).max(100),
});

// ── Top-level Manifest ───────────────────────────────────────────
//
// All themes are loaded as sandboxed iframes. The creator ships an
// `entry` JS/HTML file and any assets they want; the platform just
// loads the iframe and passes the SDK bridge.

export const themeManifestSchema = z.object({
  id: z.string().min(1).max(100).regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    "id must be kebab-case (e.g. 'my-cool-theme')",
  ),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver (e.g. '1.0.0')"),
  author: themeAuthorSchema,
  description: z.string().min(1).max(500),
  tags: z.array(z.string().min(1).max(50)).max(20),
  preview: safePathSchema,
  license: z.enum(["standard", "exclusive"]),

  /** Entry file loaded inside the sandboxed iframe. */
  entry: safePathSchema,

  /** Maximum number of agents the theme can display. */
  maxAgents: z.number().int().positive().optional(),
});

export type ThemeManifestInput = z.input<typeof themeManifestSchema>;
export type ThemeManifestOutput = z.output<typeof themeManifestSchema>;

// ── Resource Validation ──────────────────────────────────────────

/** Allowed image extensions for theme assets */
export const ALLOWED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

/** Maximum file sizes in bytes */
export const MAX_FILE_SIZES = {
  image: 10 * 1024 * 1024,        // 10 MB per image
  audio: 5 * 1024 * 1024,         // 5 MB for audio
  themeJson: 256 * 1024,          // 256 KB for theme.json
  totalBundle: 200 * 1024 * 1024,  // 200 MB total theme bundle
} as const;

/** Required files in a theme bundle */
export const REQUIRED_THEME_FILES = ["theme.json"] as const;

export interface ThemeResourceError {
  file: string;
  message: string;
}

/**
 * Validate theme resource references from a parsed manifest.
 */
export function validateThemeResources(manifest: ThemeManifestOutput): ThemeResourceError[] {
  const errors: ThemeResourceError[] = [];

  function checkImagePath(path: string | undefined, label: string): void {
    if (!path) return;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
      errors.push({ file: path, message: `${label}: unsupported image format '.${ext}' — use png, jpg, jpeg, or webp` });
    }
  }

  // Preview
  checkImagePath(manifest.preview, "preview");

  return errors;
}

/**
 * Collect all asset paths referenced in a manifest for existence checking.
 */
export function collectAssetPaths(manifest: ThemeManifestOutput): string[] {
  const paths: string[] = [];
  const add = (p: string | undefined) => { if (p) paths.push(p); };

  add(manifest.preview);
  add(manifest.entry);

  return [...new Set(paths)];
}
