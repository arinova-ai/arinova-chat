// ── Theme Manifest Type Definitions ──────────────────────────────
// Matches the theme.json schema from Alice's Office Theme Engine Spec.
// All coordinates are in canvas space (e.g. 1920×1080 for the default theme).

// ── Meta ────────────────────────────────────────────────────────

export interface ThemeAuthor {
  name: string;
  id: string;
}

// ── Canvas & Background ─────────────────────────────────────────

export interface CanvasBackground {
  image: string;
  image2x?: string;
  mobile?: string;
  /** Hex fallback color as string, e.g. "0x0f172a" */
  color?: string;
}

export interface CanvasConfig {
  width: number;
  height: number;
  background: CanvasBackground;
}

// ── Viewport ────────────────────────────────────────────────────

export interface ViewportMobile {
  defaultZoom: number;
  pinchToZoom: boolean;
  doubleTapZoom?: number;
}

export interface ViewportConfig {
  minZoom: number;
  maxZoom: number;
  defaultZoom: number;
  panBounds: boolean;
  mobile?: ViewportMobile;
}

// ── Layers ──────────────────────────────────────────────────────

export interface LayerDef {
  id: string;
  zIndex: number;
}

// ── Zones & Seats ───────────────────────────────────────────────

export type ZoneType = "work" | "meeting" | "lounge" | "custom";
export type SeatDirection = "up" | "down" | "left" | "right";

export interface SeatDef {
  id: string;
  x: number;
  y: number;
  direction: SeatDirection;
  label?: string;
}

export interface ZoneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DoorDef {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ZoneDef {
  id: string;
  name: string;
  type: ZoneType;
  bounds: ZoneBounds;
  capacity: number;
  seats: SeatDef[];
  door?: DoorDef;
}

// ── Furniture ───────────────────────────────────────────────────

export interface AnchorPoint {
  x: number;
  y: number;
}

export interface FurnitureAnimation {
  type: string;
  interval?: number;
  minOpacity?: number;
  maxOpacity?: number;
  duration?: number;
}

export interface FurnitureDef {
  id: string;
  sprite: string;
  layer: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchor?: AnchorPoint;
  sortY?: boolean;
  interactive?: boolean;
  tooltip?: string;
  animation?: FurnitureAnimation;
}

// ── Characters ──────────────────────────────────────────────────

export interface CharacterHitArea {
  type: "rect" | "circle";
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
}

export interface NameTagConfig {
  offsetY: number;
  font: string;
  color: string;
  bgColor: string;
  padding: { x: number; y: number };
  borderRadius: number;
  maxWidth: number;
}

export interface StatusBadgeConfig {
  offsetX: number;
  offsetY: number;
  radius: number;
  colors: Record<string, string>;
}

export interface CharacterState {
  prefix: string;
  frames: number;
  fps: number;
  loop: boolean;
}

export interface CharactersConfig {
  atlas: string;
  frameWidth: number;
  frameHeight: number;
  anchor: AnchorPoint;
  hitArea: CharacterHitArea;
  nameTag: NameTagConfig;
  statusBadge: StatusBadgeConfig;
  states: Record<string, CharacterState>;
  directions: SeatDirection[];
}

// ── Effects ─────────────────────────────────────────────────────

export interface EffectDef {
  id: string;
  type: string;
  sprite: string;
  layer: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  opacity?: number;
  blendMode?: string;
  animation?: FurnitureAnimation;
}

// ── Audio ───────────────────────────────────────────────────────

export interface AudioConfig {
  ambient?: {
    src: string;
    volume: number;
    loop: boolean;
  };
}

// ── Renderer ───────────────────────────────────────────────────

export type RendererType = "pixi" | "threejs";

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

  canvas: CanvasConfig;
  viewport: ViewportConfig;
  layers: LayerDef[];
  zones: ZoneDef[];
  furniture: FurnitureDef[];
  characters: CharactersConfig;
  effects: EffectDef[];
  audio?: AudioConfig;

  /** Which rendering engine to use. Defaults to "pixi" for backward compat. */
  renderer?: RendererType;
}
