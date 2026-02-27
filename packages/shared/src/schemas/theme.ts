import { z } from "zod";

// ── Helpers ──────────────────────────────────────────────────────

/** Path must be relative, no ".." traversal, no protocol scheme. */
const safePathSchema = z.string().min(1).refine(
  (p) => !p.startsWith("/") && !p.startsWith("\\") && !p.includes("..") && !p.includes(":"),
  "Must be a relative path with no '..' traversal or protocol scheme",
);

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

const hexColorSchema = z.string().regex(
  /^(0x|#)?[0-9a-fA-F]{6,8}$/,
  "Must be a hex color (e.g. '#1a2b3c' or '0x1a2b3c')",
);

// ── Meta ─────────────────────────────────────────────────────────

const themeAuthorSchema = z.object({
  name: z.string().min(1).max(100),
  id: z.string().min(1).max(100),
});

// ── Canvas & Background ──────────────────────────────────────────

const canvasBackgroundSchema = z.object({
  image: safePathSchema,
  image2x: safePathSchema.optional(),
  mobile: safePathSchema.optional(),
  color: hexColorSchema.optional(),
});

const canvasConfigSchema = z.object({
  width: z.number().int().positive("canvas.width must be a positive number"),
  height: z.number().int().positive("canvas.height must be a positive number"),
  background: canvasBackgroundSchema,
});

// ── Viewport ─────────────────────────────────────────────────────

const viewportMobileSchema = z.object({
  defaultZoom: z.number().positive(),
  pinchToZoom: z.boolean(),
  doubleTapZoom: z.number().positive().optional(),
});

const viewportConfigSchema = z.object({
  minZoom: z.number().positive("viewport.minZoom must be positive"),
  maxZoom: z.number().positive("viewport.maxZoom must be positive"),
  defaultZoom: z.number().positive("viewport.defaultZoom must be positive"),
  panBounds: z.boolean(),
  mobile: viewportMobileSchema.optional(),
}).refine((v) => v.maxZoom >= v.minZoom, {
  message: "viewport.maxZoom must be >= viewport.minZoom",
});

// ── Layers ───────────────────────────────────────────────────────

const layerDefSchema = z.object({
  id: z.string().min(1),
  zIndex: z.number().int(),
});

// ── Zones & Seats ────────────────────────────────────────────────

const seatDirectionSchema = z.enum(["up", "down", "left", "right"]);

const seatDefSchema = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  direction: seatDirectionSchema,
  label: z.string().optional(),
});

const zoneBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive("zone bounds width must be positive"),
  height: z.number().positive("zone bounds height must be positive"),
});

const doorDefSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const zoneDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["work", "meeting", "lounge", "custom"]),
  bounds: zoneBoundsSchema,
  capacity: z.number().int().positive("zone capacity must be a positive integer"),
  seats: z.array(seatDefSchema).min(1, "Each zone must have at least 1 seat"),
  door: doorDefSchema.optional(),
});

// ── Furniture ────────────────────────────────────────────────────

const anchorPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const furnitureAnimationSchema = z.object({
  type: z.string().min(1),
  interval: z.number().positive().optional(),
  minOpacity: z.number().min(0).max(1).optional(),
  maxOpacity: z.number().min(0).max(1).optional(),
  duration: z.number().positive().optional(),
});

const furnitureDefSchema = z.object({
  id: z.string().min(1),
  sprite: safePathSchema,
  layer: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  anchor: anchorPointSchema.optional(),
  sortY: z.boolean().optional(),
  interactive: z.boolean().optional(),
  tooltip: z.string().optional(),
  animation: furnitureAnimationSchema.optional(),
});

// ── Characters ───────────────────────────────────────────────────

const characterHitAreaSchema = z.object({
  type: z.enum(["rect", "circle"]),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  radius: z.number().positive().optional(),
});

const nameTagConfigSchema = z.object({
  offsetY: z.number(),
  font: z.string().min(1),
  color: z.string().min(1),
  bgColor: z.string().min(1),
  padding: z.object({ x: z.number(), y: z.number() }),
  borderRadius: z.number().min(0),
  maxWidth: z.number().positive(),
});

const statusBadgeConfigSchema = z.object({
  offsetX: z.number(),
  offsetY: z.number(),
  radius: z.number().positive(),
  colors: z.record(z.string()),
});

const characterStateSchema = z.object({
  prefix: z.string().min(1),
  frames: z.number().int().positive(),
  fps: z.number().positive(),
  loop: z.boolean(),
});

const charactersConfigSchema = z.object({
  atlas: safePathSchema,
  frameWidth: z.number().int().positive(),
  frameHeight: z.number().int().positive(),
  anchor: anchorPointSchema,
  hitArea: characterHitAreaSchema,
  nameTag: nameTagConfigSchema,
  statusBadge: statusBadgeConfigSchema,
  states: z.record(characterStateSchema),
  directions: z.array(seatDirectionSchema),
});

// ── Effects ──────────────────────────────────────────────────────

const effectDefSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  sprite: safePathSchema,
  layer: z.string().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  opacity: z.number().min(0).max(1).optional(),
  blendMode: z.string().optional(),
  animation: furnitureAnimationSchema.optional(),
});

// ── Audio ────────────────────────────────────────────────────────

const audioConfigSchema = z.object({
  ambient: z.object({
    src: safePathSchema,
    volume: z.number().min(0).max(1),
    loop: z.boolean(),
  }).optional(),
});

// ── v3: Room Model ───────────────────────────────────────────────

const roomConfigSchema = z.object({
  model: safePathSchema,
  scale: vec3Schema.optional(),
});

// ── v3: Character Model ──────────────────────────────────────────

const characterConfigSchema = z.object({
  model: safePathSchema,
  idleModel: safePathSchema.optional(),
  scale: vec3Schema.optional(),
  height: z.number().positive().optional(),
  animations: z.record(z.string()).optional(),
  positions: z.record(vec3Schema).optional(),
});

// ── v3: Camera ───────────────────────────────────────────────────

const cameraConfigSchema = z.object({
  type: z.enum(["orthographic", "perspective"]).optional(),
  frustum: z.number().positive().optional(),
  zoom: z.number().positive().optional(),
  position: vec3Schema.optional(),
  target: vec3Schema.optional(),
});

// ── v3: Lighting ─────────────────────────────────────────────────

const lightingConfigSchema = z.object({
  ambient: z.object({
    color: z.string().min(1),
    intensity: z.number().min(0),
  }).optional(),
  directional: z.object({
    color: z.string().min(1),
    intensity: z.number().min(0),
    position: vec3Schema,
  }).optional(),
});

// ── Quality Modes ────────────────────────────────────────────────

const qualityRendererHintsSchema = z.object({
  pixelRatio: z.number().min(1).max(4).optional(),
  antialias: z.boolean().optional(),
  lighting: z.enum(["full", "ambient-only"]).optional(),
  anisotropy: z.boolean().optional(),
});

const qualityOverridesSchema = z.object({
  room: z.object({ model: safePathSchema }).optional(),
  character: z.object({ model: safePathSchema }).optional(),
  background: z.object({ image: safePathSchema }).optional(),
  renderer: qualityRendererHintsSchema.optional(),
});

const qualityConfigSchema = z.object({
  high: qualityOverridesSchema.optional(),
  performance: qualityOverridesSchema.optional(),
});

// ── Top-level Manifest ───────────────────────────────────────────

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

  canvas: canvasConfigSchema,
  viewport: viewportConfigSchema,
  layers: z.array(layerDefSchema).default([]),
  zones: z.array(zoneDefSchema).default([]),
  furniture: z.array(furnitureDefSchema).default([]),
  characters: charactersConfigSchema.optional(),
  effects: z.array(effectDefSchema).default([]),
  audio: audioConfigSchema.optional(),

  renderer: z.enum(["pixi", "threejs"]).optional(),

  // v3 fields
  room: roomConfigSchema.optional(),
  character: characterConfigSchema.optional(),
  camera: cameraConfigSchema.optional(),
  lighting: lightingConfigSchema.optional(),

  quality: qualityConfigSchema.optional(),
}).refine((m) => {
  // v2 (pixi) themes must have zones, layers, and characters
  const isV3 = m.renderer === "threejs" || !!m.room?.model;
  if (!isV3) {
    if (m.zones.length === 0) return false;
    if (m.layers.length === 0) return false;
    if (!m.characters) return false;
  }
  return true;
}, {
  message: "v2 (pixi) themes require non-empty zones, layers, and a characters config",
}).refine((m) => {
  // v3 (threejs) themes must have room.model
  const isV3 = m.renderer === "threejs";
  if (isV3 && !m.room?.model) return false;
  return true;
}, {
  message: "v3 (threejs) themes require room.model",
});

export type ThemeManifestInput = z.input<typeof themeManifestSchema>;
export type ThemeManifestOutput = z.output<typeof themeManifestSchema>;

// ── Resource Validation ──────────────────────────────────────────

/** Allowed image extensions for theme assets */
export const ALLOWED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

/** Allowed 3D model extensions */
export const ALLOWED_MODEL_EXTENSIONS = new Set(["glb", "gltf"]);

/** Maximum image dimension (width or height) */
export const MAX_IMAGE_DIMENSION = 4096;

/** Maximum file sizes in bytes */
export const MAX_FILE_SIZES = {
  image: 10 * 1024 * 1024,        // 10 MB per image
  glbHigh: 50 * 1024 * 1024,      // 50 MB for high-quality GLB
  glbPerformance: 20 * 1024 * 1024, // 20 MB for performance GLB
  audio: 5 * 1024 * 1024,         // 5 MB for audio
  themeJson: 256 * 1024,          // 256 KB for theme.json
  totalBundle: 200 * 1024 * 1024,  // 200 MB total theme bundle
} as const;

/** Required files in a theme bundle */
export const REQUIRED_THEME_FILES = ["theme.json", "preview.png"] as const;

export interface ThemeResourceError {
  file: string;
  message: string;
}

/**
 * Validate theme resource references from a parsed manifest.
 * Checks that all referenced asset paths have valid extensions and that
 * quality override paths are consistent.
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

  function checkModelPath(path: string | undefined, label: string): void {
    if (!path) return;
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_MODEL_EXTENSIONS.has(ext)) {
      errors.push({ file: path, message: `${label}: unsupported model format '.${ext}' — use glb or gltf` });
    }
  }

  // Background images
  checkImagePath(manifest.canvas.background.image, "canvas.background.image");
  checkImagePath(manifest.canvas.background.image2x, "canvas.background.image2x");
  checkImagePath(manifest.canvas.background.mobile, "canvas.background.mobile");

  // Preview
  checkImagePath(manifest.preview, "preview");

  // Furniture sprites
  for (const f of manifest.furniture) {
    checkImagePath(f.sprite, `furniture[${f.id}].sprite`);
  }

  // Effects sprites
  for (const e of manifest.effects) {
    checkImagePath(e.sprite, `effect[${e.id}].sprite`);
  }

  // v2 character atlas
  if (manifest.characters) {
    checkImagePath(manifest.characters.atlas, "characters.atlas");
  }

  // v3 room model
  if (manifest.room) {
    checkModelPath(manifest.room.model, "room.model");
  }

  // v3 character model
  if (manifest.character) {
    checkModelPath(manifest.character.model, "character.model");
    checkModelPath(manifest.character.idleModel, "character.idleModel");
  }

  // Quality overrides — if defined, both high and performance should have matching keys
  if (manifest.quality) {
    const q = manifest.quality;
    if (q.high?.room) checkModelPath(q.high.room.model, "quality.high.room.model");
    if (q.high?.character) checkModelPath(q.high.character.model, "quality.high.character.model");
    if (q.high?.background) checkImagePath(q.high.background.image, "quality.high.background.image");
    if (q.performance?.room) checkModelPath(q.performance.room.model, "quality.performance.room.model");
    if (q.performance?.character) checkModelPath(q.performance.character.model, "quality.performance.character.model");
    if (q.performance?.background) checkImagePath(q.performance.background.image, "quality.performance.background.image");
  }

  return errors;
}

/**
 * Collect all asset paths referenced in a manifest for existence checking.
 */
export function collectAssetPaths(manifest: ThemeManifestOutput): string[] {
  const paths: string[] = [];

  const add = (p: string | undefined) => { if (p) paths.push(p); };

  add(manifest.canvas.background.image);
  add(manifest.canvas.background.image2x);
  add(manifest.canvas.background.mobile);
  add(manifest.preview);

  if (manifest.characters) {
    add(manifest.characters.atlas);
  }
  for (const f of manifest.furniture) {
    add(f.sprite);
  }
  for (const e of manifest.effects) {
    add(e.sprite);
  }
  if (manifest.audio?.ambient) {
    add(manifest.audio.ambient.src);
  }
  if (manifest.room) {
    add(manifest.room.model);
  }
  if (manifest.character) {
    add(manifest.character.model);
    add(manifest.character.idleModel);
  }
  if (manifest.quality) {
    const q = manifest.quality;
    add(q.high?.room?.model);
    add(q.high?.character?.model);
    add(q.high?.background?.image);
    add(q.performance?.room?.model);
    add(q.performance?.character?.model);
    add(q.performance?.background?.image);
  }

  return [...new Set(paths)];
}
