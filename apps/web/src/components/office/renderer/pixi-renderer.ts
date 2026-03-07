import {
  Application, Container, Graphics, Text, TextStyle, Rectangle,
  Sprite as PixiSprite, Assets, Texture, AnimatedSprite,
} from "pixi.js";
import type { OfficeRenderer } from "./types";
import type { Agent, AgentStatus } from "../types";
import type { ThemeManifest, ZoneDef, ZoneType } from "../theme-types";

// ── Constants ────────────────────────────────────────────────────
const AVATAR_R = 28;
const SPRITE_DISPLAY_SIZE = 140;
const ZONE_BG = 0x1e293b;
const ZONE_BORDER = 0x334155;
const STATUS_LABELS: Record<AgentStatus, string> = {
  working: "Working",
  idle: "Idle",
  blocked: "Blocked",
  collaborating: "Collab",
};

const DEFAULT_STATUS_COLORS: Record<AgentStatus, number> = {
  working: 0x16a34a,
  idle: 0xf59e0b,
  blocked: 0xdc2626,
  collaborating: 0x2563eb,
};

// ── Reusable text styles ─────────────────────────────────────────
const LABEL_STYLE = new TextStyle({
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  fontWeight: "600",
  fill: 0x64748b,
  letterSpacing: 1,
});
const EMOJI_STYLE = new TextStyle({ fontFamily: "system-ui, sans-serif", fontSize: 22 });
const NAME_STYLE = new TextStyle({
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
  fontWeight: "600",
  fill: 0xe2e8f0,
});
const WARN_STYLE = new TextStyle({ fontSize: 16 });
const DOTS_STYLE = new TextStyle({ fontSize: 14, fill: 0x16a34a });

// ── Manifest helpers ─────────────────────────────────────────────

function parseStatusColors(manifest: ThemeManifest | null): Record<AgentStatus, number> {
  const c = manifest?.characters?.statusBadge?.colors;
  if (!c) return { ...DEFAULT_STATUS_COLORS };
  const parse = (hex: string | undefined, fallback: number) => {
    if (!hex) return fallback;
    const cleaned = hex.replace("#", "");
    const n = parseInt(cleaned, 16);
    return isNaN(n) ? fallback : n;
  };
  return {
    working: parse(c.working, DEFAULT_STATUS_COLORS.working),
    idle: parse(c.idle, DEFAULT_STATUS_COLORS.idle),
    blocked: parse(c.blocked, DEFAULT_STATUS_COLORS.blocked),
    collaborating: parse(c.collaborating, DEFAULT_STATUS_COLORS.collaborating),
  };
}

function parseBgColor(manifest: ThemeManifest): number {
  const raw = manifest.canvas.background.color;
  if (!raw) return 0x0f172a;
  return Number(raw) || 0x0f172a;
}

function computeScale(containerW: number, containerH: number, canvasW: number, canvasH: number) {
  const scaleX = containerW / canvasW;
  const scaleY = containerH / canvasH;
  const scale = Math.max(scaleX, scaleY);
  const offsetX = (containerW - canvasW * scale) / 2;
  const offsetY = (containerH - canvasH * scale) / 2;
  return { scale, offsetX, offsetY };
}

function statusToZoneType(status: AgentStatus): ZoneType {
  if (status === "collaborating") return "meeting";
  if (status === "idle") return "lounge";
  return "work";
}

function assignSeats(
  agents: Agent[],
  zones: ZoneDef[],
  canvasW?: number,
): Map<string, { x: number; y: number; seatId: string }> {
  const assignments = new Map<string, { x: number; y: number; seatId: string }>();
  if (zones.length === 0) return assignments;

  const usableZones = zones.filter((z) => z.seats.length > 0);
  if (usableZones.length === 0) return assignments;

  // Sort zones by distance from canvas center so agents are placed in the
  // most central (and therefore most visible on mobile) zones first.
  const cx = (canvasW ?? 1920) / 2;
  const sorted = [...usableZones].sort((a, b) => {
    const aCx = a.bounds.x + a.bounds.width / 2;
    const bCx = b.bounds.x + b.bounds.width / 2;
    return Math.abs(aCx - cx) - Math.abs(bCx - cx);
  });

  const grouped = new Map<string, Agent[]>();
  for (const agent of agents) {
    const targetType = statusToZoneType(agent.status);
    const zone = sorted.find((z) => z.type === targetType) ?? sorted[0];
    const list = grouped.get(zone.id) ?? [];
    list.push(agent);
    grouped.set(zone.id, list);
  }

  for (const [zoneId, zoneAgents] of grouped) {
    const zone = usableZones.find((z) => z.id === zoneId);
    if (!zone || zone.seats.length === 0) continue;
    for (let i = 0; i < zoneAgents.length; i++) {
      const seat = zone.seats[i % zone.seats.length];
      assignments.set(zoneAgents[i].id, { x: seat.x, y: seat.y, seatId: seat.id });
    }
  }

  return assignments;
}

// ── Legacy fallback (when manifest is null) ──────────────────────

function calcZonesFallback(cw: number, ch: number) {
  const pad = 20;
  const gap = 12;
  const totalH = ch - pad * 2 - gap;
  const topH = Math.floor(totalH * 0.65);
  const botH = totalH - topH;
  const totalW = cw - pad * 2 - gap;
  const workW = Math.floor(totalW * 0.55);
  const meetW = totalW - workW;
  return {
    work: { x: pad, y: pad, w: workW, h: topH },
    meeting: { x: pad + workW + gap, y: pad, w: meetW, h: topH },
    break: { x: pad, y: pad + topH + gap, w: cw - pad * 2, h: botH },
  };
}

function agentZoneFallback(agent: Agent): "work" | "meeting" | "break" {
  if (agent.status === "collaborating") return "meeting";
  if (agent.status === "idle") return "break";
  return "work";
}

function agentSlotPosFallback(idx: number, count: number, zone: { x: number; y: number; w: number; h: number }) {
  const minSpacing = AVATAR_R * 2 + 16;
  const maxH = Math.max(1, Math.floor((zone.w - 40) / minSpacing));
  if (count <= maxH) {
    const spacing = Math.min(90, (zone.w - 40) / Math.max(count, 1));
    const totalW = spacing * (count - 1);
    const startX = zone.x + zone.w / 2 - totalW / 2;
    return { x: startX + idx * spacing, y: zone.y + zone.h / 2 };
  }
  const cols = maxH;
  const row = Math.floor(idx / cols);
  const col = idx % cols;
  const rowCount = Math.min(count - row * cols, cols);
  const spacing = Math.min(90, (zone.w - 40) / Math.max(rowCount, 1));
  const totalW = spacing * (rowCount - 1);
  const startX = zone.x + zone.w / 2 - totalW / 2;
  const rowGap = AVATAR_R * 2 + 30;
  const totalRows = Math.ceil(count / cols);
  const startY = zone.y + zone.h / 2 - ((totalRows - 1) * rowGap) / 2;
  return { x: startX + col * spacing, y: startY + row * rowGap };
}

// ── Sprite sheet frame extraction ────────────────────────────────

interface SpriteFrameSet {
  idle: Texture[];
  working: Texture[];
  walkRight: Texture[];
  walkLeft: Texture[];
}

function extractFrames(
  sheetTexture: Texture,
  frameW: number,
  frameH: number,
): SpriteFrameSet {
  const getRow = (row: number, count: number): Texture[] => {
    const frames: Texture[] = [];
    for (let i = 0; i < count; i++) {
      const frame = new Rectangle(i * frameW, row * frameH, frameW, frameH);
      frames.push(new Texture({ source: sheetTexture.source, frame }));
    }
    return frames;
  };
  return {
    idle: getRow(0, 4),
    working: getRow(1, 4),
    walkRight: getRow(2, 4),
    walkLeft: getRow(3, 4),
  };
}

// ── Agent sprite types & helpers ─────────────────────────────────

interface AgentSprite {
  container: Container;
  animSprite?: AnimatedSprite;
  glow: Graphics;
  ring: Graphics;
  avatar: Graphics;
  emoji: Text;
  nameLabel: Text;
  statusLabel: Text;
  warnBadge: Text;
  dotsBadge: Text;
  hitArea: Graphics;
  usePixelArt: boolean;
}

function createAgentSprite(
  agent: Agent,
  onSelect: () => void,
  statusColors: Record<AgentStatus, number>,
  frameSets?: SpriteFrameSet,
): AgentSprite {
  const container = new Container();
  const usePixelArt = !!frameSets;

  const glow = new Graphics();
  glow.visible = false;
  container.addChild(glow);

  const ring = new Graphics();
  container.addChild(ring);

  const avatar = new Graphics();
  const emoji = new Text({ text: agent.emoji, style: EMOJI_STYLE });
  let animSprite: AnimatedSprite | undefined;

  if (usePixelArt && frameSets) {
    const initFrames = agent.status === "working" ? frameSets.working : frameSets.idle;
    animSprite = new AnimatedSprite(initFrames);
    animSprite.anchor.set(0.5, 1.0);
    animSprite.width = SPRITE_DISPLAY_SIZE;
    animSprite.height = SPRITE_DISPLAY_SIZE;
    animSprite.animationSpeed = agent.status === "working" ? 0.05 : 0.03;
    animSprite.play();
    container.addChild(animSprite);

    avatar.visible = false;
    emoji.visible = false;
  } else {
    const bgColor = parseInt(agent.color.replace("#", ""), 16);
    avatar.circle(0, 0, AVATAR_R);
    avatar.fill(bgColor);
    container.addChild(avatar);

    emoji.anchor.set(0.5);
    container.addChild(emoji);
  }

  const labelOffsetY = usePixelArt ? SPRITE_DISPLAY_SIZE / 2 + 6 : AVATAR_R + 14;

  const nameLabel = new Text({ text: agent.name, style: NAME_STYLE });
  nameLabel.anchor.set(0.5);
  nameLabel.y = labelOffsetY;
  container.addChild(nameLabel);

  const statusColor = statusColors[agent.status];
  const statusLabel = new Text({
    text: STATUS_LABELS[agent.status],
    style: new TextStyle({ fontFamily: "system-ui, sans-serif", fontSize: 10, fill: statusColor }),
  });
  statusLabel.anchor.set(0.5);
  statusLabel.y = labelOffsetY + 14;
  container.addChild(statusLabel);

  const hitR = usePixelArt ? SPRITE_DISPLAY_SIZE / 2 + 4 : AVATAR_R + 10;

  const warnBadge = new Text({ text: "\u26a0\ufe0f", style: WARN_STYLE });
  warnBadge.anchor.set(0.5);
  warnBadge.x = hitR - 8;
  warnBadge.y = -hitR + 8;
  warnBadge.visible = agent.status === "blocked";
  container.addChild(warnBadge);

  const dotsBadge = new Text({ text: "\u2022\u2022\u2022", style: DOTS_STYLE });
  dotsBadge.anchor.set(0.5);
  dotsBadge.x = hitR;
  dotsBadge.y = -8;
  dotsBadge.visible = agent.status === "working";
  container.addChild(dotsBadge);

  const hitAreaGfx = new Graphics();
  hitAreaGfx.circle(0, 0, hitR);
  hitAreaGfx.fill({ color: 0xffffff, alpha: 0.001 });
  hitAreaGfx.eventMode = "static";
  hitAreaGfx.cursor = "pointer";
  hitAreaGfx.on("pointerdown", onSelect);
  container.addChild(hitAreaGfx);

  return {
    container, animSprite, glow, ring, avatar, emoji,
    nameLabel, statusLabel, warnBadge, dotsBadge,
    hitArea: hitAreaGfx, usePixelArt,
  };
}

function updateAgentVisuals(
  sprite: AgentSprite,
  agent: Agent,
  isSelected: boolean,
  statusColors: Record<AgentStatus, number>,
  isWalking: boolean,
  frameSets?: SpriteFrameSet,
  walkDirX?: number,
) {
  const statusColor = statusColors[agent.status];
  const r = sprite.usePixelArt ? SPRITE_DISPLAY_SIZE / 2 + 4 : AVATAR_R;

  sprite.glow.clear();
  if (isSelected) {
    sprite.glow.circle(0, 0, r + 4);
    sprite.glow.fill({ color: statusColor, alpha: 0.2 });
    sprite.glow.visible = true;
  } else {
    sprite.glow.visible = false;
  }

  sprite.ring.clear();
  if (!sprite.usePixelArt) {
    sprite.ring.circle(0, 0, AVATAR_R + 3);
    sprite.ring.stroke({ width: 3, color: statusColor });
  }

  sprite.statusLabel.text = STATUS_LABELS[agent.status];
  sprite.statusLabel.style.fill = statusColor;

  if (sprite.usePixelArt && sprite.animSprite && frameSets) {
    let targetFrames: Texture[];
    let speed: number;
    if (isWalking) {
      targetFrames = (walkDirX !== undefined && walkDirX < 0) ? frameSets.walkLeft : frameSets.walkRight;
      speed = 0.13;
    } else if (agent.status === "working") {
      targetFrames = frameSets.working;
      speed = 0.05;
    } else {
      targetFrames = frameSets.idle;
      speed = 0.03;
    }
    if (sprite.animSprite.textures !== targetFrames) {
      sprite.animSprite.textures = targetFrames;
      sprite.animSprite.animationSpeed = speed;
      sprite.animSprite.play();
    }
  }

  if (isWalking) {
    sprite.container.alpha = sprite.usePixelArt ? 1.0 : 0.7;
    if (!sprite.usePixelArt) {
      sprite.dotsBadge.text = "\ud83d\udeb6";
      sprite.dotsBadge.visible = true;
    } else {
      sprite.dotsBadge.visible = false;
    }
    sprite.warnBadge.visible = false;
  } else {
    sprite.container.alpha = 1.0;
    sprite.warnBadge.visible = agent.status === "blocked";
    if (!sprite.usePixelArt) {
      sprite.dotsBadge.text = "\u2022\u2022\u2022";
      sprite.dotsBadge.visible = agent.status === "working";
    } else {
      sprite.dotsBadge.visible = false;
    }
  }
}

// ── PixiRenderer ────────────────────────────────────────────────

export class PixiRenderer implements OfficeRenderer {
  private app: Application | null = null;
  private manifest: ThemeManifest | null = null;
  private themeId?: string;
  private width = 0;
  private height = 0;

  // Layer containers
  private root: Container | null = null;
  private layerMap = new Map<string, Container>();
  private zoneContainer: Container | null = null;
  private agentContainer: Container | null = null;
  private linesGraphics: Graphics | null = null;

  // Agent state
  private sprites = new Map<string, AgentSprite>();
  private pos: Record<string, { x: number; y: number }> = {};
  private target: Record<string, { x: number; y: number }> = {};
  private agents: Agent[] = [];
  private selectedAgentId: string | null = null;

  // Animation / visuals
  private statusColors: Record<AgentStatus, number> = { ...DEFAULT_STATUS_COLORS };
  private frameSets?: SpriteFrameSet;
  private bgLoaded = false;
  private loadedAssetUrls: string[] = [];
  private walking = new Set<string>();
  private prevSeat = new Map<string, string>();
  private animId = 0;

  // Seat sprites (per-seat overlay system)
  private seatSpriteTextures = new Map<string, Map<string, Texture[]>>();
  private seatOverlays = new Map<string, { sprite: PixiSprite; currentStatus: string; frameIndex: number }>();
  private seatSpriteTimer = 0;
  private seatAgentMap = new Map<string, string>(); // seatId → agentId

  // Pan / zoom state
  private static MIN_SCALE = 0.5;
  private static MAX_SCALE = 3;
  private isMobile = false;
  private userScale = 1;
  private panX = 0;
  private panY = 0;
  private baseScale = 1;
  private baseOffsetX = 0;
  private baseOffsetY = 0;
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;
  private pinching = false;
  private pinchStartDist = 0;
  private pinchStartScale = 1;
  private pinchMidX = 0;
  private pinchMidY = 0;
  private canvasElement: HTMLCanvasElement | null = null;

  // Callback
  onAgentClick?: (agentId: string) => void;

  private get useFallback() {
    return this.manifest === null;
  }

  // ── init ──────────────────────────────────────────────────────

  private assetsBaseUrl = "/themes";

  async init(
    container: HTMLDivElement,
    width: number,
    height: number,
    manifest: ThemeManifest | null,
    themeId?: string,
    assetsBaseUrl?: string,
  ): Promise<void> {
    this.manifest = manifest;
    this.themeId = themeId;
    if (assetsBaseUrl) this.assetsBaseUrl = assetsBaseUrl;
    this.width = width;
    this.height = height;
    this.statusColors = parseStatusColors(manifest);

    const bgColor = manifest ? parseBgColor(manifest) : 0x0f172a;
    const app = new Application();

    await app.init({
      width,
      height,
      backgroundColor: bgColor,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    if (!app.canvas) throw new Error("PixiJS canvas init failed");

    container.appendChild(app.canvas);
    this.app = app;
    this.canvasElement = app.canvas as HTMLCanvasElement;
    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(0, 0, width, height);

    if (!this.useFallback && manifest) {
      await this.initThemeMode(app, manifest);
    } else {
      this.initFallbackMode(app);
    }

    // Set up pan/zoom for theme mode
    if (!this.useFallback && manifest) {
      this.isMobile = width < PixiRenderer.MOBILE_BREAKPOINT;
      const viewportCfg = manifest.viewport;
      if (this.isMobile && viewportCfg?.mobile?.defaultZoom) {
        this.userScale = viewportCfg.mobile.defaultZoom;
      } else if (viewportCfg?.defaultZoom) {
        this.userScale = viewportCfg.defaultZoom;
      }
      this.centerPan();
      this.applyRootTransform();
      this.bindPanEvents();
    }

    this.startAnimationLoop();
  }

  private async initThemeMode(app: Application, manifest: ThemeManifest) {
    const root = new Container();
    app.stage.addChild(root);
    this.root = root;

    const layers = [...manifest.layers].sort((a, b) => a.zIndex - b.zIndex);
    const map = new Map<string, Container>();
    for (const layer of layers) {
      const c = new Container();
      c.zIndex = layer.zIndex;
      c.label = layer.id;
      root.addChild(c);
      map.set(layer.id, c);
    }
    root.sortableChildren = true;
    this.layerMap = map;

    const { scale, offsetX, offsetY } = computeScale(
      this.width, this.height, manifest.canvas.width, manifest.canvas.height,
    );
    this.baseScale = scale;
    this.baseOffsetX = offsetX;
    this.baseOffsetY = offsetY;
    root.scale.set(scale);
    root.x = offsetX;
    root.y = offsetY;

    // Background image
    const bgLayer = map.get("background");
    const hasBgImage = !!manifest.canvas?.background?.image;
    if (bgLayer && hasBgImage && this.themeId) {
      try {
        const bgUrl = `${this.assetsBaseUrl}/${this.themeId}/${manifest.canvas.background.image}`;
        const texture = await Assets.load(bgUrl);
        this.loadedAssetUrls.push(bgUrl);
        const bgSprite = new PixiSprite(texture);
        bgSprite.width = manifest.canvas.width;
        bgSprite.height = manifest.canvas.height;
        bgLayer.addChild(bgSprite);
        this.bgLoaded = true;
      } catch (err) {
        console.warn("[PixiRenderer] Failed to load background image:", err);
        this.bgLoaded = false;
      }
    }

    // Load sprite sheet
    const hasAtlas = !!manifest.characters?.atlas;
    if (hasAtlas && this.themeId) {
      try {
        const atlasUrl = `${this.assetsBaseUrl}/${this.themeId}/${manifest.characters.atlas}`;
        const sheetTexture = await Assets.load(atlasUrl);
        this.loadedAssetUrls.push(atlasUrl);
        this.frameSets = extractFrames(
          sheetTexture,
          manifest.characters.frameWidth,
          manifest.characters.frameHeight,
        );
      } catch (err) {
        console.warn("[PixiRenderer] Failed to load sprite sheet:", err);
      }
    }

    // Load per-seat sprites (full-canvas overlays)
    const seatSprites = manifest.characters?.seatSprites;
    if (seatSprites && this.themeId) {
      await this.loadSeatSprites(seatSprites, manifest.canvas.width, manifest.canvas.height);
    }

    // Collaboration lines
    const effectsLayer = map.get("effects");
    if (effectsLayer) {
      const lines = new Graphics();
      effectsLayer.addChild(lines);
      this.linesGraphics = lines;
    }

    this.drawZones();
  }

  private initFallbackMode(app: Application) {
    const zoneContainer = new Container();
    const agentContainer = new Container();
    const linesGfx = new Graphics();
    app.stage.addChild(zoneContainer);
    app.stage.addChild(linesGfx);
    app.stage.addChild(agentContainer);
    this.zoneContainer = zoneContainer;
    this.agentContainer = agentContainer;
    this.linesGraphics = linesGfx;

    this.drawZones();
  }

  // ── seat sprites (per-seat overlay system) ───────────────────

  private async loadSeatSprites(
    seatSprites: Record<string, Record<string, string[]>>,
    canvasW: number,
    canvasH: number,
  ) {
    const charsLayer = this.layerMap.get("characters");
    if (!charsLayer) return;

    for (const [seatId, statusMap] of Object.entries(seatSprites)) {
      const texMap = new Map<string, Texture[]>();

      for (const [status, paths] of Object.entries(statusMap)) {
        const textures: Texture[] = [];
        for (const path of paths) {
          try {
            const url = `${this.assetsBaseUrl}/${this.themeId}/${path}`;
            const tex = await Assets.load(url);
            this.loadedAssetUrls.push(url);
            textures.push(tex);
          } catch (err) {
            console.warn(`[PixiRenderer] Failed to load seat sprite ${path}:`, err);
          }
        }
        if (textures.length > 0) texMap.set(status, textures);
      }

      this.seatSpriteTextures.set(seatId, texMap);

      // Create an overlay sprite (initially invisible)
      const firstTextures = texMap.values().next().value;
      if (firstTextures && firstTextures.length > 0) {
        const sprite = new PixiSprite(firstTextures[0]);
        sprite.width = canvasW;
        sprite.height = canvasH;
        sprite.visible = false;
        charsLayer.addChild(sprite);
        this.seatOverlays.set(seatId, { sprite, currentStatus: "", frameIndex: 0 });
      }
    }
  }

  private updateSeatOverlays() {
    if (this.seatSpriteTextures.size === 0) return;

    // Build seatId → agentId mapping from current assignments
    const newSeatAgentMap = new Map<string, string>();
    for (const [agentId, assignment] of this.seatAssignments) {
      newSeatAgentMap.set(assignment.seatId, agentId);
    }
    this.seatAgentMap = newSeatAgentMap;

    // Update each overlay
    for (const [seatId, overlay] of this.seatOverlays) {
      const agentId = this.seatAgentMap.get(seatId);
      if (!agentId) {
        overlay.sprite.visible = false;
        continue;
      }

      const agent = this.agents.find((a) => a.id === agentId);
      if (!agent) { overlay.sprite.visible = false; continue; }

      const texMap = this.seatSpriteTextures.get(seatId);
      if (!texMap) { overlay.sprite.visible = false; continue; }

      const status = agent.status;
      const textures = texMap.get(status) ?? texMap.get("idle");
      if (!textures || textures.length === 0) { overlay.sprite.visible = false; continue; }

      overlay.sprite.texture = textures[overlay.frameIndex % textures.length];
      overlay.currentStatus = status;
      overlay.sprite.visible = true;
      overlay.sprite.alpha = 1.0;
    }
  }

  // Store seat assignments for overlay lookup
  private seatAssignments = new Map<string, { x: number; y: number; seatId: string }>();

  // ── destroy ───────────────────────────────────────────────────

  destroy(): void {
    this.unbindPanEvents();
    cancelAnimationFrame(this.animId);

    for (const [, sprite] of this.sprites) {
      try {
        if (sprite.animSprite) sprite.animSprite.stop();
        sprite.container.destroy({ children: true });
      } catch { /* noop */ }
    }
    this.sprites.clear();

    for (const url of this.loadedAssetUrls) {
      try { Assets.unload(url); } catch { /* noop */ }
    }
    this.loadedAssetUrls = [];

    // Application.destroy(removeView=true) removes the canvas from the DOM
    // and destroys the stage + all children
    try { this.app?.destroy(true, { children: true }); } catch { /* noop */ }

    this.app = null;
    this.manifest = null;
    this.root = null;
    this.layerMap = new Map();
    this.zoneContainer = null;
    this.agentContainer = null;
    this.linesGraphics = null;
    this.frameSets = undefined;
    this.bgLoaded = false;
    this.agents = [];
    this.selectedAgentId = null;
    this.walking.clear();
    this.prevSeat.clear();
    this.pos = {};
    this.target = {};
    this.seatSpriteTextures.clear();
    this.seatOverlays.clear();
    this.seatAgentMap.clear();
    this.seatAssignments = new Map();
    this.canvasElement = null;
  }

  // ── resize ────────────────────────────────────────────────────

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    const app = this.app;
    if (!app?.renderer) return;
    app.renderer.resize(width, height);
    if (app.canvas) {
      (app.canvas as HTMLCanvasElement).style.width = `${width}px`;
      (app.canvas as HTMLCanvasElement).style.height = `${height}px`;
    }
    if (app.stage) {
      app.stage.hitArea = new Rectangle(0, 0, width, height);
    }

    if (!this.useFallback && this.manifest && this.root) {
      const { scale, offsetX, offsetY } = computeScale(
        width, height, this.manifest.canvas.width, this.manifest.canvas.height,
      );
      this.baseScale = scale;
      this.baseOffsetX = offsetX;
      this.baseOffsetY = offsetY;
      this.isMobile = width < PixiRenderer.MOBILE_BREAKPOINT;
      this.clampPan();
      this.applyRootTransform();
    } else {
      // Fallback mode: zone layout depends on screen size, must redraw.
      this.drawZones();
      this.computePositions();
    }
  }

  // ── updateAgents ──────────────────────────────────────────────

  updateAgents(agents: Agent[]): void {
    this.agents = agents;
    this.syncSprites();
    this.computePositions();
    this.updateSeatOverlays();
    this.hideSpritesBehindOverlays();
    this.updateAllVisuals();
  }

  /** Hide standard agent sprites for agents assigned to seats with overlay sprites. */
  private hideSpritesBehindOverlays() {
    if (this.seatSpriteTextures.size === 0) return;
    for (const [agentId, assignment] of this.seatAssignments) {
      if (this.seatOverlays.has(assignment.seatId)) {
        const sprite = this.sprites.get(agentId);
        if (sprite) sprite.container.visible = false;
      }
    }
  }

  // ── Pan / Zoom ──────────────────────────────────────────────

  private static MOBILE_BREAKPOINT = 768;
  private static MOBILE_DEFAULT_SCALE = 1.8;

  private applyRootTransform(): void {
    if (!this.root) return;
    const s = this.baseScale * this.userScale;
    this.root.scale.set(s);
    this.root.x = this.panX;
    this.root.y = this.panY;
  }

  private centerPan(): void {
    const scaledW = this.manifest!.canvas.width * this.baseScale * this.userScale;
    const scaledH = this.manifest!.canvas.height * this.baseScale * this.userScale;
    this.panX = (this.width - scaledW) / 2;
    this.panY = (this.height - scaledH) / 2;
    this.clampPan();
  }

  private clampPan(): void {
    if (!this.manifest) return;
    const scaledW = this.manifest.canvas.width * this.baseScale * this.userScale;
    const scaledH = this.manifest.canvas.height * this.baseScale * this.userScale;

    if (scaledW <= this.width) {
      this.panX = (this.width - scaledW) / 2;
    } else {
      this.panX = Math.min(0, Math.max(this.width - scaledW, this.panX));
    }

    if (scaledH <= this.height) {
      this.panY = (this.height - scaledH) / 2;
    } else {
      this.panY = Math.min(0, Math.max(this.height - scaledH, this.panY));
    }
  }

  private bindPanEvents(): void {
    const el = this.canvasElement;
    if (!el) return;
    el.addEventListener("touchstart", this.onPointerDown, { passive: false });
    el.addEventListener("touchmove", this.onPointerMove, { passive: false });
    el.addEventListener("touchend", this.onPointerUp);
    el.addEventListener("mousedown", this.onPointerDown);
    el.addEventListener("mousemove", this.onPointerMove);
    el.addEventListener("mouseup", this.onPointerUp);
    el.addEventListener("mouseleave", this.onPointerUp);
    el.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private unbindPanEvents(): void {
    const el = this.canvasElement;
    if (!el) return;
    el.removeEventListener("touchstart", this.onPointerDown);
    el.removeEventListener("touchmove", this.onPointerMove);
    el.removeEventListener("touchend", this.onPointerUp);
    el.removeEventListener("mousedown", this.onPointerDown);
    el.removeEventListener("mousemove", this.onPointerMove);
    el.removeEventListener("mouseup", this.onPointerUp);
    el.removeEventListener("mouseleave", this.onPointerUp);
    el.removeEventListener("wheel", this.onWheel);
  }

  private clientPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
    if ("touches" in e && e.touches.length > 0) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
  }

  private touchDist(e: TouchEvent): number {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  private onPointerDown = (e: MouseEvent | TouchEvent): void => {
    // Pinch start (2 fingers)
    if ("touches" in e && e.touches.length === 2) {
      e.preventDefault();
      this.dragging = false;
      this.pinching = true;
      this.pinchStartDist = this.touchDist(e);
      this.pinchStartScale = this.userScale;
      const rect = this.canvasElement!.getBoundingClientRect();
      const [a, b] = [e.touches[0], e.touches[1]];
      this.pinchMidX = (a.clientX + b.clientX) / 2 - rect.left;
      this.pinchMidY = (a.clientY + b.clientY) / 2 - rect.top;
      this.panStartX = this.panX;
      this.panStartY = this.panY;
      return;
    }

    // Single-finger drag (mobile) or mouse drag
    if (this.isMobile || e instanceof MouseEvent) {
      const pos = this.clientPos(e);
      this.dragging = true;
      this.dragStartX = pos.x;
      this.dragStartY = pos.y;
      this.panStartX = this.panX;
      this.panStartY = this.panY;
    }
  };

  private onPointerMove = (e: MouseEvent | TouchEvent): void => {
    // Pinch zoom
    if (this.pinching && "touches" in e && e.touches.length === 2) {
      e.preventDefault();
      if (this.pinchStartDist <= 0) return;
      const dist = this.touchDist(e);
      const ratio = dist / this.pinchStartDist;
      const viewportCfg = this.manifest?.viewport;
      const minScale = viewportCfg?.minZoom ?? PixiRenderer.MIN_SCALE;
      const maxScale = viewportCfg?.maxZoom ?? PixiRenderer.MAX_SCALE;
      const newScale = Math.min(maxScale, Math.max(minScale, this.pinchStartScale * ratio));

      const rect = this.canvasElement!.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      this.panX = midX - (this.pinchMidX - this.panStartX) * (newScale / this.pinchStartScale);
      this.panY = midY - (this.pinchMidY - this.panStartY) * (newScale / this.pinchStartScale);
      this.userScale = newScale;
      this.clampPan();
      this.applyRootTransform();
      return;
    }

    if (!this.dragging) return;
    e.preventDefault();
    const pos = this.clientPos(e);
    this.panX = this.panStartX + (pos.x - this.dragStartX);
    this.panY = this.panStartY + (pos.y - this.dragStartY);
    this.clampPan();
    this.applyRootTransform();
  };

  private onPointerUp = (e: MouseEvent | TouchEvent): void => {
    if (this.pinching) {
      if ("touches" in e && e.touches.length < 2) {
        this.pinching = false;
      }
      return;
    }
    this.dragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const viewportCfg = this.manifest?.viewport;
    const minScale = viewportCfg?.minZoom ?? PixiRenderer.MIN_SCALE;
    const maxScale = viewportCfg?.maxZoom ?? PixiRenderer.MAX_SCALE;
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(maxScale, Math.max(minScale, this.userScale * zoomFactor));

    // Zoom toward cursor
    const rect = this.canvasElement!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    this.panX = cx - (cx - this.panX) * (newScale / this.userScale);
    this.panY = cy - (cy - this.panY) * (newScale / this.userScale);
    this.userScale = newScale;
    this.clampPan();
    this.applyRootTransform();
  };

  // ── selectAgent ───────────────────────────────────────────────

  selectAgent(agentId: string | null): void {
    this.selectedAgentId = agentId;
    this.updateAllVisuals();
  }

  // ── Private: draw zones ───────────────────────────────────────

  private drawZones() {
    const manifest = this.manifest;

    if (!this.useFallback && manifest) {
      const bgLayer = this.layerMap.get("background");
      const uiLayer = this.layerMap.get("ui-overlay");
      if (!bgLayer || !uiLayer) return;

      if (!this.bgLoaded) bgLayer.removeChildren();
      uiLayer.removeChildren();

      for (const zone of manifest.zones) {
        const { x, y, width: zw, height: zh } = zone.bounds;

        if (!this.bgLoaded) {
          const g = new Graphics();
          g.roundRect(x, y, zw, zh, 12);
          g.fill(ZONE_BG);
          g.roundRect(x, y, zw, zh, 12);
          g.stroke({ width: 1, color: ZONE_BORDER });
          bgLayer.addChild(g);
        }

        const label = new Text({
          text: zone.name,
          style: new TextStyle({
            fontFamily: "system-ui, sans-serif",
            fontSize: 13,
            fontWeight: "600",
            fill: this.bgLoaded ? 0xffffff : 0x64748b,
            letterSpacing: 1,
            dropShadow: this.bgLoaded ? {
              alpha: 0.8,
              angle: Math.PI / 2,
              blur: 4,
              color: 0x000000,
              distance: 1,
            } : undefined,
          }),
        });
        label.anchor.set(0.5, 0);
        label.x = x + zw / 2;
        label.y = y + 8;
        if (this.bgLoaded) label.alpha = 0.85;
        uiLayer.addChild(label);
      }
    } else {
      const container = this.zoneContainer;
      if (!container) return;
      container.removeChildren();
      const zones = calcZonesFallback(this.width, this.height);
      const labels: Record<string, string> = {
        work: "WORK AREA",
        meeting: "MEETING ROOM",
        break: "BREAK AREA  \u2615",
      };
      for (const [key, zone] of Object.entries(zones)) {
        const g = new Graphics();
        g.roundRect(zone.x, zone.y, zone.w, zone.h, 12);
        g.fill(ZONE_BG);
        g.roundRect(zone.x, zone.y, zone.w, zone.h, 12);
        g.stroke({ width: 1, color: ZONE_BORDER });
        container.addChild(g);
        const label = new Text({ text: labels[key], style: LABEL_STYLE });
        label.x = zone.x + 12;
        label.y = zone.y + 8;
        container.addChild(label);
      }
    }
  }

  // ── Private: sync sprites ─────────────────────────────────────

  private syncSprites() {
    const agentContainer = this.useFallback
      ? this.agentContainer
      : this.layerMap.get("characters");
    if (!agentContainer) return;

    const currentIds = new Set(this.agents.map((a) => a.id));
    const sprites = this.sprites;

    // Remove stale sprites and their position/state records
    for (const [id, sprite] of sprites) {
      if (!currentIds.has(id)) {
        agentContainer.removeChild(sprite.container);
        sprite.container.destroy({ children: true });
        sprites.delete(id);
        delete this.pos[id];
        delete this.target[id];
        this.prevSeat.delete(id);
        this.walking.delete(id);
      }
    }

    // Create new
    for (const agent of this.agents) {
      if (!sprites.has(agent.id)) {
        const sprite = createAgentSprite(
          agent,
          () => this.onAgentClick?.(agent.id),
          this.statusColors,
          this.frameSets,
        );
        sprites.set(agent.id, sprite);
        agentContainer.addChild(sprite.container);
      }
    }
  }

  // ── Private: compute positions ────────────────────────────────

  private computePositions() {
    if (!this.useFallback && this.manifest) {
      const seatMap = assignSeats(this.agents, this.manifest.zones, this.manifest.canvas.width);

      // Store assignments for seat overlay lookup
      this.seatAssignments = seatMap;

      for (const [agentId, { x, y, seatId }] of seatMap) {
        const prevSeatId = this.prevSeat.get(agentId);
        if (prevSeatId !== undefined && prevSeatId !== seatId) {
          this.walking.add(agentId);
        }
        this.target[agentId] = { x, y };
        if (!this.pos[agentId]) {
          this.pos[agentId] = { x, y };
        }
        this.prevSeat.set(agentId, seatId);
      }
    } else {
      const zones = calcZonesFallback(this.width, this.height);
      const grouped: Record<string, Agent[]> = { work: [], meeting: [], break: [] };
      for (const a of this.agents) grouped[agentZoneFallback(a)].push(a);

      for (const [zoneKey, zoneAgents] of Object.entries(grouped)) {
        const zone = zones[zoneKey as keyof typeof zones];
        zoneAgents.forEach((agent, idx) => {
          const t = agentSlotPosFallback(idx, zoneAgents.length, zone);
          this.target[agent.id] = t;
          if (!this.pos[agent.id]) {
            this.pos[agent.id] = { ...t };
          }
        });
      }
    }
  }

  // ── Private: update all visuals ───────────────────────────────

  private updateAllVisuals() {
    for (const agent of this.agents) {
      const sprite = this.sprites.get(agent.id);
      if (sprite) {
        const isWalk = this.walking.has(agent.id);
        const walkDirX = isWalk
          ? (this.target[agent.id]?.x ?? 0) - (this.pos[agent.id]?.x ?? 0)
          : undefined;
        updateAgentVisuals(
          sprite, agent, agent.id === this.selectedAgentId,
          this.statusColors, isWalk, this.frameSets, walkDirX,
        );
      }
    }
  }

  // ── Private: animation loop ───────────────────────────────────

  private startAnimationLoop() {
    let lastSeatFrameToggle = performance.now();

    const tick = () => {
      // A/B frame toggle for seat sprites (every 2 seconds)
      const now = performance.now();
      if (now - lastSeatFrameToggle >= 2000 && this.seatOverlays.size > 0) {
        lastSeatFrameToggle = now;
        for (const [seatId, overlay] of this.seatOverlays) {
          overlay.frameIndex = (overlay.frameIndex + 1) % 2;
          const texMap = this.seatSpriteTextures.get(seatId);
          if (texMap) {
            const textures = texMap.get(overlay.currentStatus) ?? texMap.get("idle");
            if (textures && textures.length > 0) {
              overlay.sprite.texture = textures[overlay.frameIndex % textures.length];
            }
          }
        }
      }

      for (const [id, t] of Object.entries(this.target)) {
        const cur = this.pos[id];
        if (!cur) continue;
        cur.x += (t.x - cur.x) * 0.15;
        cur.y += (t.y - cur.y) * 0.15;

        if (this.walking.has(id)) {
          const dx = Math.abs(t.x - cur.x);
          const dy = Math.abs(t.y - cur.y);
          if (dx < 1 && dy < 1) {
            this.walking.delete(id);
            cur.x = t.x;
            cur.y = t.y;
            const sprite = this.sprites.get(id);
            const agent = this.agents.find((a) => a.id === id);
            if (sprite && agent) {
              updateAgentVisuals(
                sprite, agent, agent.id === this.selectedAgentId,
                this.statusColors, false, this.frameSets,
              );
            }
          }
        }

        const sprite = this.sprites.get(id);
        if (sprite) {
          sprite.container.x = cur.x;
          sprite.container.y = cur.y;
        }
      }

      // Collaboration lines
      const lines = this.linesGraphics;
      if (lines) {
        lines.clear();
        for (const agent of this.agents) {
          if (agent.status !== "collaborating" || !agent.collaboratingWith) continue;
          for (const partnerId of agent.collaboratingWith) {
            if (agent.id >= partnerId) continue;
            const a = this.pos[agent.id];
            const b = this.pos[partnerId];
            if (!a || !b) continue;
            lines.moveTo(a.x, a.y);
            lines.lineTo(b.x, b.y);
            lines.stroke({ width: 2, color: 0x2563eb, alpha: 0.5 });
          }
        }
      }

      this.animId = requestAnimationFrame(tick);
    };

    this.animId = requestAnimationFrame(tick);
  }
}
